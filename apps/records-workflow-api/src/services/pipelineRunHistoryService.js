import { query } from '../db.js';
import { runCrawl } from './crawlService.js';
import { reextractQuestionReview } from './questionReviewService.js';

const SNAPSHOT_METRICS = [
  { key: 'source_documents', label: 'Source Documents', improvesWhen: 'up' },
  { key: 'pdf_source_documents', label: 'PDFs', improvesWhen: 'up' },
  { key: 'workflows', label: 'Workflows', improvesWhen: 'up' },
  { key: 'approved_templates', label: 'Approved Templates', improvesWhen: 'up' },
  { key: 'draft_templates', label: 'Draft Templates', improvesWhen: 'down' },
  { key: 'parse_failures', label: 'Parse Failures', improvesWhen: 'down' },
  { key: 'partial_workflows', label: 'Partial Workflows', improvesWhen: 'down' },
  { key: 'low_confidence_question_drafts', label: 'Low Confidence Drafts', improvesWhen: 'down' },
];

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
     source_stats as (
       select
         count(*)::int as source_documents,
         count(*) filter (where source_type = 'html')::int as html_source_documents,
         count(*) filter (where source_type = 'pdf')::int as pdf_source_documents,
         max(fetched_at) as last_crawl_at
       from source_documents
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
           where coalesce(latest_workflow_runs.structured_output->'metadata'->>'pdfParseStatus', '') in ('failed', 'empty_text')
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

async function listSystemPdfSourceDocuments(systemId) {
  const result = await query(
    `select
       hs.id as hospital_system_id,
       hs.system_name,
       hs.state,
       sd.id as source_document_id,
       sd.title,
       sd.source_url
     from hospital_systems hs
     left join source_documents sd
       on sd.hospital_system_id = hs.id
      and sd.source_type = 'pdf'
     where hs.id = $1
       and hs.active = true
     order by sd.fetched_at desc nulls last, sd.created_at desc nulls last`,
    [systemId],
  );

  const firstRow = result.rows[0];
  if (!firstRow) {
    throw new Error('Hospital system not found.');
  }

  return {
    hospital_system_id: firstRow.hospital_system_id,
    system_name: firstRow.system_name,
    state: firstRow.state,
    documents: result.rows
      .filter((row) => row.source_document_id)
      .map((row) => ({
        source_document_id: row.source_document_id,
        title: row.title,
        source_url: row.source_url,
      })),
  };
}

async function runSystemQuestionExtractionBatch({
  systemId,
  replaceDraft = true,
} = {}) {
  if (!systemId) {
    throw new Error('systemId is required for question extraction.');
  }

  const target = await listSystemPdfSourceDocuments(systemId);
  const documents = Array.isArray(target.documents) ? target.documents : [];

  if (documents.length === 0) {
    return withStageSummary(
      {
        status: 'ok',
        systems: 1,
        crawled: 0,
        extracted: 0,
        failed: 0,
        pdf_documents: 0,
        reextracted: 0,
        system_name: target.system_name,
        state: target.state,
        details: [],
      },
      {
        stageKey: 'question_extraction_stage',
        stageLabel: 'Question Extraction Stage',
        stageStatus: 'no_pdfs',
      },
    );
  }

  let extracted = 0;
  let failed = 0;
  const details = [];

  for (const document of documents) {
    try {
      const review = await reextractQuestionReview(document.source_document_id, {
        replaceDraft,
      });
      const extractionStatus = review?.reextraction_run?.status || 'success';
      const supported = review?.reextraction_run?.payload?.supported;
      const confidence = Number(review?.reextraction_run?.payload?.confidence || 0);

      if (extractionStatus === 'success') {
        extracted += 1;
      } else {
        failed += 1;
      }

      details.push({
        source_document_id: document.source_document_id,
        title: document.title || null,
        source_url: document.source_url || null,
        status: extractionStatus,
        supported: typeof supported === 'boolean' ? supported : null,
        confidence,
      });
    } catch (error) {
      failed += 1;
      details.push({
        source_document_id: document.source_document_id,
        title: document.title || null,
        source_url: document.source_url || null,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Question extraction failed.',
      });
    }
  }

  const stageStatus = failed === 0 ? 'ok' : extracted > 0 ? 'partial_failed' : 'failed';

  return withStageSummary(
    {
      status: stageStatus === 'failed' ? 'failed' : 'ok',
      systems: 1,
      crawled: 0,
      extracted,
      failed,
      pdf_documents: documents.length,
      reextracted: extracted,
      system_name: target.system_name,
      state: target.state,
      details,
    },
    {
      stageKey: 'question_extraction_stage',
      stageLabel: 'Question Extraction Stage',
      stageStatus,
    },
  );
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
      status,
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
  const normalizedState = normalizeState(state);
  const beforeSnapshot = await captureSystemSnapshot({
    state: normalizedState,
    systemId,
    systemName,
  });

  try {
    const questionSummary = await runSystemQuestionExtractionBatch({
      systemId: beforeSnapshot.hospital_system_id || systemId,
      replaceDraft,
    });
    const afterSnapshot = await captureSystemSnapshot({
      state: normalizedState || beforeSnapshot.state || questionSummary.state,
      systemId: beforeSnapshot.hospital_system_id || systemId,
      systemName: beforeSnapshot.system_name || questionSummary.system_name || systemName,
    });
    const changeSummary = summarizeChanges(beforeSnapshot, afterSnapshot);
    const historyEntry = await insertRunHistory({
      state: normalizedState || afterSnapshot.state || questionSummary.state,
      systemId: afterSnapshot.hospital_system_id || systemId,
      systemName: afterSnapshot.system_name || beforeSnapshot.system_name || questionSummary.system_name || systemName,
      status:
        questionSummary.stage_status === 'failed'
          ? 'failed'
          : questionSummary.stage_status === 'no_pdfs'
            ? 'no_seeds'
            : 'ok',
      crawlSummary: questionSummary,
      beforeSnapshot,
      afterSnapshot,
      changeSummary,
    });

    return {
      ...questionSummary,
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
          stageKey: 'question_extraction_stage',
          stageLabel: 'Question Extraction Stage',
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
    const crawlStage = withStageSummary(
      await runCrawl({
        state: normalizedState,
        systemId,
        systemName,
        facilityId,
        seedUrl,
        maxDepth,
      }),
      {
        stageKey: 'crawl_stage',
        stageLabel: 'Crawl Stage',
      },
    );

    const questionStage = await runSystemQuestionExtractionBatch({
      systemId: beforeSnapshot.hospital_system_id || systemId,
      replaceDraft,
    });

    const afterSnapshot = await captureSystemSnapshot({
      state: normalizedState || beforeSnapshot.state || questionStage.state,
      systemId: beforeSnapshot.hospital_system_id || systemId,
      systemName: beforeSnapshot.system_name || questionStage.system_name || systemName,
    });
    const changeSummary = summarizeChanges(beforeSnapshot, afterSnapshot);
    const combinedStatus =
      crawlStage.status === 'failed' || questionStage.stage_status === 'failed'
        ? 'failed'
        : crawlStage.status === 'no_seeds'
          ? 'no_seeds'
          : 'ok';

    const fullSummary = withStageSummary(
      {
        status: combinedStatus,
        systems: Math.max(toInt(crawlStage.systems), toInt(questionStage.systems), systemId ? 1 : 0),
        crawled: toInt(crawlStage.crawled),
        extracted: toInt(crawlStage.extracted),
        failed: toInt(crawlStage.failed) + toInt(questionStage.failed),
        reextracted: toInt(questionStage.reextracted),
        pdf_documents: toInt(questionStage.pdf_documents),
        crawl_stage: crawlStage,
        question_stage: questionStage,
      },
      {
        stageKey: 'full_pipeline',
        stageLabel: 'Full Pipeline',
        stageStatus:
          questionStage.stage_status === 'no_pdfs' && crawlStage.status === 'ok'
            ? 'question_stage_empty'
            : combinedStatus,
      },
    );

    const historyEntry = await insertRunHistory({
      state: normalizedState || afterSnapshot.state || questionStage.state,
      systemId: afterSnapshot.hospital_system_id || systemId,
      systemName: afterSnapshot.system_name || beforeSnapshot.system_name || questionStage.system_name || systemName,
      status: combinedStatus,
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
