import { query } from '../db.js';
import { runCrawl } from './crawlService.js';
import { runAcceptanceStage } from './pipeline/acceptanceStageService.js';
import { runFetchStage } from './pipeline/fetchStageService.js';
import { runParseStage } from './pipeline/parseStageService.js';
import { runQuestionExtractionStage } from './pipeline/questionExtractionStageService.js';
import { runSeedScopeStage } from './pipeline/seedScopeStageService.js';
import { runTriageStage } from './pipeline/triageStageService.js';
import { runWorkflowExtractionStage } from './pipeline/workflowExtractionStageService.js';
import { listStateSystems } from './stateSummaryService.js';

const SNAPSHOT_METRICS = [
  { key: 'source_documents', label: 'Source Documents', improvesWhen: 'up' },
  { key: 'parsed_artifacts', label: 'Parsed Artifacts', improvesWhen: 'up' },
  { key: 'pdf_source_documents', label: 'PDFs', improvesWhen: 'up' },
  { key: 'workflows', label: 'Workflows', improvesWhen: 'up' },
  { key: 'approved_templates', label: 'Approved Templates', improvesWhen: 'up' },
  { key: 'draft_templates', label: 'Draft Templates', improvesWhen: 'down' },
  { key: 'parse_failures', label: 'Parse Failures', improvesWhen: 'down' },
  { key: 'partial_workflows', label: 'Partial Workflows', improvesWhen: 'down' },
  { key: 'low_confidence_question_drafts', label: 'Low Confidence Drafts', improvesWhen: 'down' },
];

const HISTORY_STATUSES = new Set([
  'ok',
  'partial',
  'no_seeds',
  'no_documents',
  'no_pdfs',
  'no_targets',
  'failed',
]);

function toInt(value) {
  return Number(value || 0);
}

function normalizeState(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return normalized ? normalized : null;
}

function buildEmptySnapshot({ state = null, systemId = null, systemName = null } = {}) {
  return {
    state: normalizeState(state),
    hospital_system_id: systemId || null,
    system_name: systemName || null,
    active_seed_urls: 0,
    approved_seed_urls: 0,
    source_documents: 0,
    parsed_artifacts: 0,
    html_source_documents: 0,
    pdf_source_documents: 0,
    workflows: 0,
    draft_templates: 0,
    approved_templates: 0,
    stale_templates: 0,
    unsupported_templates: 0,
    parse_failures: 0,
    partial_workflows: 0,
    low_confidence_question_drafts: 0,
    manual_imports: 0,
    last_crawl_at: null,
  };
}

