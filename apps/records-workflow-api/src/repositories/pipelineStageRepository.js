import { query } from '../db.js';

export async function insertPipelineStageRun(
  {
    stageKey,
    stageLabel,
    pipelineRunHistoryId = null,
    parentStageRunId = null,
    state = null,
    hospitalSystemId = null,
    systemName = null,
    status = 'running',
    inputSummary = {},
    outputSummary = {},
    errorSummary = null,
  },
  client = null,
) {
  const q = client || { query };
  const result = await q.query(
    `insert into pipeline_stage_runs (
       stage_key,
       stage_label,
       pipeline_run_history_id,
       parent_stage_run_id,
       state,
       hospital_system_id,
       system_name,
       status,
       input_summary,
       output_summary,
       error_summary,
       completed_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, case when $8 = 'running' then null else now() end)
     returning *`,
    [
      stageKey,
      stageLabel,
      pipelineRunHistoryId,
      parentStageRunId,
      state,
      hospitalSystemId,
      systemName,
      status,
      inputSummary || {},
      outputSummary || {},
      errorSummary,
    ],
  );

  return result.rows[0] || null;
}

export async function completePipelineStageRun(
  {
    stageRunId,
    status,
    outputSummary = {},
    errorSummary = null,
  },
  client = null,
) {
  const q = client || { query };
  const result = await q.query(
    `update pipeline_stage_runs
     set status = $2,
         output_summary = $3,
         error_summary = $4,
         completed_at = now()
     where id = $1
     returning *`,
    [stageRunId, status, outputSummary || {}, errorSummary],
  );

  return result.rows[0] || null;
}

export async function insertParsedArtifact(
  {
    id,
    parseStageRunId,
    fetchArtifactId = null,
    sourceDocumentId = null,
    sourceType,
    parserName,
    parserVersion,
    parseStatus,
    storagePath,
    extractedText = null,
    summary = {},
  },
  client = null,
) {
  const q = client || { query };
  const result = await q.query(
    `insert into parsed_artifacts (
       id,
       parse_stage_run_id,
       fetch_artifact_id,
       source_document_id,
       source_type,
       parser_name,
       parser_version,
       parse_status,
       storage_path,
       extracted_text,
       summary
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning *`,
    [
      id,
      parseStageRunId,
      fetchArtifactId,
      sourceDocumentId,
      sourceType,
      parserName,
      parserVersion,
      parseStatus,
      storagePath,
      extractedText,
      summary || {},
    ],
  );

  return result.rows[0] || null;
}

export async function insertFetchArtifact(
  {
    id = null,
    crawlFrontierItemId = null,
    fetchStageRunId,
    hospitalSystemId = null,
    facilityId = null,
    requestedUrl,
    finalUrl = null,
    sourcePageUrl = null,
    httpStatus = null,
    contentType = null,
    sourceType = null,
    title = null,
    contentHash = null,
    responseBytes = null,
    fetchBackend = null,
    storagePath = null,
    headers = null,
    fetchMetadata = {},
    fetchedAt = null,
  },
  client = null,
) {
  const q = client || { query };
  const result = await q.query(
    `insert into fetch_artifacts (
       id,
       crawl_frontier_item_id,
       fetch_stage_run_id,
       hospital_system_id,
       facility_id,
       requested_url,
       final_url,
       source_page_url,
       http_status,
       content_type,
       source_type,
       title,
       content_hash,
       response_bytes,
       fetch_backend,
       storage_path,
       headers,
       fetch_metadata,
       fetched_at
     )
     values (
       coalesce($1, gen_random_uuid()),
       $2,
       $3,
       $4,
       $5,
       $6,
       $7,
       $8,
       $9,
       $10,
       $11,
       $12,
       $13,
       $14,
       $15,
       $16,
       $17,
       $18,
       coalesce($19, now())
     )
     returning *`,
    [
      id,
      crawlFrontierItemId,
      fetchStageRunId,
      hospitalSystemId,
      facilityId,
      requestedUrl,
      finalUrl,
      sourcePageUrl,
      httpStatus,
      contentType,
      sourceType,
      title,
      contentHash,
      responseBytes,
      fetchBackend,
      storagePath,
      headers,
      fetchMetadata || {},
      fetchedAt,
    ],
  );

  return result.rows[0] || null;
}

