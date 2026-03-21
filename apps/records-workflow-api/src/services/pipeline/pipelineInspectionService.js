import fs from 'node:fs/promises';
import {
  getPipelineStageRunById,
  getFetchArtifactById,
  getParsedArtifactById,
  getTriageDecisionById,
  listAcceptedSourceDocumentsForStageRun,
  listCrawlFrontierItemsForStageRun,
  listFetchArtifactsForStageRun,
  listParsedArtifactsForStageRun,
  listPipelineStageRuns,
  listTriageDecisionsForStageRun,
} from '../../repositories/pipelineStageRepository.js';

function mapStageRun(row) {
  return {
    id: row.id,
    stage_key: row.stage_key,
    stage_label: row.stage_label,
    state: row.state,
    hospital_system_id: row.hospital_system_id,
    system_name: row.system_name,
    status: row.status,
    input_summary: row.input_summary || {},
    output_summary: row.output_summary || {},
    error_summary: row.error_summary || null,
    created_at: row.created_at,
    completed_at: row.completed_at,
  };
}

function mapFrontierItem(row) {
  return {
    id: row.id,
    fetch_stage_run_id: row.fetch_stage_run_id,
    hospital_system_id: row.hospital_system_id,
    facility_id: row.facility_id,
    seed_url_id: row.seed_url_id,
    discovered_from_item_id: row.discovered_from_item_id,
    original_url: row.original_url,
    normalized_url: row.normalized_url,
    final_url: row.final_url,
    depth: row.depth,
    queue_status: row.queue_status,
    source_context: row.source_context || null,
    last_error: row.last_error || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapFetchArtifact(row) {
  return {
    id: row.id,
    crawl_frontier_item_id: row.crawl_frontier_item_id,
    fetch_stage_run_id: row.fetch_stage_run_id,
    hospital_system_id: row.hospital_system_id,
    system_name: row.system_name,
    system_state: row.system_state,
    facility_id: row.facility_id,
    facility_name: row.facility_name,
    requested_url: row.requested_url,
    final_url: row.final_url,
    source_page_url: row.source_page_url || null,
    http_status: row.http_status,
    content_type: row.content_type,
    source_type: row.source_type,
    title: row.title || null,
    content_hash: row.content_hash || null,
    response_bytes: row.response_bytes,
    fetch_backend: row.fetch_backend || null,
    storage_path: row.storage_path,
    fetched_at: row.fetched_at,
  };
}

function mapTriageDecision(row) {
  return {
    id: row.id,
    triage_stage_run_id: row.triage_stage_run_id,
    fetch_artifact_id: row.fetch_artifact_id,
    decision: row.decision,
    basis: row.basis,
    reason_code: row.reason_code,
    reason_detail: row.reason_detail,
    classifier_name: row.classifier_name,
    classifier_version: row.classifier_version,
    evidence: row.evidence || {},
    created_at: row.created_at,
    fetch_artifact: {
      hospital_system_id: row.hospital_system_id,
      system_name: row.system_name,
      system_state: row.system_state,
      facility_id: row.facility_id,
      facility_name: row.facility_name,
      requested_url: row.requested_url,
      final_url: row.final_url,
      source_page_url: row.source_page_url || null,
      http_status: row.http_status,
      content_type: row.content_type,
      source_type: row.source_type,
      title: row.title || null,
      content_hash: row.content_hash || null,
      fetch_backend: row.fetch_backend || null,
      fetched_at: row.fetched_at,
    },
  };
}

function mapAcceptedSourceDocument(row) {
  return {
    id: row.id,
    hospital_system_id: row.hospital_system_id,
    system_name: row.system_name,
    system_state: row.system_state,
    facility_id: row.facility_id,
    facility_name: row.facility_name,
    source_url: row.source_url,
    source_page_url: row.source_page_url || null,
    discovered_from_url: row.discovered_from_url || null,
    source_type: row.source_type,
    title: row.title || null,
    content_hash: row.content_hash || null,
    storage_path: row.storage_path,
    http_status: row.http_status,
    fetched_at: row.fetched_at,
    triage_decision_id: row.triage_decision_id || null,
    fetch_artifact_id: row.fetch_artifact_id || null,
    parsed_artifact_id: row.parsed_artifact_id || null,
    created_at: row.created_at,
  };
}

function mapParsedArtifact(row) {
  return {
    id: row.id,
    parse_stage_run_id: row.parse_stage_run_id,
    fetch_artifact_id: row.fetch_artifact_id || null,
    source_document_id: row.source_document_id || null,
    hospital_system_id: row.hospital_system_id || null,
    system_name: row.system_name || null,
    system_state: row.system_state || null,
    facility_id: row.facility_id || null,
    facility_name: row.facility_name || null,
    source_url: row.source_url || null,
    source_page_url: row.source_page_url || null,
    source_type: row.source_type,
    source_document_type: row.source_document_type || null,
    title: row.title || null,
    content_hash: row.content_hash || null,
    fetched_at: row.fetched_at || null,
    parser_name: row.parser_name,
    parser_version: row.parser_version,
    parse_status: row.parse_status,
    storage_path: row.storage_path,
    extracted_text: row.extracted_text || '',
    summary: row.summary || {},
    created_at: row.created_at,
  };
}

export async function listStageRuns({
  systemId = null,
  stageKey = null,
  limit = 25,
} = {}) {
  const runs = await listPipelineStageRuns({
    systemId,
    stageKey,
    limit,
  });

  return {
    hospital_system_id: systemId || null,
    stage_key: stageKey || null,
    runs: runs.map(mapStageRun),
  };
}

export async function getFetchArtifactDetail(id) {
  const artifact = await getFetchArtifactById(id);
  if (!artifact) return null;

  return {
    id: artifact.id,
    fetch_stage_run_id: artifact.fetch_stage_run_id,
    hospital_system_id: artifact.hospital_system_id,
    system_name: artifact.system_name,
    system_state: artifact.system_state,
    facility_id: artifact.facility_id,
    facility_name: artifact.facility_name,
    requested_url: artifact.requested_url,
    final_url: artifact.final_url,
    source_page_url: artifact.source_page_url,
    http_status: artifact.http_status,
    content_type: artifact.content_type,
    source_type: artifact.source_type,
    title: artifact.title,
    content_hash: artifact.content_hash,
    response_bytes: artifact.response_bytes,
    fetch_backend: artifact.fetch_backend,
    storage_path: artifact.storage_path,
    headers: artifact.headers || {},
    fetch_metadata: artifact.fetch_metadata || {},
    fetched_at: artifact.fetched_at,
    latest_triage_decision: artifact.latest_triage_decision_id
      ? {
          id: artifact.latest_triage_decision_id,
          stage_run_id: artifact.latest_triage_stage_run_id,
          decision: artifact.latest_triage_decision,
          basis: artifact.latest_triage_basis,
          reason_code: artifact.latest_triage_reason_code,
          reason_detail: artifact.latest_triage_reason_detail,
          evidence: artifact.latest_triage_evidence || {},
          created_at: artifact.latest_triage_created_at,
        }
      : null,
    accepted_source_document: artifact.source_document_id
      ? {
          id: artifact.source_document_id,
          source_type: artifact.accepted_source_type,
          source_url: artifact.accepted_source_url,
        }
      : null,
  };
}

export async function getTriageDecisionDetail(id) {
  const decision = await getTriageDecisionById(id);
  if (!decision) return null;

  return {
    id: decision.id,
    triage_stage_run_id: decision.triage_stage_run_id,
    decision: decision.decision,
    basis: decision.basis,
    reason_code: decision.reason_code,
    reason_detail: decision.reason_detail,
    classifier_name: decision.classifier_name,
    classifier_version: decision.classifier_version,
    evidence: decision.evidence || {},
    created_at: decision.created_at,
    fetch_artifact: {
      id: decision.fetch_artifact_id,
      hospital_system_id: decision.hospital_system_id,
      system_name: decision.system_name,
      system_state: decision.system_state,
      facility_id: decision.facility_id,
      facility_name: decision.facility_name,
      requested_url: decision.requested_url,
      final_url: decision.final_url,
      source_page_url: decision.source_page_url,
      http_status: decision.http_status,
      content_type: decision.content_type,
      source_type: decision.source_type,
      title: decision.title,
      content_hash: decision.content_hash,
      fetch_backend: decision.fetch_backend,
      storage_path: decision.storage_path,
      fetch_metadata: decision.fetch_metadata || {},
      fetched_at: decision.fetched_at,
    },
    accepted_source_document: decision.source_document_id
      ? {
          id: decision.source_document_id,
          source_url: decision.accepted_source_url,
        }
      : null,
    latest_override: decision.latest_override_id
      ? {
          id: decision.latest_override_id,
          override_decision: decision.latest_override_decision,
          notes: decision.latest_override_notes,
          created_by: decision.latest_override_created_by,
          created_at: decision.latest_override_created_at,
        }
      : null,
  };
}

export async function getParsedArtifactDetail(id) {
  const artifact = await getParsedArtifactById(id);
  if (!artifact) return null;

  let payload = null;
  try {
    payload = JSON.parse(await fs.readFile(artifact.storage_path, 'utf8'));
  } catch {
    payload = null;
  }

  return {
    id: artifact.id,
    parse_stage_run_id: artifact.parse_stage_run_id,
    source_document_id: artifact.source_document_id,
    hospital_system_id: artifact.hospital_system_id,
    system_name: artifact.system_name,
    system_state: artifact.system_state,
    facility_id: artifact.facility_id,
    facility_name: artifact.facility_name,
    source_url: artifact.source_url,
    source_page_url: artifact.source_page_url,
    source_type: artifact.source_type,
    source_document_type: artifact.source_document_type,
    title: artifact.title,
    content_hash: artifact.content_hash,
    fetched_at: artifact.fetched_at,
    parser_name: artifact.parser_name,
    parser_version: artifact.parser_version,
    parse_status: artifact.parse_status,
    storage_path: artifact.storage_path,
    extracted_text: artifact.extracted_text,
    summary: artifact.summary || {},
    created_at: artifact.created_at,
    payload,
  };
}

export async function getStageRunDetail(id) {
  const stageRun = await getPipelineStageRunById(id);
  if (!stageRun) return null;

  const mapped = mapStageRun(stageRun);
  const detail = {
    ...mapped,
    seed_scope: null,
    frontier_items: [],
    fetch_artifacts: [],
    triage_decisions: [],
    accepted_source_documents: [],
    parsed_artifacts: [],
  };

  if (stageRun.stage_key === 'seed_scope_stage') {
    const artifactPath = stageRun.output_summary?.artifact_path || null;
    if (artifactPath) {
      try {
        detail.seed_scope = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
      } catch {
        detail.seed_scope = null;
      }
    }
  }

  if (stageRun.stage_key === 'fetch_stage') {
    const [frontierItems, fetchArtifacts] = await Promise.all([
      listCrawlFrontierItemsForStageRun({ stageRunId: stageRun.id }),
      listFetchArtifactsForStageRun({ stageRunId: stageRun.id }),
    ]);
    detail.frontier_items = frontierItems.map(mapFrontierItem);
    detail.fetch_artifacts = fetchArtifacts.map(mapFetchArtifact);
  }

  if (stageRun.stage_key === 'triage_stage') {
    const triageDecisions = await listTriageDecisionsForStageRun({ stageRunId: stageRun.id });
    detail.triage_decisions = triageDecisions.map(mapTriageDecision);
  }

  if (stageRun.stage_key === 'acceptance_stage') {
    const acceptedSourceDocuments = await listAcceptedSourceDocumentsForStageRun({
      stageRunId: stageRun.id,
    });
    detail.accepted_source_documents = acceptedSourceDocuments.map(mapAcceptedSourceDocument);
  }

  if (stageRun.stage_key === 'parse_stage') {
    const parsedArtifacts = await listParsedArtifactsForStageRun({
      stageRunId: stageRun.id,
    });
    detail.parsed_artifacts = parsedArtifacts.map(mapParsedArtifact);
  }

  return detail;
}