async function captureSystemSnapshot({ state = null, systemId = null, systemName = null } = {}) {
  if (!systemId) {
    return buildEmptySnapshot({ state, systemId, systemName });
  }

  const result = await query(
    `with latest_workflow_runs as (
       select distinct on (er.source_document_id)
         er.source_document_id,
         er.status,
         er.structured_output
       from extraction_runs er
       join source_documents sd on sd.id = er.source_document_id
       where sd.hospital_system_id = $1
         and er.extractor_name = 'workflow_extractor'
       order by er.source_document_id, er.created_at desc
     ),
     latest_form_runs as (
       select distinct on (er.source_document_id)
         er.source_document_id,
         er.status,
         er.structured_output
       from extraction_runs er
       join source_documents sd on sd.id = er.source_document_id
       where sd.hospital_system_id = $1
         and er.extractor_name = 'pdf_form_understanding_openai'
       order by er.source_document_id, er.created_at desc
     ),
     latest_parsed_artifacts as (
       select distinct on (pa.source_document_id)
         pa.source_document_id,
         pa.parse_status
       from parsed_artifacts pa
       join source_documents sd on sd.id = pa.source_document_id
       where sd.hospital_system_id = $1
       order by pa.source_document_id, pa.created_at desc
     ),
     source_stats as (
       select
         count(*)::int as source_documents,
         count(latest_parsed_artifacts.source_document_id)::int as parsed_artifacts,
         count(*) filter (where source_type = 'html')::int as html_source_documents,
         count(*) filter (where source_type = 'pdf')::int as pdf_source_documents,
         max(fetched_at) as last_crawl_at
       from source_documents
       left join latest_parsed_artifacts on latest_parsed_artifacts.source_document_id = source_documents.id
       where hospital_system_id = $1
     ),
     workflow_stats as (
       select count(*)::int as workflows
       from records_workflows
       where hospital_system_id = $1
     ),
     seed_stats as (
       select
         count(*) filter (where active = true)::int as active_seed_urls,
         count(*) filter (where active = true and approved_by_human = true)::int as approved_seed_urls
       from seed_urls
       where hospital_system_id = $1
     ),
     template_stats as (
       select
         count(*) filter (where pqt.status = 'draft')::int as draft_templates,
         count(*) filter (where pqt.status = 'approved')::int as approved_templates,
         count(*) filter (where pqt.status = 'stale')::int as stale_templates,
         count(*) filter (where pqt.status = 'unsupported')::int as unsupported_templates
       from source_documents sd
       left join pdf_question_templates pqt on pqt.source_document_id = sd.id
       where sd.hospital_system_id = $1
         and sd.source_type = 'pdf'
     ),
     quality_stats as (
       select
         count(*) filter (
           where coalesce(latest_parsed_artifacts.parse_status, '') in ('failed', 'empty_text')
         )::int as parse_failures,
         count(*) filter (where latest_workflow_runs.status = 'partial')::int as partial_workflows,
         count(*) filter (
           where latest_form_runs.source_document_id is not null
             and (
               latest_form_runs.status <> 'success'
               or coalesce((latest_form_runs.structured_output->'form_understanding'->>'confidence')::numeric, 0) < 0.85
               or coalesce((latest_form_runs.structured_output->'form_understanding'->>'supported')::boolean, false) = false
             )
         )::int as low_confidence_question_drafts,
         count(*) filter (
           where sd.import_mode in ('manual_html', 'manual_pdf')
         )::int as manual_imports
       from source_documents sd
       left join latest_parsed_artifacts on latest_parsed_artifacts.source_document_id = sd.id
       left join latest_workflow_runs on latest_workflow_runs.source_document_id = sd.id
       left join latest_form_runs on latest_form_runs.source_document_id = sd.id
       where sd.hospital_system_id = $1
     )
     select
       hs.id as hospital_system_id,
       hs.system_name,
       hs.state,
       coalesce(seed_stats.active_seed_urls, 0)::int as active_seed_urls,
       coalesce(seed_stats.approved_seed_urls, 0)::int as approved_seed_urls,
       coalesce(source_stats.source_documents, 0)::int as source_documents,
       coalesce(source_stats.parsed_artifacts, 0)::int as parsed_artifacts,
       coalesce(source_stats.html_source_documents, 0)::int as html_source_documents,
       coalesce(source_stats.pdf_source_documents, 0)::int as pdf_source_documents,
       coalesce(workflow_stats.workflows, 0)::int as workflows,
       coalesce(template_stats.draft_templates, 0)::int as draft_templates,
       coalesce(template_stats.approved_templates, 0)::int as approved_templates,
       coalesce(template_stats.stale_templates, 0)::int as stale_templates,
       coalesce(template_stats.unsupported_templates, 0)::int as unsupported_templates,
       coalesce(quality_stats.parse_failures, 0)::int as parse_failures,
       coalesce(quality_stats.partial_workflows, 0)::int as partial_workflows,
       coalesce(quality_stats.low_confidence_question_drafts, 0)::int as low_confidence_question_drafts,
       coalesce(quality_stats.manual_imports, 0)::int as manual_imports,
       source_stats.last_crawl_at
     from hospital_systems hs
     cross join source_stats
     cross join workflow_stats
     cross join seed_stats
     cross join template_stats
     cross join quality_stats
     where hs.id = $1
       and hs.active = true
     limit 1`,
    [systemId],
  );

  const row = result.rows[0];
  if (!row) {
    return buildEmptySnapshot({ state, systemId, systemName });
  }

  return {
    state: normalizeState(row.state || state),
    hospital_system_id: row.hospital_system_id,
    system_name: row.system_name || systemName || null,
    active_seed_urls: toInt(row.active_seed_urls),
    approved_seed_urls: toInt(row.approved_seed_urls),
    source_documents: toInt(row.source_documents),
    parsed_artifacts: toInt(row.parsed_artifacts),
    html_source_documents: toInt(row.html_source_documents),
    pdf_source_documents: toInt(row.pdf_source_documents),
    workflows: toInt(row.workflows),
    draft_templates: toInt(row.draft_templates),
    approved_templates: toInt(row.approved_templates),
    stale_templates: toInt(row.stale_templates),
    unsupported_templates: toInt(row.unsupported_templates),
    parse_failures: toInt(row.parse_failures),
    partial_workflows: toInt(row.partial_workflows),
    low_confidence_question_drafts: toInt(row.low_confidence_question_drafts),
    manual_imports: toInt(row.manual_imports),
    last_crawl_at: row.last_crawl_at || null,
  };
}

function summarizeChanges(beforeSnapshot, afterSnapshot) {
  const metrics = SNAPSHOT_METRICS.map((definition) => {
    const before = toInt(beforeSnapshot?.[definition.key]);
    const after = toInt(afterSnapshot?.[definition.key]);
    const delta = after - before;
    if (delta === 0) return null;

    const improved =
      definition.improvesWhen === 'up' ? delta > 0 : delta < 0;

    return {
      key: definition.key,
      label: definition.label,
      before,
      after,
      delta,
      improved,
      direction: delta > 0 ? 'up' : 'down',
    };
  }).filter(Boolean);

  const improvements = metrics.filter((metric) => metric.improved);
  const regressions = metrics.filter((metric) => !metric.improved);

  return {
    changed_count: metrics.length,
    improved_count: improvements.length,
    regressed_count: regressions.length,
    metrics,
    highlights: {
      improved: improvements.map((metric) => ({
        key: metric.key,
        label: metric.label,
        delta: metric.delta,
      })),
      changed: metrics.map((metric) => ({
        key: metric.key,
        label: metric.label,
        delta: metric.delta,
      })),
    },
  };
}

