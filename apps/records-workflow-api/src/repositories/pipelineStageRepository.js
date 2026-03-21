import { query } from '../db.js';

export async function insertPipelineStageRun(
  {
    stageKey,
    stageLabel,
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
       state,
       hospital_system_id,
       system_name,
       status,
       input_summary,
       output_summary,
       error_summary,
       completed_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, case when $6 = 'running' then null else now() end)
     returning *`,
    [
      stageKey,
      stageLabel,
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
       source_document_id,
       source_type,
       parser_name,
       parser_version,
       parse_status,
       storage_path,
       extracted_text,
       summary
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning *`,
    [
      id,
      parseStageRunId,
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
    `with ranked as (
       select
         pa.*,
         sd.hospital_system_id,
         sd.facility_id,
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