export async function insertTriageDecision(
  {
    id = null,
    triageStageRunId,
    fetchArtifactId,
    decision,
    basis = null,
    reasonCode = null,
    reasonDetail = null,
    classifierName,
    classifierVersion,
    evidence = {},
  },
  client = null,
) {
  const q = client || { query };
  const result = await q.query(
    `insert into triage_decisions (
       id,
       triage_stage_run_id,
       fetch_artifact_id,
       decision,
       basis,
       reason_code,
       reason_detail,
       classifier_name,
       classifier_version,
       evidence
     )
     values (
       coalesce($1, gen_random_uuid()),
       $2,
       $3,
       $4,
       $5,
       $6,
       $7,
       $8,
       $9,
       $10
     )
     returning *`,
    [
      id,
      triageStageRunId,
      fetchArtifactId,
      decision,
      basis,
      reasonCode,
      reasonDetail,
      classifierName,
      classifierVersion,
      evidence || {},
    ],
  );

  return result.rows[0] || null;
}

export async function insertCrawlFrontierItem(
  {
    id = null,
    fetchStageRunId,
    hospitalSystemId,
    facilityId = null,
    seedUrlId = null,
    discoveredFromItemId = null,
    originalUrl,
    normalizedUrl,
    finalUrl = null,
    depth = 0,
    queueStatus = 'queued',
    sourceContext = null,
    lastError = null,
  },
  client = null,
) {
  const q = client || { query };
  const result = await q.query(
    `insert into crawl_frontier_items (
       id,
       fetch_stage_run_id,
       hospital_system_id,
       facility_id,
       seed_url_id,
       discovered_from_item_id,
       original_url,
       normalized_url,
       final_url,
       depth,
       queue_status,
       source_context,
       last_error
     )
     values (
       coalesce($1, gen_random_uuid()),
       $2,
       $3,
       $4,
       $5,
       $6,
       $7,
       $8,
       $9,
       $10,
       $11,
       $12,
       $13
     )
     returning *`,
    [
      id,
      fetchStageRunId,
      hospitalSystemId,
      facilityId,
      seedUrlId,
      discoveredFromItemId,
      originalUrl,
      normalizedUrl,
      finalUrl,
      depth,
      queueStatus,
      sourceContext,
      lastError,
    ],
  );

  return result.rows[0] || null;
}

export async function updateCrawlFrontierItem(
  {
    id,
    finalUrl = undefined,
    queueStatus = undefined,
    sourceContext = undefined,
    lastError = undefined,
  },
  client = null,
) {
  if (!id) return null;

  const q = client || { query };
  const result = await q.query(
    `update crawl_frontier_items
     set final_url = coalesce($2, final_url),
         queue_status = coalesce($3, queue_status),
         source_context = coalesce($4, source_context),
         last_error = case
           when $5::text is null then last_error
           else $5
         end,
         updated_at = now()
     where id = $1
     returning *`,
    [id, finalUrl, queueStatus, sourceContext, lastError],
  );

  return result.rows[0] || null;
}

export async function listCrawlFrontierItemsForStageRun(
  {
    stageRunId,
  } = {},
  client = null,
) {
  if (!stageRunId) return [];

  const q = client || { query };
  const result = await q.query(
    `select *
     from crawl_frontier_items
     where fetch_stage_run_id = $1
     order by created_at asc`,
    [stageRunId],
  );

  return result.rows;
}

export async function insertTriageOverride(
  {
    triageDecisionId,
    overrideDecision,
    notes = null,
    createdBy = null,
  },
  client = null,
) {
  const q = client || { query };
  const result = await q.query(
    `insert into triage_overrides (
       triage_decision_id,
       override_decision,
       notes,
       created_by
     )
     values ($1, $2, $3, $4)
     returning *`,
    [triageDecisionId, overrideDecision, notes, createdBy],
  );

  return result.rows[0] || null;
}

export async function getLatestTriageOverride(triageDecisionId, client = null) {
  if (!triageDecisionId) return null;

  const q = client || { query };
  const result = await q.query(
    `select *
     from triage_overrides
     where triage_decision_id = $1
     order by created_at desc
     limit 1`,
    [triageDecisionId],
  );

  return result.rows[0] || null;
}

export async function linkParsedArtifactToSourceDocument(
  {
    sourceDocumentId,
    parsedArtifactId,
    extractedText = null,
    parserVersion = null,
  },
  client = null,
) {
  const q = client || { query };
  await q.query(
    `update source_documents
     set parsed_artifact_id = $2,
         extracted_text = coalesce($3, extracted_text),
         parser_version = coalesce($4, parser_version)
     where id = $1`,
    [sourceDocumentId, parsedArtifactId, extractedText, parserVersion],
  );
}