function withStageSummary(summary = {}, { stageKey, stageLabel, stageStatus = null } = {}) {
  return {
    ...summary,
    stage_key: stageKey,
    stage_label: stageLabel,
    stage_status: stageStatus || summary?.status || 'ok',
  };
}

export function stageSummaryToHistoryStatus(
  stageSummary,
) {
  const stageStatus = String(stageSummary?.stage_status || stageSummary?.status || 'ok')
    .trim()
    .toLowerCase();
  if (stageStatus === 'success') return 'ok';
  if (HISTORY_STATUSES.has(stageStatus)) return stageStatus;
  return 'ok';
}

export function combineFullPipelineStatus({
  seedStage,
  fetchStage,
  triageStage,
  acceptanceStage,
  parseStage,
  workflowStage,
  questionStage,
} = {}) {
  if (
    fetchStage?.status === 'failed' ||
    triageStage?.status === 'failed' ||
    acceptanceStage?.status === 'failed' ||
    parseStage?.stage_status === 'failed' ||
    workflowStage?.stage_status === 'failed' ||
    questionStage?.stage_status === 'failed'
  ) {
    return 'failed';
  }

  if (seedStage?.stage_status === 'no_seeds' || fetchStage?.stage_status === 'no_seeds') {
    return 'no_seeds';
  }

  if (questionStage?.stage_status === 'no_pdfs') {
    return 'no_pdfs';
  }

  if (questionStage?.stage_status === 'no_documents') {
    return 'no_documents';
  }

  if (
    fetchStage?.stage_status === 'partial' ||
    triageStage?.stage_status === 'partial' ||
    acceptanceStage?.stage_status === 'partial' ||
    parseStage?.stage_status === 'partial' ||
    workflowStage?.stage_status === 'partial' ||
    questionStage?.stage_status === 'partial'
  ) {
    return 'partial';
  }

  if (
    fetchStage?.stage_status === 'no_targets' ||
    triageStage?.stage_status === 'no_targets' ||
    acceptanceStage?.stage_status === 'no_targets'
  ) {
    return 'no_targets';
  }

  return 'ok';
}

async function runTrackedStageExecution({
  state = null,
  systemId = null,
  systemName = null,
  stageKey,
  stageLabel,
  executeStage,
} = {}) {
  const normalizedState = normalizeState(state);
  const beforeSnapshot = await captureSystemSnapshot({
    state: normalizedState,
    systemId,
    systemName,
  });

  try {
    const stageSummary = await executeStage({
      state: normalizedState,
      systemId: beforeSnapshot.hospital_system_id || systemId,
      systemName: beforeSnapshot.system_name || systemName,
    });
    const afterSnapshot = await captureSystemSnapshot({
      state: normalizedState || beforeSnapshot.state,
      systemId: beforeSnapshot.hospital_system_id || systemId,
      systemName: beforeSnapshot.system_name || systemName,
    });
    const changeSummary = summarizeChanges(beforeSnapshot, afterSnapshot);
    const historyEntry = await insertRunHistory({
      state: normalizedState || afterSnapshot.state,
      systemId: afterSnapshot.hospital_system_id || systemId,
      systemName: afterSnapshot.system_name || beforeSnapshot.system_name || systemName,
      status: stageSummaryToHistoryStatus(stageSummary),
      crawlSummary: stageSummary,
      beforeSnapshot,
      afterSnapshot,
      changeSummary,
    });

    return {
      ...stageSummary,
      history_entry: mapHistoryRow(historyEntry),
    };
  } catch (error) {
    const afterSnapshot = await captureSystemSnapshot({
      state: normalizedState || beforeSnapshot.state,
      systemId: beforeSnapshot.hospital_system_id || systemId,
      systemName: beforeSnapshot.system_name || systemName,
    });
    const changeSummary = summarizeChanges(beforeSnapshot, afterSnapshot);

    await insertRunHistory({
      state: normalizedState || afterSnapshot.state,
      systemId: afterSnapshot.hospital_system_id || systemId,
      systemName: afterSnapshot.system_name || beforeSnapshot.system_name || systemName,
      status: 'failed',
      crawlSummary: withStageSummary(
        {
          status: 'failed',
          crawled: 0,
          extracted: 0,
          failed: 1,
          systems: systemId ? 1 : 0,
          error: error instanceof Error ? error.message : `${stageLabel} failed.`,
        },
        {
          stageKey,
          stageLabel,
          stageStatus: 'failed',
        },
      ),
      beforeSnapshot,
      afterSnapshot,
      changeSummary,
    });

    throw error;
  }
}

