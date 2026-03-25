import fs from 'node:fs/promises';
import { query } from '../db.js';
import { resolveFetchArtifactPath } from '../utils/fetchArtifactStorage.js';
import { resolveSourceDocumentPath } from '../utils/sourceDocumentStorage.js';

function toContentUrl(sourceDocumentId) {
  return `/api/records-workflow/source-documents/${sourceDocumentId}/content`;
}

function toFetchArtifactContentUrl(fetchArtifactId) {
  return `/internal/fetch-artifacts/${fetchArtifactId}/content`;
}

export async function getHospitalSystemDetail(systemId) {
  const [
    systemResult,
    facilitiesResult,
    seedUrlsResult,
    sourceDocumentsResult,
    capturedFormsResult,
    workflowsResult,
  ] =
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
           su.active,
           su.approved_by_human,
           su.evidence_note,
           su.facility_id,
           f.facility_name,
           su.created_at
         from seed_urls su
         left join facilities f on f.id = su.facility_id
         where su.hospital_system_id = $1
         order by su.active desc, su.approved_by_human desc, su.created_at desc`,
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
         latest_parsed_artifacts as (
           select distinct on (pa.source_document_id)
             pa.source_document_id,
             pa.id,
             pa.parse_status,
             pa.storage_path,
             pa.created_at
           from parsed_artifacts pa
           join source_documents sd on sd.id = pa.source_document_id
           where sd.hospital_system_id = $1
           order by pa.source_document_id, pa.created_at desc
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
           sd.source_page_url,
           sd.source_type,
           sd.title,
           sd.fetched_at,
           sd.storage_path,
           sd.import_mode,
           sd.import_notes,
           latest_parsed_artifacts.id as latest_parsed_artifact_id,
           latest_parsed_artifacts.parse_status as latest_parse_status,
           latest_parsed_artifacts.storage_path as latest_parsed_storage_path,
           latest_workflow_runs.status as latest_workflow_status,
           coalesce(
             latest_parsed_artifacts.parse_status,
             latest_workflow_runs.structured_output->'metadata'->>'pdfParseStatus'
           ) as pdf_parse_status,
           pqt.status as question_template_status,
           coalesce(version_counts.published_versions, 0) as published_versions,
           latest_form_runs.status as latest_question_extraction_status
         from source_documents sd
         left join facilities f on f.id = sd.facility_id
         left join latest_parsed_artifacts on latest_parsed_artifacts.source_document_id = sd.id
         left join latest_workflow_runs on latest_workflow_runs.source_document_id = sd.id
         left join latest_form_runs on latest_form_runs.source_document_id = sd.id
         left join pdf_question_templates pqt on pqt.source_document_id = sd.id
         left join version_counts on version_counts.source_document_id = sd.id
         where sd.hospital_system_id = $1
         order by sd.fetched_at desc, sd.created_at desc`,
        [systemId],
      ),
      query(
        `with latest_triage as (
           select distinct on (td.fetch_artifact_id)
             td.fetch_artifact_id,
             td.id,
             td.decision,
             td.basis,
             td.reason_code,
             td.reason_detail,
             td.created_at
           from triage_decisions td
           join fetch_artifacts fa on fa.id = td.fetch_artifact_id
           where fa.hospital_system_id = $1
           order by td.fetch_artifact_id, td.created_at desc
         ),
         latest_override as (
           select distinct on (to1.triage_decision_id)
             to1.triage_decision_id,
             to1.id,
             to1.override_decision,
             to1.notes,
             to1.created_at
           from triage_overrides to1
           join latest_triage lt on lt.id = to1.triage_decision_id
           order by to1.triage_decision_id, to1.created_at desc
         ),
         accepted_documents as (
           select distinct on (coalesce(sd.fetch_artifact_id::text, sd.triage_decision_id::text))
             sd.fetch_artifact_id,
             sd.triage_decision_id,
             sd.id as accepted_source_document_id,
             sd.source_url as accepted_source_url,
             sd.title as accepted_title,
             sd.storage_path as accepted_storage_path,
             sd.created_at
           from source_documents sd
           where sd.hospital_system_id = $1
             and (sd.fetch_artifact_id is not null or sd.triage_decision_id is not null)
           order by coalesce(sd.fetch_artifact_id::text, sd.triage_decision_id::text), sd.created_at desc
         )
         select
           fa.id,
           fa.facility_id,
           f.facility_name,
           fa.requested_url,
           fa.final_url,
           fa.source_page_url,
           fa.http_status,
           fa.content_type,
           fa.source_type,
           fa.title,
           fa.content_hash,
           fa.response_bytes,
           fa.fetch_backend,
           fa.storage_path,
           fa.fetched_at,
           lt.id as triage_decision_id,
           lt.decision as triage_decision,
           lt.basis as triage_basis,
           lt.reason_code as triage_reason_code,
           lt.reason_detail as triage_reason_detail,
           lt.created_at as triage_created_at,
           lo.id as triage_override_id,
           lo.override_decision as triage_override_decision,
           lo.notes as triage_override_notes,
           lo.created_at as triage_override_created_at,
           coalesce(lo.override_decision, lt.decision, 'captured') as effective_decision,
           accepted_documents.accepted_source_document_id,
           accepted_documents.accepted_source_url,
           accepted_documents.accepted_title,
           accepted_documents.accepted_storage_path
         from fetch_artifacts fa
         left join facilities f on f.id = fa.facility_id
         left join latest_triage lt on lt.fetch_artifact_id = fa.id
         left join latest_override lo on lo.triage_decision_id = lt.id
         left join accepted_documents
           on accepted_documents.fetch_artifact_id = fa.id
           or (accepted_documents.fetch_artifact_id is null and accepted_documents.triage_decision_id = lt.id)
         where fa.hospital_system_id = $1
           and fa.source_type = 'pdf'
         order by fa.fetched_at desc, fa.created_at desc`,
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

  const capturedForms = await Promise.all(
    capturedFormsResult.rows.map(async (row) => {
      let contentAvailable = false;

      if (row.storage_path) {
        try {
          await fs.access(resolveFetchArtifactPath(row.storage_path));
          contentAvailable = true;
        } catch {
          contentAvailable = false;
        }
      }

      if (!contentAvailable && row.accepted_storage_path) {
        try {
          await fs.access(resolveSourceDocumentPath(row.accepted_storage_path));
          contentAvailable = true;
        } catch {
          contentAvailable = false;
        }
      }

      return {
        ...row,
        content_available: contentAvailable,
        content_url: toFetchArtifactContentUrl(row.id),
      };
    }),
  );

  capturedForms.sort((left, right) => {
    const availabilityDiff = Number(Boolean(right.content_available)) - Number(Boolean(left.content_available));
    if (availabilityDiff !== 0) return availabilityDiff;

    const acceptedDiff =
      Number(Boolean(right.accepted_source_document_id)) - Number(Boolean(left.accepted_source_document_id));
    if (acceptedDiff !== 0) return acceptedDiff;

    return new Date(right.fetched_at || 0).getTime() - new Date(left.fetched_at || 0).getTime();
  });

  return {
    hospital_system: hospitalSystem,
    facilities: facilitiesResult.rows,
    seed_urls: seedUrlsResult.rows,
    source_documents: sourceDocumentsResult.rows.map((row) => ({
      ...row,
      content_url: toContentUrl(row.id),
    })),
    captured_forms: capturedForms,
    workflows: workflowsResult.rows,
  };
}