export async function listStageSourceDocuments(
  {
    systemId,
    sourceDocumentIds = [],
    sourceType = null,
  },
  client = null,
) {
  const q = client || { query };
  const params = [systemId];
  const clauses = ['sd.hospital_system_id = $1'];

  if (Array.isArray(sourceDocumentIds) && sourceDocumentIds.length > 0) {
    params.push(sourceDocumentIds);
    clauses.push(`sd.id = any($${params.length}::uuid[])`);
  }

  if (sourceType) {
    params.push(sourceType);
    clauses.push(`sd.source_type = $${params.length}`);
  }

  const result = await q.query(
    `with latest_parsed as (
       select distinct on (pa.source_document_id)
         pa.id,
         pa.source_document_id,
         pa.parse_status,
         pa.storage_path,
         pa.created_at
       from parsed_artifacts pa
       order by pa.source_document_id, pa.created_at desc
     )
     select
       sd.id,
       sd.hospital_system_id,
       sd.facility_id,
       sd.fetch_artifact_id,
       sd.source_url,
       sd.source_page_url,
       sd.source_type,
       sd.title,
       sd.fetched_at,
       sd.http_status,
       sd.content_hash,
       sd.storage_path,
       sd.extracted_text,
       sd.parser_version,
       sd.import_mode,
       sd.import_notes,
       hs.system_name,
       hs.canonical_domain,
       hs.state as system_state,
       f.facility_name,
       latest_parsed.id as latest_parsed_artifact_id,
       latest_parsed.parse_status as latest_parse_status,
       latest_parsed.storage_path as latest_parsed_storage_path,
       latest_parsed.created_at as latest_parsed_at
     from source_documents sd
     join hospital_systems hs on hs.id = sd.hospital_system_id
     left join facilities f on f.id = sd.facility_id
     left join latest_parsed on latest_parsed.source_document_id = sd.id
     where ${clauses.join(' and ')}
     order by sd.fetched_at desc nulls last, sd.created_at desc`,
    params,
  );

  return result.rows;
}

export async function listLatestParsedArtifactsForSystem(
  {
    systemId,
    sourceDocumentIds = [],
    sourceType = null,
  },
  client = null,
) {
  if (!systemId && (!Array.isArray(sourceDocumentIds) || sourceDocumentIds.length === 0)) {
    return [];
  }

  const q = client || { query };
  const params = [];
  const clauses = [];

  if (systemId) {
    params.push(systemId);
    clauses.push(`sd.hospital_system_id = $${params.length}`);
  }

  if (Array.isArray(sourceDocumentIds) && sourceDocumentIds.length > 0) {
    params.push(sourceDocumentIds);
    clauses.push(`sd.id = any($${params.length}::uuid[])`);
  }

  if (sourceType) {
    params.push(sourceType);
    clauses.push(`sd.source_type = $${params.length}`);
  }

  const result = await q.query(
    `with ranked as (
       select
         pa.*,
         sd.hospital_system_id,
         sd.facility_id,
         sd.fetch_artifact_id,
         sd.source_url,
         sd.source_page_url,
         sd.title,
         sd.content_hash,
         sd.fetched_at,
         sd.import_mode,
         hs.system_name,
         hs.canonical_domain,
         hs.state as system_state,
         f.facility_name,
         row_number() over (
           partition by pa.source_document_id
           order by pa.created_at desc
         ) as parsed_rank
       from parsed_artifacts pa
       join source_documents sd on sd.id = pa.source_document_id
       join hospital_systems hs on hs.id = sd.hospital_system_id
       left join facilities f on f.id = sd.facility_id
       where ${clauses.join(' and ')}
     )
     select *
     from ranked
     where parsed_rank = 1
     order by fetched_at desc nulls last, created_at desc`,
    params,
  );

  return result.rows;
}

export async function listPipelineStageRuns(
  {
    systemId = null,
    stageKey = null,
    limit = 25,
  } = {},
  client = null,
) {
  const q = client || { query };
  const params = [];
  const clauses = [];

  if (systemId) {
    params.push(systemId);
    clauses.push(`hospital_system_id = $${params.length}`);
  }

  if (stageKey) {
    params.push(stageKey);
    clauses.push(`stage_key = $${params.length}`);
  }

  params.push(Math.max(1, Math.min(100, Number(limit || 25))));

  const whereClause = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const result = await q.query(
    `select
       id,
       stage_key,
       stage_label,
       state,
       hospital_system_id,
       system_name,
       status,
       input_summary,
       output_summary,
       error_summary,
       created_at,
       completed_at
     from pipeline_stage_runs
     ${whereClause}
     order by created_at desc
     limit $${params.length}`,
    params,
  );

  return result.rows;
}

