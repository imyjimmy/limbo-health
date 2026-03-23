import fs from 'node:fs/promises';
import process from 'node:process';
import { closePool, query } from './db.js';
import { config } from './config.js';
import {
  extractPdfFormUnderstanding,
  preparePdfFormUnderstandingExtraction,
} from './extractors/pdfFormUnderstandingExtractor.js';
import { parsePdfDocument } from './parsers/pdfParser.js';
import { insertExtractionRun } from './repositories/workflowRepository.js';
import { resolveSourceDocumentPath } from './utils/sourceDocumentStorage.js';
import { getCliIntegerOptionValue, getCliOptionValue } from './utils/cliArgs.js';
import { PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME } from './utils/pdfFormUnderstanding.js';
import {
  DEFAULT_ESTIMATED_OUTPUT_TOKENS,
  DEFAULT_MAX_INPUT_TOKENS,
  DEFAULT_PROMPT_PROFILE,
} from './utils/pdfFormUnderstandingPrompt.js';

const DEFAULT_TPM_BUDGET = 25000;
const RETRY_PROFILES = {
  safe: { maxAttempts: 4, baseDelayMs: 5000, maxDelayMs: 30000 },
  standard: { maxAttempts: 3, baseDelayMs: 2500, maxDelayMs: 20000 },
  aggressive: { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 10000 },
};

function usage() {
  console.log(
    [
      'Usage:',
      '  node src/backfillPdfFormUnderstanding.js [--state TX] [--limit 50] [--force]',
      '    [--dry-run] [--prompt-profile compact] [--max-input-tokens 12000]',
      '    [--tpm-budget 25000] [--retry-profile safe] [--estimated-output-tokens 1200]',
      '',
      'Backfills pdf_form_understanding_openai extraction runs for tracked cached PDFs.',
      'Use --dry-run to estimate prompt sizes without calling OpenAI.',
    ].join('\n'),
  );
}

function normalizeRetryProfile(value) {
  if (value === 'safe' || value === 'standard' || value === 'aggressive') {
    return value;
  }
  return 'safe';
}