async function runSystemQuestionExtractionBatch({
  systemId,
  replaceDraft = true,
} = {}) {
  if (!systemId) {
    throw new Error('systemId is required for question extraction.');
  }

  const questionSummary = await runQuestionExtractionStage({
    systemId,
    replaceDraft,
  });

  const stageStatus =
    questionSummary.stage_status === 'no_documents' ? 'no_pdfs' : questionSummary.stage_status;

  return withStageSummary(questionSummary, {
    stageKey: 'question_extraction_stage',
    stageLabel: 'Question Extraction Stage',
    stageStatus,
  });
}

async function insertRunHistory({
  state = null,
  systemId = null,
  systemName = null,
  status = 'ok',
  crawlSummary = {},
  beforeSnapshot = null,
  afterSnapshot = null,
  changeSummary = null,
}) {
  const result = await query(
    `insert into pipeline_run_history (
       state,
       hospital_system_id,
       system_name,
       run_scope,
       status,
       crawled,
       extracted,
       failed,
       systems,
       crawl_summary,
       before_snapshot,
       after_snapshot,
       change_summary
     )
     values ($1, $2, $3, 'system', $4, $5, $6, $7, $8, $9, $10, $11, $12)
     returning
       id,
       state,
       hospital_system_id,
       system_name,
       run_scope,
       status,
       crawled,
       extracted,
       failed,
       systems,
       crawl_summary,
       before_snapshot,
       after_snapshot,
       change_summary,
       created_at`,
    [
      normalizeState(state),
      systemId || null,
      systemName || null,
      stageSummaryToHistoryStatus({ status }),
      toInt(crawlSummary?.crawled),
      toInt(crawlSummary?.extracted),
      toInt(crawlSummary?.failed),
      toInt(crawlSummary?.systems),
      crawlSummary || {},
      beforeSnapshot,
      afterSnapshot,
      changeSummary,
    ],
  );

  return result.rows[0];
}

function mapHistoryRow(row) {
  return {
    id: row.id,
    state: row.state,
    hospital_system_id: row.hospital_system_id,
    system_name: row.system_name,
    run_scope: row.run_scope,
    status: row.status,
    crawled: toInt(row.crawled),
    extracted: toInt(row.extracted),
    failed: toInt(row.failed),
    systems: toInt(row.systems),
    crawl_summary: row.crawl_summary || {},
    before_snapshot: row.before_snapshot || null,
    after_snapshot: row.after_snapshot || null,
    change_summary: row.change_summary || null,
    created_at: row.created_at,
  };
}

export async function runTrackedSystemPipeline({
  state = null,
  systemId = null,
  systemName = null,
  facilityId = null,
  seedUrl = null,
  maxDepth = undefined,
  stageKey = 'crawl_stage',
  stageLabel = 'Crawl Stage',
} = {}) {
  const normalizedState = normalizeState(state);
  const beforeSnapshot = await captureSystemSnapshot({
    state: normalizedState,
    systemId,
    systemName,
  });

  try {
    const crawlSummary = withStageSummary(
      await runCrawl({
        state: normalizedState,
        systemId,
        systemName,
        facilityId,
        seedUrl,
        maxDepth,
      }),
      {
        stageKey,
        stageLabel,
      },
    );

    const afterSnapshot = await captureSystemSnapshot({
      state: normalizedState || beforeSnapshot.state,
      systemId: beforeSnapshot.hospital_system_id || systemId,
      systemName: beforeSnapshot.system_name || systemName,
    });
    const changeSummary = summarizeChanges(beforeSnapshot, afterSnapshot);
    const historyEntry = await insertRunHistory({
      state: normalizedState || afterSnapshot.state,
      systemId: afterSnapshot.hospital_system_id || systemId,
      systemName: afterSnapshot.system_name || beforeSnapshot.system_name || systemName,
      status: crawlSummary.status || 'ok',
      crawlSummary,
      beforeSnapshot,
      afterSnapshot,
      changeSummary,
    });

    return {
      ...crawlSummary,
      history_entry: mapHistoryRow(historyEntry),
    };
  } catch (error) {
    const afterSnapshot = await captureSystemSnapshot({
      state: normalizedState || beforeSnapshot.state,
      systemId: beforeSnapshot.hospital_system_id || systemId,
      systemName: beforeSnapshot.system_name || systemName,
    });
    const changeSummary = summarizeChanges(beforeSnapshot, afterSnapshot);

    await insertRunHistory({
      state: normalizedState || afterSnapshot.state,
      systemId: afterSnapshot.hospital_system_id || systemId,
      systemName: afterSnapshot.system_name || beforeSnapshot.system_name || systemName,
      status: 'failed',
      crawlSummary: {
        status: 'failed',
        crawled: 0,
        extracted: 0,
        failed: 1,
        systems: systemId ? 1 : 0,
        error: error.message,
      },
      beforeSnapshot,
      afterSnapshot,
      changeSummary,
    });

    throw error;
  }
}