export async function getLatestPipelineStageRun(
  {
    systemId = null,
    state = null,
    stageKey,
  } = {},
  client = null,
) {
  if ((!systemId && !state) || !stageKey) return null;

  const q = client || { query };
  const scopeClause = systemId ? 'hospital_system_id = $1' : 'state = $1 and hospital_system_id is null';
  const result = await q.query(
    `select
       id,
       stage_key,
       stage_label,
       state,
       hospital_system_id,
       system_name,
       status,
       input_summary,
       output_summary,
       error_summary,
       created_at,
       completed_at
     from pipeline_stage_runs
     where ${scopeClause}
       and stage_key = $2
     order by created_at desc
     limit 1`,
    [systemId || state, stageKey],
  );

  return result.rows[0] || null;
}

export async function getPipelineStageRunById(id, client = null) {
  if (!id) return null;

  const q = client || { query };
  const result = await q.query(
    `select
       id,
       stage_key,
       stage_label,
       pipeline_run_history_id,
       parent_stage_run_id,
       state,
       hospital_system_id,
       system_name,
       status,
       input_summary,
       output_summary,
       error_summary,
       created_at,
       completed_at
     from pipeline_stage_runs
     where id = $1
     limit 1`,
    [id],
  );

  return result.rows[0] || null;
}

export async function listFetchArtifactsForStageRun(
  {
    stageRunId,
  } = {},
  client = null,
) {
  if (!stageRunId) return [];

  const q = client || { query };
  const result = await q.query(
    `select
       fa.*,
       hs.system_name,
       hs.state as system_state,
       hs.canonical_domain,
       f.facility_name
     from fetch_artifacts fa
     left join hospital_systems hs on hs.id = fa.hospital_system_id
     left join facilities f on f.id = fa.facility_id
     where fa.fetch_stage_run_id = $1
     order by fa.fetched_at asc, fa.created_at asc`,
    [stageRunId],
  );

  return result.rows;
}

export async function listAcceptedSourceDocumentsForStageRun(
  {
    stageRunId,
  } = {},
  client = null,
) {
  if (!stageRunId) return [];

  const q = client || { query };
  const result = await q.query(
    `select
       sd.*,
       hs.system_name,
       hs.state as system_state,
       hs.canonical_domain,
       f.facility_name
     from source_documents sd
     join hospital_systems hs on hs.id = sd.hospital_system_id
     left join facilities f on f.id = sd.facility_id
     where sd.accepted_stage_run_id = $1
     order by sd.fetched_at desc nulls last, sd.created_at desc`,
    [stageRunId],
  );

  return result.rows;
}

export async function listParsedArtifactsForStageRun(
  {
    stageRunId,
  } = {},
  client = null,
) {
  if (!stageRunId) return [];

  const q = client || { query };
  const result = await q.query(
    `select
       pa.*,
       sd.hospital_system_id,
       sd.facility_id,
       sd.source_url,
       sd.source_page_url,
       sd.source_type as source_document_type,
       sd.title,
       sd.content_hash,
       sd.fetched_at,
       hs.system_name,
       hs.state as system_state,
       hs.canonical_domain,
       f.facility_name
     from parsed_artifacts pa
     left join source_documents sd on sd.id = pa.source_document_id
     left join hospital_systems hs on hs.id = sd.hospital_system_id
     left join facilities f on f.id = sd.facility_id
     where pa.parse_stage_run_id = $1
     order by pa.created_at asc`,
    [stageRunId],
  );

  return result.rows;
}

export async function getFetchArtifactById(id, client = null) {
  if (!id) return null;

  const q = client || { query };
  const result = await q.query(
    `with latest_triage as (
       select distinct on (td.fetch_artifact_id)
         td.id,
         td.fetch_artifact_id,
         td.triage_stage_run_id,
         td.decision,
         td.basis,
         td.reason_code,
         td.reason_detail,
         td.classifier_name,
         td.classifier_version,
         td.evidence,
         td.created_at
       from triage_decisions td
       where td.fetch_artifact_id = $1
       order by td.fetch_artifact_id, td.created_at desc
     ),
     accepted_source_document as (
       select distinct on (coalesce(sd.fetch_artifact_id::text, sd.triage_decision_id::text))
         sd.id,
         sd.fetch_artifact_id,
         sd.triage_decision_id,
         sd.source_type,
         sd.source_url
       from source_documents sd
       where sd.fetch_artifact_id = $1
          or sd.triage_decision_id in (select id from latest_triage)
       order by coalesce(sd.fetch_artifact_id::text, sd.triage_decision_id::text), sd.created_at desc
     )
     select
       fa.*,
       hs.system_name,
       hs.state as system_state,
       hs.canonical_domain,
       f.facility_name,
       lt.id as latest_triage_decision_id,
       lt.triage_stage_run_id as latest_triage_stage_run_id,
       lt.decision as latest_triage_decision,
       lt.basis as latest_triage_basis,
       lt.reason_code as latest_triage_reason_code,
       lt.reason_detail as latest_triage_reason_detail,
       lt.evidence as latest_triage_evidence,
       lt.created_at as latest_triage_created_at,
       sd.id as source_document_id,
       sd.source_type as accepted_source_type,
       sd.source_url as accepted_source_url
     from fetch_artifacts fa
     left join hospital_systems hs on hs.id = fa.hospital_system_id
     left join facilities f on f.id = fa.facility_id
     left join latest_triage lt on lt.fetch_artifact_id = fa.id
     left join accepted_source_document sd
       on sd.fetch_artifact_id = fa.id
       or (sd.fetch_artifact_id is null and sd.triage_decision_id = lt.id)
     where fa.id = $1
     limit 1`,
    [id],
  );

  return result.rows[0] || null;
}