function getCliFloatOptionValue(args, flag) {
  const raw = getCliOptionValue(args, flag);
  if (raw == null) return null;

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid value for --${flag}: ${raw}`);
  }

  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TokenBudgetWindow {
  constructor(limit, windowMs = 60_000) {
    this.limit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;
    this.windowMs = windowMs;
    this.entries = [];
  }

  prune(now = Date.now()) {
    this.entries = this.entries.filter((entry) => now - entry.timestamp < this.windowMs);
  }

  async reserve(tokens) {
    if (!this.limit) {
      return { waitedMs: 0, overLimit: false };
    }

    const normalizedTokens = Math.max(1, Math.floor(tokens));
    if (normalizedTokens > this.limit) {
      return { waitedMs: 0, overLimit: true };
    }

    let waitedMs = 0;

    while (true) {
      const now = Date.now();
      this.prune(now);
      const used = this.entries.reduce((sum, entry) => sum + entry.tokens, 0);
      if (used + normalizedTokens <= this.limit) {
        this.entries.push({ timestamp: now, tokens: normalizedTokens });
        return { waitedMs, overLimit: false };
      }

      const earliest = this.entries[0];
      const waitMs = Math.max(this.windowMs - (now - earliest.timestamp) + 50, 250);
      await sleep(waitMs);
      waitedMs += waitMs;
    }
  }
}

function calculateRetryDelay(profile, attemptIndex) {
  const settings = RETRY_PROFILES[profile];
  const exponentialDelay = Math.min(
    settings.baseDelayMs * 2 ** Math.max(0, attemptIndex),
    settings.maxDelayMs,
  );
  const jitterMs = Math.min(750, Math.round(exponentialDelay * 0.15));
  return exponentialDelay + jitterMs;
}

function buildFailureRecord(document, error) {
  const message = error instanceof Error ? error.message : 'Unknown backfill error.';
  return {
    source_document_id: document.id,
    state: document.state,
    system_name: document.system_name,
    storage_path: document.storage_path,
    error: message,
  };
}

function ensureOpenAiConfigured() {
  if (!config.openai.apiKey || !config.openai.pdfFormUnderstandingModel) {
    throw new Error(
      'OpenAI PDF understanding is not configured. Set OPENAI_API_KEY and OPENAI_PDF_FORM_MODEL before backfilling.',
    );
  }
}

async function listTrackedPdfDocuments({ state = null, limit = null, force = false }) {
  const params = [PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME];
  const where = [
    `sd.source_type = 'pdf'`,
    `sd.storage_path is not null`,
    `sd.storage_path <> ''`,
  ];

  if (state) {
    params.push(String(state).trim().toUpperCase());
    where.push(`hs.state = $${params.length}`);
  }

  if (!force) {
    where.push(`latest.id is null`);
  }

  let limitClause = '';
  if (Number.isInteger(limit) && limit > 0) {
    params.push(limit);
    limitClause = `limit $${params.length}`;
  }

  const result = await query(
    `select
       sd.id,
       sd.source_url,
       sd.title,
       sd.storage_path,
       hs.system_name,
       hs.state,
       f.facility_name,
       latest.id as latest_run_id,
       latest.status as latest_run_status
     from source_documents sd
     join hospital_systems hs on hs.id = sd.hospital_system_id
     left join facilities f on f.id = sd.facility_id
     left join lateral (
       select er.id, er.status
       from extraction_runs er
       where er.source_document_id = sd.id
         and er.extractor_name = $1
       order by er.created_at desc
       limit 1
     ) latest on true
     where ${where.join(' and ')}
     order by hs.state asc, hs.system_name asc, sd.created_at asc
     ${limitClause}`,
    params,
  );

  return result.rows;
}

function estimateCostUsd({ inputTokens, outputTokens, inputCostPerMillion, outputCostPerMillion }) {
  if (
    !Number.isFinite(inputCostPerMillion) ||
    inputCostPerMillion < 0 ||
    !Number.isFinite(outputCostPerMillion) ||
    outputCostPerMillion < 0
  ) {
    return null;
  }

  return (
    (inputTokens / 1_000_000) * inputCostPerMillion +
    (outputTokens / 1_000_000) * outputCostPerMillion
  );
}

function buildPartialExtractionFromPromptBudget(requestPlan, reason) {
  return {
    extractorName: PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME,
    extractorVersion: 'v1',
    status: 'partial',
    structuredOutput: {
      form_understanding: {
        supported: false,
        mode: null,
        template_id: null,
        confidence: null,
        questions: [],
      },
      metadata: {
        reason,
        ...requestPlan.promptMetadata,
      },
    },
  };
}

async function runExtractionAttempt({
  document,
  parsedPdf,
  promptProfile,
  maxInputTokens,
  estimatedOutputTokens,
  tokenBudgetWindow,
  retryProfile,
}) {
  const retrySettings = RETRY_PROFILES[retryProfile];
  let currentPromptProfile = promptProfile;
  let currentMaxInputTokens = maxInputTokens;
  let lastExtraction = null;
  let retriesUsed = 0;
  let waitedForTpmMs = 0;

  for (let attemptIndex = 0; attemptIndex < retrySettings.maxAttempts; attemptIndex += 1) {
    const requestPlan = preparePdfFormUnderstandingExtraction({
      parsedPdf,
      hospitalSystemName: document.system_name,
      facilityName: document.facility_name || null,
      formName: document.title || 'Authorization Form',
      sourceUrl: document.source_url,
      promptProfile: currentPromptProfile,
      maxInputTokens: currentMaxInputTokens,
    });

    const estimatedTotalTokens =
      requestPlan.promptMetadata.estimated_input_tokens + estimatedOutputTokens;
    const reservation = await tokenBudgetWindow.reserve(estimatedTotalTokens);
    waitedForTpmMs += reservation.waitedMs;

    if (reservation.overLimit) {
      return {
        extraction: buildPartialExtractionFromPromptBudget(requestPlan, 'tpm_budget_exceeded'),
        retriesUsed,
        waitedForTpmMs,
      };
    }

    lastExtraction = await extractPdfFormUnderstanding({
      parsedPdf,
      hospitalSystemName: document.system_name,
      facilityName: document.facility_name || null,
      formName: document.title || 'Authorization Form',
      sourceUrl: document.source_url,
      promptProfile: currentPromptProfile,
      maxInputTokens: currentMaxInputTokens,
      preparedRequest: requestPlan,
    });

    const metadata = lastExtraction?.structuredOutput?.metadata || {};
    if (lastExtraction.status !== 'failed' || metadata.retryable !== true) {
      return {
        extraction: lastExtraction,
        retriesUsed,
        waitedForTpmMs,
      };
    }

    if (attemptIndex === retrySettings.maxAttempts - 1) {
      break;
    }

    retriesUsed += 1;
    const retryDelay = calculateRetryDelay(retryProfile, attemptIndex);
    await sleep(retryDelay);
  }

  return {
    extraction: lastExtraction,
    retriesUsed,
    waitedForTpmMs,
  };
}

export async function backfillPdfFormUnderstanding({
  state = null,
  limit = null,
  force = false,
  dryRun = false,
  promptProfile = DEFAULT_PROMPT_PROFILE,
  maxInputTokens = DEFAULT_MAX_INPUT_TOKENS,
  tpmBudget = DEFAULT_TPM_BUDGET,
  retryProfile = 'safe',
  estimatedOutputTokens = DEFAULT_ESTIMATED_OUTPUT_TOKENS,
  budgetUsd = null,
  inputCostPerMillion = null,
  outputCostPerMillion = null,
}) {
  if (!dryRun) {
    ensureOpenAiConfigured();
  }

  const documents = await listTrackedPdfDocuments({ state, limit, force });
  const normalizedRetryProfile = normalizeRetryProfile(retryProfile);
  const tokenBudgetWindow = new TokenBudgetWindow(tpmBudget);
  const summary = {
    requested_state: state || null,
    force,
    dry_run: dryRun,
    limit: limit ?? null,
    prompt_profile: promptProfile,
    max_input_tokens: maxInputTokens,
    tpm_budget: tpmBudget,
    retry_profile: normalizedRetryProfile,
    estimated_output_tokens: estimatedOutputTokens,
    candidates: documents.length,
    inserted_runs: 0,
    success: 0,
    partial: 0,
    failed: 0,
    skipped_missing_file: 0,
    stopped_for_budget: false,
    retry_count: 0,
    total_waited_for_tpm_ms: 0,
    estimated_input_tokens: 0,
    estimated_output_tokens_total: 0,
    estimated_cost_usd: 0,
    prompt_over_budget_documents: 0,
    max_estimated_input_tokens: 0,
    failures: [],
  };

  for (const document of documents) {
    const resolvedPath = resolveSourceDocumentPath(document.storage_path);

    try {
      const buffer = await fs.readFile(resolvedPath);
      const parsedPdf = await parsePdfDocument({ buffer, filePath: resolvedPath });
      const requestPlan = preparePdfFormUnderstandingExtraction({
        parsedPdf,
        hospitalSystemName: document.system_name,
        facilityName: document.facility_name || null,
        formName: document.title || 'Authorization Form',
        sourceUrl: document.source_url,
        promptProfile,
        maxInputTokens,
      });

      const estimatedInputTokens = requestPlan.promptMetadata.estimated_input_tokens;
      summary.max_estimated_input_tokens = Math.max(
        summary.max_estimated_input_tokens,
        estimatedInputTokens,
      );
      if (requestPlan.promptMetadata.prompt_over_budget) {
        summary.prompt_over_budget_documents += 1;
      }
      const estimatedCostUsd =
        estimateCostUsd({
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          inputCostPerMillion,
          outputCostPerMillion,
        }) || 0;

      if (
        Number.isFinite(budgetUsd) &&
        budgetUsd >= 0 &&
        summary.estimated_cost_usd + estimatedCostUsd > budgetUsd
      ) {
        summary.stopped_for_budget = true;
        break;
      }

      summary.estimated_input_tokens += estimatedInputTokens;
      summary.estimated_output_tokens_total += estimatedOutputTokens;
      summary.estimated_cost_usd += estimatedCostUsd;

      if (dryRun) {
        continue;
      }

      const { extraction, retriesUsed, waitedForTpmMs } = await runExtractionAttempt({
        document,
        parsedPdf,
        promptProfile,
        maxInputTokens,
        estimatedOutputTokens,
        tokenBudgetWindow,
        retryProfile: normalizedRetryProfile,
      });

      summary.retry_count += retriesUsed;
      summary.total_waited_for_tpm_ms += waitedForTpmMs;

      await insertExtractionRun({
        sourceDocumentId: document.id,
        extractorName: extraction.extractorName,
        extractorVersion: extraction.extractorVersion,
        status: extraction.status,
        structuredOutput: extraction.structuredOutput,
      });

      summary.inserted_runs += 1;
      summary[extraction.status] += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown backfill error.';
      if (/ENOENT/i.test(message)) {
        summary.skipped_missing_file += 1;
      } else {
        summary.failed += 1;
      }
      summary.failures.push(buildFailureRecord(document, error));
    }
  }

  summary.average_estimated_input_tokens =
    summary.candidates > 0 ? Math.round(summary.estimated_input_tokens / summary.candidates) : 0;

  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return;
  }

  const summary = await backfillPdfFormUnderstanding({
    state: getCliOptionValue(args, 'state'),
    limit: getCliIntegerOptionValue(args, 'limit'),
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run'),
    promptProfile: getCliOptionValue(args, 'prompt-profile') || DEFAULT_PROMPT_PROFILE,
    maxInputTokens: getCliIntegerOptionValue(args, 'max-input-tokens') || DEFAULT_MAX_INPUT_TOKENS,
    tpmBudget: getCliIntegerOptionValue(args, 'tpm-budget') || DEFAULT_TPM_BUDGET,
    retryProfile: getCliOptionValue(args, 'retry-profile') || 'safe',
    estimatedOutputTokens:
      getCliIntegerOptionValue(args, 'estimated-output-tokens') || DEFAULT_ESTIMATED_OUTPUT_TOKENS,
    budgetUsd: getCliFloatOptionValue(args, 'budget-usd'),
    inputCostPerMillion: getCliFloatOptionValue(args, 'input-cost-per-1m'),
    outputCostPerMillion: getCliFloatOptionValue(args, 'output-cost-per-1m'),
  });

  console.log('PDF form-understanding backfill finished:', JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('PDF form-understanding backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