export async function runTrackedQuestionExtractionStage({
  state = null,
  systemId = null,
  systemName = null,
  replaceDraft = true,
} = {}) {
  return runTrackedStageExecution({
    state,
    systemId,
    systemName,
    stageKey: 'question_extraction_stage',
    stageLabel: 'Question Extraction Stage',
    executeStage: async ({ systemId: resolvedSystemId }) =>
      runSystemQuestionExtractionBatch({
        systemId: resolvedSystemId,
        replaceDraft,
      }),
  });
}

export async function runTrackedSeedScopeStage({
  state = null,
  systemId = null,
  systemName = null,
  facilityId = null,
  seedUrl = null,
  hospitalSystemIds = [],
} = {}) {
  return runTrackedStageExecution({
    state,
    systemId,
    systemName,
    stageKey: 'seed_scope_stage',
    stageLabel: 'Seed Scope Stage',
    executeStage: async ({ state: normalizedState, systemId: resolvedSystemId, systemName: resolvedSystemName }) =>
      runSeedScopeStage({
        state: normalizedState,
        systemId: resolvedSystemId,
        systemName: resolvedSystemName,
        facilityId,
        seedUrl,
        hospitalSystemIds,
      }),
    noDocumentStatuses: [],
  });
}

export async function runTrackedFetchStage({
  state = null,
  systemId = null,
  systemName = null,
  facilityId = null,
  seedUrl = null,
  hospitalSystemIds = [],
  maxDepth = undefined,
} = {}) {
  return runTrackedStageExecution({
    state,
    systemId,
    systemName,
    stageKey: 'fetch_stage',
    stageLabel: 'Fetch Stage',
    executeStage: async ({ state: normalizedState, systemId: resolvedSystemId, systemName: resolvedSystemName }) =>
      runFetchStage({
        state: normalizedState,
        systemId: resolvedSystemId,
        systemName: resolvedSystemName,
        facilityId,
        seedUrl,
        hospitalSystemIds,
        maxDepth,
      }),
    noDocumentStatuses: [],
  });
}

export async function runTrackedTriageStage({
  state = null,
  systemId = null,
  systemName = null,
  fetchStageRunId = null,
} = {}) {
  return runTrackedStageExecution({
    state,
    systemId,
    systemName,
    stageKey: 'triage_stage',
    stageLabel: 'Document Triage Stage',
    executeStage: async ({ systemId: resolvedSystemId, systemName: resolvedSystemName }) =>
      runTriageStage({
        systemId: resolvedSystemId,
        systemName: resolvedSystemName,
        fetchStageRunId,
      }),
  });
}

export async function runTrackedAcceptanceStage({
  state = null,
  systemId = null,
  systemName = null,
  triageStageRunId = null,
} = {}) {
  return runTrackedStageExecution({
    state,
    systemId,
    systemName,
    stageKey: 'acceptance_stage',
    stageLabel: 'Acceptance Stage',
    executeStage: async ({ systemId: resolvedSystemId, systemName: resolvedSystemName }) =>
      runAcceptanceStage({
        systemId: resolvedSystemId,
        systemName: resolvedSystemName,
        triageStageRunId,
      }),
  });
}

export async function runTrackedParseStage({
  state = null,
  systemId = null,
  systemName = null,
  sourceType = null,
} = {}) {
  const normalizedState = normalizeState(state);
  const beforeSnapshot = await captureSystemSnapshot({
    state: normalizedState,
    systemId,
    systemName,
  });

  try {
    const parseSummary = await runParseStage({
      systemId: beforeSnapshot.hospital_system_id || systemId,
      sourceType,
    });
    const afterSnapshot = await captureSystemSnapshot({
      state: normalizedState || beforeSnapshot.state,
      systemId: beforeSnapshot.hospital_system_id || systemId,
      systemName: beforeSnapshot.system_name || systemName,
    });
    const changeSummary = summarizeChanges(beforeSnapshot, afterSnapshot);
    const historyEntry = await insertRunHistory({
      state: normalizedState || afterSnapshot.state,
      systemId: afterSnapshot.hospital_system_id || systemId,
      systemName: afterSnapshot.system_name || beforeSnapshot.system_name || systemName,
      status: stageSummaryToHistoryStatus(parseSummary),
      crawlSummary: parseSummary,
      beforeSnapshot,
      afterSnapshot,
      changeSummary,
    });

    return {
      ...parseSummary,
      history_entry: mapHistoryRow(historyEntry),
    };
  } catch (error) {
    const afterSnapshot = await captureSystemSnapshot({
      state: normalizedState || beforeSnapshot.state,
      systemId: beforeSnapshot.hospital_system_id || systemId,
      systemName: beforeSnapshot.system_name || systemName,
    });
    const changeSummary = summarizeChanges(beforeSnapshot, afterSnapshot);

    await insertRunHistory({
      state: normalizedState || afterSnapshot.state,
      systemId: afterSnapshot.hospital_system_id || systemId,
      systemName: afterSnapshot.system_name || beforeSnapshot.system_name || systemName,
      status: 'failed',
      crawlSummary: {
        stage_key: 'parse_stage',
        stage_label: 'Parse Stage',
        stage_status: 'failed',
        status: 'failed',
        crawled: 0,
        extracted: 0,
        failed: 1,
        systems: systemId ? 1 : 0,
        error: error.message,
      },
      beforeSnapshot,
      afterSnapshot,
      changeSummary,
    });

    throw error;
  }
}

