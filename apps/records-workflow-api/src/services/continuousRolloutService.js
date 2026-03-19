import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveFromServiceRoot } from '../config.js';
import { runCrawl } from './crawlService.js';
import {
  buildNationalRosterCoverageReport,
  buildDefaultAuditOutputPath,
  loadOrBuildRoster
} from './nationalRosterAuditService.js';
import { generateStateSeedCandidates } from './generatedSeedService.js';
import { importGeneratedSeeds } from './generatedSeedImportService.js';
import { isRolloutStateCode, normalizeStateCode } from '../utils/states.js';

export function buildDefaultRolloutOutputPath() {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `logs/reports/${dateStamp}-continuous-rollout.json`;
}

function unique(values) {
  return Array.from(new Set(values));
}

export function determineRolloutStates({
  roster,
  currentAudit,
  state = null,
  allRemaining = false,
  maxStates = null
} = {}) {
  const normalizedState = normalizeStateCode(state);
  if (normalizedState) {
    if (!isRolloutStateCode(normalizedState)) {
      return [];
    }
    return [normalizedState];
  }

  if (!allRemaining) {
    return [];
  }

  const remediationStates = (currentAudit?.state_audits || [])
    .filter((audit) => isRolloutStateCode(audit.state))
    .filter((audit) => audit.coverage.missing_hospitals > 0)
    .sort((left, right) => {
      return (
        left.coverage.missing_hospitals - right.coverage.missing_hospitals ||
        left.state.localeCompare(right.state)
      );
    })
    .map((audit) => audit.state);

  const crawledStates = new Set((currentAudit?.state_audits || []).map((audit) => audit.state));
  const remainingStates = (roster?.state_summaries || [])
    .filter((summary) => isRolloutStateCode(summary.state))
    .filter((summary) => summary.unique_hospital_identities > 0)
    .filter((summary) => !crawledStates.has(summary.state))
    .sort((left, right) => {
      return (
        left.unique_hospital_identities - right.unique_hospital_identities ||
        left.state.localeCompare(right.state)
      );
    })
    .map((summary) => summary.state);

  const combined = unique([...remediationStates, ...remainingStates]);
  return combined.slice(0, maxStates || combined.length);
}

function buildStatesByVerdict(stateAudits = []) {
  const result = {
    ready: [],
    review: [],
    not_ready: []
  };

  for (const audit of stateAudits) {
    result[audit.recommendation]?.push(audit.state);
  }

  return result;
}

function aggregateGeneratedConfidenceDistribution(stateRuns = []) {
  return stateRuns.reduce(
    (summary, stateRun) => {
      const confidenceSummary = stateRun.generated?.confidence_summary || {};
      summary.high += confidenceSummary.high || 0;
      summary.medium += confidenceSummary.medium || 0;
      summary.low += confidenceSummary.low || 0;
      return summary;
    },
    { high: 0, medium: 0, low: 0 }
  );
}

function buildRecommendedFollowUpOrder(stateAudits = []) {
  return [...stateAudits]
    .sort((left, right) => {
      return (
        right.coverage.missing_hospitals - left.coverage.missing_hospitals ||
        right.db.low_confidence_rate - left.db.low_confidence_rate ||
        left.state.localeCompare(right.state)
      );
    })
    .slice(0, 15)
    .map((audit) => ({
      state: audit.state,
      verdict: audit.recommendation,
      missing_hospitals: audit.coverage.missing_hospitals,
      low_confidence_rate: audit.db.low_confidence_rate
    }));
}

function buildStateReportCards(stateRuns = [], finalAudit = null) {
  const auditByState = new Map((finalAudit?.state_audits || []).map((audit) => [audit.state, audit]));

  return stateRuns.map((stateRun) => {
    const audit = stateRun.audit || auditByState.get(stateRun.state) || null;

    return {
      state: stateRun.state,
      generated_seed_systems: stateRun.generated?.generated_systems || 0,
      generated_seed_confidence: stateRun.generated?.confidence_summary || { high: 0, medium: 0, low: 0 },
      imported_systems: stateRun.imported?.seed_summary?.systems || 0,
      imported_facilities: stateRun.imported?.seed_summary?.facilities || 0,
      imported_seeds: stateRun.imported?.seed_summary?.seeds || 0,
      crawl_failures: stateRun.crawl?.failed || 0,
      crawl_failure_sample: (stateRun.crawl?.details || []).filter((detail) => detail.status === 'failed').slice(0, 10),
      audit_verdict: audit?.recommendation || null,
      official_hospital_identities: audit?.coverage?.official_unique_hospital_identities || 0,
      exact_match_rate: audit?.coverage?.exact_match_rate || 0,
      weighted_match_rate: audit?.coverage?.weighted_match_rate || 0,
      likely_matches: audit?.coverage?.likely_matches || 0,
      possible_matches: audit?.coverage?.possible_matches || 0,
      missing_hospitals: audit?.coverage?.missing_hospitals || 0,
      raw_pdf_file_count: audit?.raw_storage?.raw_pdf_file_count || 0,
      raw_pdf_parse_errors: audit?.raw_pdf_snapshot?.parse_error_count || 0,
      source_document_count: audit?.db?.source_document_count || 0,
      workflow_count: audit?.db?.workflow_count || 0,
      low_confidence_workflows: audit?.db?.low_confidence_count || 0,
      low_confidence_rate: audit?.db?.low_confidence_rate || 0,
      errors: stateRun.errors
    };
  });
}

