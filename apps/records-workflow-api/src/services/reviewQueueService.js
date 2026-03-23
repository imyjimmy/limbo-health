import { query } from '../db.js';
import { isUsStateCode, normalizeStateCode } from '../utils/states.js';
import { listStateSystems } from './stateSummaryService.js';

function assertState(state) {
  const normalizedState = normalizeStateCode(state);
  if (!isUsStateCode(normalizedState)) {
    throw new Error(`A valid US state code is required: ${state}`);
  }
  return normalizedState;
}

function toContentUrl(sourceDocumentId) {
  return `/api/records-workflow/source-documents/${sourceDocumentId}/content`;
}

export async function getStateReviewQueue(state) {
  const normalizedState = assertState(state);
  const stateSystems = await listStateSystems(normalizedState);
  const zeroPdfSystems = stateSystems.systems
    .filter((system) => system.zero_pdf)
    .map((system) => ({
      hospital_system_id: system.hospital_system_id,
      system_name: system.system_name,
      domain: system.domain,
      stats: system.stats,
    }));

  const [
    parseFailures,
    lowConfidenceDrafts,
    staleTemplates,
    suspiciousFilenames,
    partialWorkflows,
    manualImportsPendingRecrawl,
  ] = await Promise.all([
    query(
      `with latest_parsed_artifacts as (
         select distinct on (pa.source_document_id)
           pa.source_document_id,
           pa.parse_status,
           pa.summary,
           pa.created_at
         from parsed_artifacts pa
         join source_documents sd on sd.id = pa.source_document_id
         join hospital_systems hs on hs.id = sd.hospital_system_id
         where hs.state = $1
         order by pa.source_document_id, pa.created_at desc
       )
       select
         sd.id as source_document_id,
         hs.id as hospital_system_id,
         hs.system_name,
         f.id as facility_id,
         f.facility_name,
         sd.source_url,
         sd.title,
         sd.fetched_at,
         latest_parsed_artifacts.parse_status as pdf_parse_status,
         latest_parsed_artifacts.summary->>'parse_error' as pdf_parse_error
       from source_documents sd
       join hospital_systems hs on hs.id = sd.hospital_system_id
       left join facilities f on f.id = sd.facility_id
       join latest_parsed_artifacts on latest_parsed_artifacts.source_document_id = sd.id
       where hs.state = $1
         and sd.source_type = 'pdf'
         and coalesce(latest_parsed_artifacts.parse_status, '') in ('failed', 'empty_text')
       order by sd.fetched_at desc, hs.system_name asc`,
      [normalizedState],
    ),
    query(
      `with latest_form_runs as (
         select distinct on (er.source_document_id)
           er.source_document_id,
           er.status,
           er.structured_output,
           er.created_at
         from extraction_runs er
         join source_documents sd on sd.id = er.source_document_id
         join hospital_systems hs on hs.id = sd.hospital_system_id
         where hs.state = $1
           and er.extractor_name = 'pdf_form_understanding_openai'
         order by er.source_document_id, er.created_at desc
       )
       select
         sd.id as source_document_id,
         hs.id as hospital_system_id,
         hs.system_name,
         f.id as facility_id,
         f.facility_name,
         sd.source_url,
         sd.title,
         sd.fetched_at,
         latest_form_runs.status as extraction_status,
         coalesce((latest_form_runs.structured_output->'form_understanding'->>'confidence')::numeric, 0) as confidence,
         coalesce((latest_form_runs.structured_output->'form_understanding'->>'supported')::boolean, false) as supported,
         pqt.status as draft_status
       from source_documents sd
       join hospital_systems hs on hs.id = sd.hospital_system_id
       left join facilities f on f.id = sd.facility_id
       join latest_form_runs on latest_form_runs.source_document_id = sd.id
       left join pdf_question_templates pqt on pqt.source_document_id = sd.id
       where hs.state = $1
         and sd.source_type = 'pdf'
         and (
           latest_form_runs.status <> 'success'
           or coalesce((latest_form_runs.structured_output->'form_understanding'->>'confidence')::numeric, 0) < 0.85
           or coalesce((latest_form_runs.structured_output->'form_understanding'->>'supported')::boolean, false) = false
         )
       order by confidence asc, sd.fetched_at desc`,
      [normalizedState],
    ),
    query(
      `select
         pqt.id as template_id,
         pqt.status,
         sd.id as source_document_id,
         hs.id as hospital_system_id,
         hs.system_name,
         f.id as facility_id,
         f.facility_name,
         sd.source_url,
         sd.title,
         sd.fetched_at,
         pqt.updated_at
       from pdf_question_templates pqt
       join source_documents sd on sd.id = pqt.source_document_id
       join hospital_systems hs on hs.id = sd.hospital_system_id
       left join facilities f on f.id = sd.facility_id
       where hs.state = $1
         and pqt.status = 'stale'
       order by pqt.updated_at desc`,
      [normalizedState],
    ),
    query(
      `select
         sd.id as source_document_id,
         hs.id as hospital_system_id,
         hs.system_name,
         f.id as facility_id,
         f.facility_name,
         sd.source_url,
         sd.title,
         sd.storage_path,
         sd.fetched_at
       from source_documents sd
       join hospital_systems hs on hs.id = sd.hospital_system_id
       left join facilities f on f.id = sd.facility_id
       where hs.state = $1
         and sd.source_type = 'pdf'
         and coalesce(sd.storage_path, '') ~ '(^|/)[0-9a-f]{64}\\.pdf$'
       order by sd.fetched_at desc`,
      [normalizedState],
    ),
    query(
      `with latest_workflow_runs as (
         select distinct on (er.source_document_id)
           er.source_document_id,
           er.status,
           er.created_at
         from extraction_runs er
         join source_documents sd on sd.id = er.source_document_id
         join hospital_systems hs on hs.id = sd.hospital_system_id
         where hs.state = $1
           and er.extractor_name = 'workflow_extractor'
         order by er.source_document_id, er.created_at desc
       )
       select
         sd.id as source_document_id,
         hs.id as hospital_system_id,
         hs.system_name,
         f.id as facility_id,
         f.facility_name,
         sd.source_url,
         sd.title,
         sd.fetched_at,
         latest_workflow_runs.status as extraction_status,
         sd.import_mode
       from source_documents sd
       join hospital_systems hs on hs.id = sd.hospital_system_id
       left join facilities f on f.id = sd.facility_id
       left join latest_workflow_runs on latest_workflow_runs.source_document_id = sd.id
       where hs.state = $1
         and (
           latest_workflow_runs.status = 'partial'
           or (sd.source_type = 'pdf' and sd.import_mode in ('manual_html', 'manual_pdf'))
         )
       order by sd.fetched_at desc`,
      [normalizedState],
    ),
    query(
      `select
         sd.id as source_document_id,
         hs.id as hospital_system_id,
         hs.system_name,
         f.id as facility_id,
         f.facility_name,
         sd.source_url,
         sd.title,
         sd.fetched_at,
         sd.import_mode
       from source_documents sd
       join hospital_systems hs on hs.id = sd.hospital_system_id
       left join facilities f on f.id = sd.facility_id
       left join records_workflows rw
         on rw.hospital_system_id = sd.hospital_system_id
        and rw.facility_id is not distinct from sd.facility_id
        and rw.official_page_url = sd.source_url
       where hs.state = $1
         and sd.import_mode in ('manual_html', 'manual_pdf')
         and rw.id is null
       order by sd.fetched_at desc`,
      [normalizedState],
    ),
  ]);

  return {
    state: normalizedState,
    buckets: {
      parse_failures: parseFailures.rows.map((row) => ({
        ...row,
        content_url: toContentUrl(row.source_document_id),
      })),
      zero_pdf_systems: zeroPdfSystems,
      low_confidence_question_drafts: lowConfidenceDrafts.rows.map((row) => ({
        ...row,
        content_url: toContentUrl(row.source_document_id),
      })),
      stale_templates: staleTemplates.rows.map((row) => ({
        ...row,
        content_url: toContentUrl(row.source_document_id),
      })),
      suspicious_filenames: suspiciousFilenames.rows.map((row) => ({
        ...row,
        content_url: toContentUrl(row.source_document_id),
      })),
      partial_workflows: partialWorkflows.rows.map((row) => ({
        ...row,
        content_url: toContentUrl(row.source_document_id),
      })),
      manual_imports_pending_recrawl: manualImportsPendingRecrawl.rows.map((row) => ({
        ...row,
        content_url: toContentUrl(row.source_document_id),
      })),
    },
  };
}