export async function runTrackedWorkflowExtractionStage({
  state = null,
  systemId = null,
  systemName = null,
  sourceType = null,
} = {}) {
  const normalizedState = normalizeState(state);
  const beforeSnapshot = await captureSystemSnapshot({
    state: normalizedState,
    systemId,
    systemName,
  });

  try {
    const workflowSummary = await runWorkflowExtractionStage({
      systemId: beforeSnapshot.hospital_system_id || systemId,
      sourceType,
    });
    const afterSnapshot = await captureSystemSnapshot({
      state: normalizedState || beforeSnapshot.state,
      systemId: beforeSnapshot.hospital_system_id || systemId,
      systemName: beforeSnapshot.system_name || systemName,
    });
    const changeSummary = summarizeChanges(beforeSnapshot, afterSnapshot);
    const historyEntry = await insertRunHistory({
      state: normalizedState || afterSnapshot.state,
      systemId: afterSnapshot.hospital_system_id || systemId,
      systemName: afterSnapshot.system_name || beforeSnapshot.system_name || systemName,
      status: stageSummaryToHistoryStatus(workflowSummary),
      crawlSummary: workflowSummary,
      beforeSnapshot,
      afterSnapshot,
      changeSummary,
    });

    return {
      ...workflowSummary,
      history_entry: mapHistoryRow(historyEntry),
    };
  } catch (error) {
    const afterSnapshot = await captureSystemSnapshot({
      state: normalizedState || beforeSnapshot.state,
      systemId: beforeSnapshot.hospital_system_id || systemId,
      systemName: beforeSnapshot.system_name || systemName,
    });
    const changeSummary = summarizeChanges(beforeSnapshot, afterSnapshot);

    await insertRunHistory({
      state: normalizedState || afterSnapshot.state,
      systemId: afterSnapshot.hospital_system_id || systemId,
      systemName: afterSnapshot.system_name || beforeSnapshot.system_name || systemName,
      status: 'failed',
      crawlSummary: {
        stage_key: 'workflow_extraction_stage',
        stage_label: 'Workflow Extraction Stage',
        stage_status: 'failed',
        status: 'failed',
        crawled: 0,
        extracted: 0,
        failed: 1,
        systems: systemId ? 1 : 0,
        error: error.message,
      },
      beforeSnapshot,
      afterSnapshot,
      changeSummary,
    });

    throw error;
  }
}