export function buildContinuousRolloutSummary(stateRuns = [], finalAudit = null) {
  const stateAudits = finalAudit?.state_audits || [];

  return {
    processed_states: stateRuns.length,
    states_by_verdict: buildStatesByVerdict(stateAudits),
    largest_missing_hospital_backlogs: [...stateAudits]
      .sort((left, right) => right.coverage.missing_hospitals - left.coverage.missing_hospitals)
      .slice(0, 10)
      .map((audit) => ({
        state: audit.state,
        missing_hospitals: audit.coverage.missing_hospitals,
        verdict: audit.recommendation
      })),
    highest_low_confidence_rates: [...stateAudits]
      .sort((left, right) => right.db.low_confidence_rate - left.db.low_confidence_rate)
      .slice(0, 10)
      .map((audit) => ({
        state: audit.state,
        low_confidence_rate: audit.db.low_confidence_rate,
        workflow_count: audit.db.workflow_count
      })),
    generated_seed_confidence_distribution: aggregateGeneratedConfidenceDistribution(stateRuns),
    recommended_follow_up_order: buildRecommendedFollowUpOrder(stateAudits)
  };
}

export async function runContinuousRollout({
  state = null,
  allRemaining = false,
  rosterFilePath = null,
  outputPath = buildDefaultRolloutOutputPath(),
  dryRun = false,
  maxStates = null,
  minimumConfidence = 'high',
  generateConcurrency = null,
  generateFn = generateStateSeedCandidates,
  importFn = importGeneratedSeeds,
  crawlFn = runCrawl,
  auditFn = buildNationalRosterCoverageReport
} = {}) {
  const { roster, resolvedRosterFilePath } = await loadOrBuildRoster(rosterFilePath || undefined);
  const normalizedState = normalizeStateCode(state);
  const baselineAudit =
    normalizedState && !allRemaining
      ? {
          state_audits: [],
          overall_decision: null
        }
      : await auditFn({
          rosterFilePath: resolvedRosterFilePath,
          includeDbOnlyStates: true
        });

  const targetStates = normalizedState
    ? [normalizedState]
    : determineRolloutStates({
        roster,
        currentAudit: baselineAudit,
        allRemaining,
        maxStates
      });

  const stateRuns = [];

  for (const currentState of targetStates) {
    const stateRun = {
      state: currentState,
      generated: null,
      imported: null,
      crawl: null,
      audit: null,
      errors: []
    };

    try {
      stateRun.generated = await generateFn({
        state: currentState,
        roster,
        dryRun,
        ...(generateConcurrency ? { concurrency: generateConcurrency } : {})
      });
    } catch (error) {
      stateRun.errors.push({
        stage: 'generate',
        message: error.message
      });
    }

    if (stateRun.generated) {
      try {
        stateRun.imported = await importFn({
          state: currentState,
          dryRun,
          generatedSystems: stateRun.generated.entries,
          minimumConfidence
        });
      } catch (error) {
        stateRun.errors.push({
          stage: 'import',
          message: error.message
        });
      }
    } else {
      stateRun.imported = {
        state: currentState,
        imported: false,
        skipped: true,
        reason: 'generation_failed'
      };
    }

    try {
      stateRun.crawl = dryRun
        ? {
            status: 'dry_run',
            systems: 0,
            crawled: 0,
            extracted: 0,
            failed: 0,
            details: []
          }
        : await crawlFn({ state: currentState });
    } catch (error) {
      stateRun.errors.push({
        stage: 'crawl',
        message: error.message
      });
    }

    try {
      const auditReport = await auditFn({
        rosterFilePath: resolvedRosterFilePath,
        states: [currentState],
        includeDbOnlyStates: true
      });
      stateRun.audit = auditReport.state_audits[0] || null;
    } catch (error) {
      stateRun.errors.push({
        stage: 'audit',
        message: error.message
      });
    }

    stateRuns.push(stateRun);
  }

  const finalAudit = await auditFn({
    rosterFilePath: resolvedRosterFilePath,
    states: normalizedState && !allRemaining ? targetStates : null,
    includeDbOnlyStates: true
  });

  const report = {
    generated_at: new Date().toISOString(),
    dry_run: dryRun,
    roster_file_path: resolvedRosterFilePath,
    baseline_audit_output_hint: resolveFromServiceRoot(buildDefaultAuditOutputPath(), buildDefaultAuditOutputPath()),
    targeted_states: targetStates,
    state_runs: stateRuns,
    final_audit: finalAudit,
    state_report_cards: buildStateReportCards(stateRuns, finalAudit),
    national_summary: buildContinuousRolloutSummary(stateRuns, finalAudit)
  };

  const resolvedOutputPath = resolveFromServiceRoot(outputPath, outputPath);
  if (!dryRun) {
    await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
    await fs.writeFile(resolvedOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  return {
    report,
    resolvedOutputPath
  };
}
