import { query } from '../db.js';

function toContentUrl(sourceDocumentId) {
  return `/api/records-workflow/source-documents/${sourceDocumentId}/content`;
}

export async function getHospitalSystemDetail(systemId) {
  const [systemResult, facilitiesResult, seedUrlsResult, sourceDocumentsResult, workflowsResult] =
    await Promise.all([
      query(
        `select
           id,
           system_name,
           canonical_domain,
           state
         from hospital_systems
         where id = $1
           and active = true
         limit 1`,
        [systemId],
      ),
      query(
        `select
           id,
           facility_name,
           city,
           state,
           facility_type,
           facility_page_url,
           external_facility_id
         from facilities
         where hospital_system_id = $1
           and active = true
         order by facility_name asc, city asc nulls last`,
        [systemId],
      ),
      query(
        `select
           su.id,
           su.url,
           su.seed_type,
           su.approved_by_human,
           su.evidence_note,
           su.facility_id,
           f.facility_name,
           su.created_at
         from seed_urls su
         left join facilities f on f.id = su.facility_id
         where su.hospital_system_id = $1
           and su.active = true
         order by su.created_at asc`,
        [systemId],
      ),
      query(
        `with latest_workflow_runs as (
           select distinct on (er.source_document_id)
             er.source_document_id,
             er.status,
             er.structured_output,
             er.created_at
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
             er.structured_output,
             er.created_at
           from extraction_runs er
           join source_documents sd on sd.id = er.source_document_id
           where sd.hospital_system_id = $1
             and er.extractor_name = 'pdf_form_understanding_openai'
           order by er.source_document_id, er.created_at desc
         ),
         version_counts as (
           select
             source_document_id,
             count(*)::int as published_versions
           from pdf_question_template_versions
           group by source_document_id
         )
         select
           sd.id,
           sd.facility_id,
           f.facility_name,
           sd.source_url,
           sd.source_type,
           sd.title,
           sd.fetched_at,
           sd.storage_path,
           sd.import_mode,
           sd.import_notes,
           latest_workflow_runs.status as latest_workflow_status,
           latest_workflow_runs.structured_output->'metadata'->>'pdfParseStatus' as pdf_parse_status,
           pqt.status as question_template_status,
           coalesce(version_counts.published_versions, 0) as published_versions,
           latest_form_runs.status as latest_question_extraction_status
         from source_documents sd
         left join facilities f on f.id = sd.facility_id
         left join latest_workflow_runs on latest_workflow_runs.source_document_id = sd.id
         left join latest_form_runs on latest_form_runs.source_document_id = sd.id
         left join pdf_question_templates pqt on pqt.source_document_id = sd.id
         left join version_counts on version_counts.source_document_id = sd.id
         where sd.hospital_system_id = $1
         order by sd.fetched_at desc, sd.created_at desc`,
        [systemId],
      ),
      query(
        `select
           rw.id,
           rw.facility_id,
           f.facility_name,
           rw.workflow_type,
           rw.official_page_url,
           rw.request_scope,
           rw.confidence,
           rw.updated_at
         from records_workflows rw
         left join facilities f on f.id = rw.facility_id
         where rw.hospital_system_id = $1
         order by rw.updated_at desc, rw.workflow_type asc`,
        [systemId],
      ),
    ]);

  const hospitalSystem = systemResult.rows[0] || null;
  if (!hospitalSystem) {
    return null;
  }

  return {
    hospital_system: hospitalSystem,
    facilities: facilitiesResult.rows,
    seed_urls: seedUrlsResult.rows,
    source_documents: sourceDocumentsResult.rows.map((row) => ({
      ...row,
      content_url: toContentUrl(row.id),
    })),
    workflows: workflowsResult.rows,
  };
}