export async function runTrackedFullSystemPipeline({
  state = null,
  systemId = null,
  systemName = null,
  facilityId = null,
  seedUrl = null,
  maxDepth = undefined,
  replaceDraft = true,
} = {}) {
  const normalizedState = normalizeState(state);
  const beforeSnapshot = await captureSystemSnapshot({
    state: normalizedState,
    systemId,
    systemName,
  });

  try {
    const resolvedSystemId = beforeSnapshot.hospital_system_id || systemId;
    const resolvedSystemName = beforeSnapshot.system_name || systemName;

    const seedStage = await runSeedScopeStage({
      state: normalizedState,
      systemId: resolvedSystemId,
      systemName: resolvedSystemName,
      facilityId,
      seedUrl,
    });

    const fetchStage = await runFetchStage({
      state: normalizedState,
      systemId: resolvedSystemId,
      systemName: resolvedSystemName,
      facilityId,
      seedUrl,
      maxDepth,
    });

    const triageStage = await runTriageStage({
      systemId: resolvedSystemId,
      systemName: resolvedSystemName,
      fetchStageRunId: fetchStage.stage_run_id || null,
    });

    const acceptanceStage = await runAcceptanceStage({
      systemId: resolvedSystemId,
      systemName: resolvedSystemName,
      triageStageRunId: triageStage.stage_run_id || null,
    });

    const parseStage = await runParseStage({
      systemId: resolvedSystemId,
    });

    const workflowStage = await runWorkflowExtractionStage({
      systemId: resolvedSystemId,
    });

    const questionStage = await runSystemQuestionExtractionBatch({
      systemId: resolvedSystemId,
      replaceDraft,
    });

    const afterSnapshot = await captureSystemSnapshot({
      state: normalizedState || beforeSnapshot.state || questionStage.state,
      systemId: resolvedSystemId,
      systemName: beforeSnapshot.system_name || questionStage.system_name || systemName,
    });
    const changeSummary = summarizeChanges(beforeSnapshot, afterSnapshot);
    const combinedStatus = combineFullPipelineStatus({
      seedStage,
      fetchStage,
      triageStage,
      acceptanceStage,
      parseStage,
      workflowStage,
      questionStage,
    });

    const fullSummary = withStageSummary(
      {
        status: combinedStatus,
        systems: Math.max(toInt(fetchStage.systems), toInt(questionStage.systems), systemId ? 1 : 0),
        crawled: toInt(fetchStage.crawled),
        extracted: toInt(questionStage.extracted),
        failed:
          toInt(fetchStage.failed) +
          toInt(triageStage.failed) +
          toInt(acceptanceStage.failed) +
          toInt(parseStage.failed) +
          toInt(workflowStage.failed) +
          toInt(questionStage.failed),
        seed_urls: toInt(seedStage.seed_urls),
        fetched_documents: toInt(fetchStage.fetched_documents),
        accepted_documents: toInt(triageStage.accepted_documents),
        skipped_documents: toInt(triageStage.skipped_documents),
        review_needed_documents: toInt(triageStage.review_needed_documents),
        source_documents_upserted: toInt(acceptanceStage.source_documents_upserted),
        parsed_documents: toInt(parseStage.parsed_documents),
        workflow_rows: toInt(workflowStage.workflow_rows),
        reextracted: toInt(questionStage.reextracted),
        pdf_documents: toInt(questionStage.pdf_documents),
        seed_stage: seedStage,
        fetch_stage: fetchStage,
        triage_stage: triageStage,
        acceptance_stage: acceptanceStage,
        parse_stage: parseStage,
        workflow_stage: workflowStage,
        question_stage: questionStage,
      },
      {
        stageKey: 'full_pipeline',
        stageLabel: 'Full Pipeline',
        stageStatus: combinedStatus,
      },
    );
    const historyStatus = stageSummaryToHistoryStatus(fullSummary);

    const historyEntry = await insertRunHistory({
      state: normalizedState || afterSnapshot.state || questionStage.state,
      systemId: afterSnapshot.hospital_system_id || systemId,
      systemName: afterSnapshot.system_name || beforeSnapshot.system_name || questionStage.system_name || systemName,
      status: historyStatus,
      crawlSummary: fullSummary,
      beforeSnapshot,
      afterSnapshot,
      changeSummary,
    });

    return {
      ...fullSummary,
      history_entry: mapHistoryRow(historyEntry),
    };
  } catch (error) {
    const afterSnapshot = await captureSystemSnapshot({
      state: normalizedState || beforeSnapshot.state,
      systemId: beforeSnapshot.hospital_system_id || systemId,
      systemName: beforeSnapshot.system_name || systemName,
    });
    const changeSummary = summarizeChanges(beforeSnapshot, afterSnapshot);

    await insertRunHistory({
      state: normalizedState || afterSnapshot.state,
      systemId: afterSnapshot.hospital_system_id || systemId,
      systemName: afterSnapshot.system_name || beforeSnapshot.system_name || systemName,
      status: 'failed',
      crawlSummary: withStageSummary(
        {
          status: 'failed',
          crawled: 0,
          extracted: 0,
          failed: 1,
          systems: systemId ? 1 : 0,
          error: error.message,
        },
        {
          stageKey: 'full_pipeline',
          stageLabel: 'Full Pipeline',
          stageStatus: 'failed',
        },
      ),
      beforeSnapshot,
      afterSnapshot,
      changeSummary,
    });

    throw error;
  }
}