export async function listTriageDecisionsForStageRun(
  {
    stageRunId,
    decision = null,
  } = {},
  client = null,
) {
  if (!stageRunId) return [];

  const q = client || { query };
  const params = [stageRunId];
  let decisionClause = '';
  if (decision) {
    params.push(decision);
    decisionClause = `and td.decision = $${params.length}`;
  }

  const result = await q.query(
    `select
       td.*,
       fa.hospital_system_id,
       fa.facility_id,
       fa.requested_url,
       fa.final_url,
       fa.source_page_url,
       fa.http_status,
       fa.content_type,
       fa.source_type,
       fa.title,
       fa.content_hash,
       fa.fetch_backend,
       fa.storage_path,
       fa.headers,
       fa.fetch_metadata,
       fa.fetched_at,
       hs.system_name,
       hs.state as system_state,
       hs.canonical_domain,
       f.facility_name
     from triage_decisions td
     join fetch_artifacts fa on fa.id = td.fetch_artifact_id
     left join hospital_systems hs on hs.id = fa.hospital_system_id
     left join facilities f on f.id = fa.facility_id
     where td.triage_stage_run_id = $1
       ${decisionClause}
     order by td.created_at asc`,
    params,
  );

  return result.rows;
}

export async function getTriageDecisionById(id, client = null) {
  if (!id) return null;

  const q = client || { query };
  const result = await q.query(
    `with latest_override as (
       select distinct on (triage_decision_id)
         id,
         triage_decision_id,
         override_decision,
         notes,
         created_by,
         created_at
       from triage_overrides
       where triage_decision_id = $1
       order by triage_decision_id, created_at desc
     )
     select
       td.*,
       fa.hospital_system_id,
       fa.facility_id,
       fa.requested_url,
       fa.final_url,
       fa.source_page_url,
       fa.http_status,
       fa.content_type,
       fa.source_type,
       fa.title,
       fa.content_hash,
       fa.fetch_backend,
       fa.storage_path,
       fa.headers,
       fa.fetch_metadata,
       fa.fetched_at,
       hs.system_name,
       hs.state as system_state,
       hs.canonical_domain,
       f.facility_name,
       sd.id as source_document_id,
        sd.source_url as accepted_source_url,
       lo.id as latest_override_id,
       lo.override_decision as latest_override_decision,
       lo.notes as latest_override_notes,
       lo.created_by as latest_override_created_by,
       lo.created_at as latest_override_created_at
     from triage_decisions td
     join fetch_artifacts fa on fa.id = td.fetch_artifact_id
     left join hospital_systems hs on hs.id = fa.hospital_system_id
     left join facilities f on f.id = fa.facility_id
     left join source_documents sd on sd.triage_decision_id = td.id
     left join latest_override lo on lo.triage_decision_id = td.id
     where td.id = $1
     limit 1`,
    [id],
  );

  return result.rows[0] || null;
}

export async function getParsedArtifactById(id, client = null) {
  if (!id) return null;

  const q = client || { query };
  const result = await q.query(
    `select
       pa.*,
       sd.hospital_system_id,
       sd.facility_id,
       sd.source_url,
       sd.source_page_url,
       sd.source_type as source_document_type,
       sd.title,
       sd.content_hash,
       sd.fetched_at,
       hs.system_name,
       hs.state as system_state,
       hs.canonical_domain,
       f.facility_name
     from parsed_artifacts pa
     left join source_documents sd on sd.id = pa.source_document_id
     left join hospital_systems hs on hs.id = sd.hospital_system_id
     left join facilities f on f.id = sd.facility_id
     where pa.id = $1
     limit 1`,
    [id],
  );

  return result.rows[0] || null;
}