export async function runTrackedFullStatePipelineBatch({
  state = null,
  hospitalSystemIds = [],
  maxDepth = undefined,
  replaceDraft = true,
} = {}) {
  const normalizedState = normalizeState(state);
  const stateSystems = await listStateSystems(normalizedState);
  const requestedIds =
    Array.isArray(hospitalSystemIds) && hospitalSystemIds.length > 0
      ? new Set(hospitalSystemIds.filter(Boolean))
      : null;
  const seededSystems = (Array.isArray(stateSystems.systems) ? stateSystems.systems : []).filter(
    (system) =>
      system?.in_seed_file &&
      (!requestedIds || (system.hospital_system_id && requestedIds.has(system.hospital_system_id))),
  );
  const runnableSystems = seededSystems
    .filter((system) => system?.hospital_system_id)
    .sort((left, right) => String(left.system_name || '').localeCompare(String(right.system_name || '')));
  const unresolvedSystems = seededSystems
    .filter((system) => !system?.hospital_system_id)
    .map((system) => ({
      hospital_system_id: null,
      system_name: system?.system_name || 'Seeded system',
      state: normalizedState,
      status: 'needs_reseed',
      error: 'This seed-file system does not have a matching DB row yet. Run Stage 1 reseed first.',
      history_entry: null,
    }));

  if (!runnableSystems.length) {
    const batchStatus = unresolvedSystems.length > 0 ? 'partial' : 'no_seeds';
    return withStageSummary(
      {
        status: batchStatus,
        state: normalizedState,
        seed_file_path: stateSystems.seed_file_path,
        seed_file_systems: seededSystems.length,
        targeted_systems: 0,
        completed_systems: 0,
        ok_systems: 0,
        warning_systems: 0,
        failed_systems: 0,
        unresolved_systems: unresolvedSystems.length,
        systems: 0,
        crawled: 0,
        extracted: 0,
        failed: unresolvedSystems.length,
        system_runs: unresolvedSystems,
      },
      {
        stageKey: 'full_state_pipeline',
        stageLabel: 'Full State Pipeline Batch',
        stageStatus: batchStatus,
      },
    );
  }

  const systemRuns = [];
  let okSystems = 0;
  let warningSystems = 0;
  let failedSystems = 0;
  let crawled = 0;
  let extracted = 0;
  let failed = unresolvedSystems.length;

  for (const system of runnableSystems) {
    try {
      const summary = await runTrackedFullSystemPipeline({
        state: normalizedState,
        systemId: system.hospital_system_id,
        systemName: system.system_name,
        maxDepth,
        replaceDraft,
      });
      const systemStatus = String(summary?.status || summary?.stage_status || 'ok').toLowerCase();
      if (systemStatus === 'ok') {
        okSystems += 1;
      } else if (systemStatus === 'failed') {
        failedSystems += 1;
      } else {
        warningSystems += 1;
      }

      crawled += toInt(summary?.crawled);
      extracted += toInt(summary?.extracted);
      failed += toInt(summary?.failed);
      systemRuns.push({
        hospital_system_id: system.hospital_system_id,
        system_name: system.system_name,
        state: normalizedState,
        status: systemStatus,
        history_entry: summary?.history_entry || null,
        stage_status: summary?.stage_status || null,
        crawled: toInt(summary?.crawled),
        extracted: toInt(summary?.extracted),
        failed: toInt(summary?.failed),
      });
    } catch (error) {
      failedSystems += 1;
      failed += 1;
      systemRuns.push({
        hospital_system_id: system.hospital_system_id,
        system_name: system.system_name,
        state: normalizedState,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Full pipeline failed.',
        history_entry: null,
      });
    }
  }

  const combinedRuns = [...systemRuns, ...unresolvedSystems];
  const batchStatus =
    failedSystems > 0 || warningSystems > 0 || unresolvedSystems.length > 0
      ? okSystems > 0 || warningSystems > 0
        ? 'partial'
        : 'failed'
      : 'ok';

  return withStageSummary(
    {
      status: batchStatus,
      state: normalizedState,
      seed_file_path: stateSystems.seed_file_path,
      seed_file_systems: seededSystems.length,
      targeted_systems: runnableSystems.length,
      completed_systems: systemRuns.length,
      ok_systems: okSystems,
      warning_systems: warningSystems,
      failed_systems: failedSystems,
      unresolved_systems: unresolvedSystems.length,
      systems: runnableSystems.length,
      crawled,
      extracted,
      failed,
      system_runs: combinedRuns,
    },
    {
      stageKey: 'full_state_pipeline',
      stageLabel: 'Full State Pipeline Batch',
      stageStatus: batchStatus,
    },
  );
}

export async function listPipelineRunHistory({
  state = null,
  systemId = null,
  limit = 30,
} = {}) {
  const normalizedState = normalizeState(state);
  const clauses = [];
  const params = [];

  if (normalizedState) {
    params.push(normalizedState);
    clauses.push(`state = $${params.length}`);
  }

  if (systemId) {
    params.push(systemId);
    clauses.push(`hospital_system_id = $${params.length}`);
  }

  params.push(Math.max(1, Math.min(100, Number(limit || 30))));

  const whereClause = clauses.length > 0 ? `where ${clauses.join(' and ')}` : '';
  const result = await query(
    `select
       id,
       state,
       hospital_system_id,
       system_name,
       run_scope,
       status,
       crawled,
       extracted,
       failed,
       systems,
       crawl_summary,
       before_snapshot,
       after_snapshot,
       change_summary,
       created_at
     from pipeline_run_history
     ${whereClause}
     order by created_at desc
     limit $${params.length}`,
    params,
  );

  return {
    state: normalizedState,
    hospital_system_id: systemId || null,
    runs: result.rows.map(mapHistoryRow),
  };
}
