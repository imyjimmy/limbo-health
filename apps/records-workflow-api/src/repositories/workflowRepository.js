import path from 'node:path';
import { query, withTransaction } from '../db.js';
import {
  buildUnsupportedAutofillPayload,
} from '../utils/pdfFormUnderstanding.js';
import { normalizeStateCode } from '../utils/states.js';
import { collapseWhitespace, uniqueBy } from '../utils/text.js';

export async function upsertHospitalSystem({ systemName, domain, state = 'TX' }, client = null) {
  const q = client || { query };
  const normalizedState = normalizeStateCode(state) || 'TX';
  const result = await q.query(
    `insert into hospital_systems (system_name, canonical_domain, state)
     values ($1, $2, $3)
     on conflict (system_name, state)
     do update set canonical_domain = excluded.canonical_domain,
                   active = true,
                   updated_at = now()
     returning id, system_name, canonical_domain`,
    [systemName, domain, normalizedState]
  );

  return result.rows[0];
}

export async function findHospitalSystemByDomain({ domain, state = 'TX' }, client = null) {
  const normalizedState = normalizeStateCode(state) || 'TX';
  if (!domain) return null;

  const q = client || { query };
  const result = await q.query(
    `select id, system_name, canonical_domain, state
     from hospital_systems
     where state = $1
       and canonical_domain = $2
     limit 1`,
    [normalizedState, domain]
  );

  return result.rows[0] || null;
}

export async function findHospitalSystemByFacilityIdentity(
  { state = 'TX', facilities = [] } = {},
  client = null
) {
  const normalizedState = normalizeStateCode(state) || 'TX';
  if (!Array.isArray(facilities) || facilities.length === 0) {
    return null;
  }

  const q = client || { query };

  for (const facility of facilities) {
    const result = await q.query(
      `select hs.id, hs.system_name, hs.canonical_domain, hs.state
       from facilities f
       join hospital_systems hs on hs.id = f.hospital_system_id
       where hs.state = $1
         and hs.active = true
         and f.active = true
         and f.facility_name = $2
         and coalesce(f.city, '') = coalesce($3, '')
         and f.state = $4
       limit 1`,
      [
        normalizedState,
        facility.facilityName,
        facility.city || null,
        normalizeStateCode(facility.state) || normalizedState
      ]
    );

    if (result.rows[0]) {
      return result.rows[0];
    }
  }

  return null;
}

export async function findFacilityByIdentity(
  { hospitalSystemId, facilityName, city = null, state = 'TX' },
  client = null
) {
  const q = client || { query };
  const result = await q.query(
    `select id
     from facilities
     where hospital_system_id = $1
       and facility_name = $2
       and coalesce(city, '') = coalesce($3, '')
       and state = $4
     limit 1`,
    [hospitalSystemId, facilityName, city, state]
  );

  return result.rows[0]?.id || null;
}

export async function upsertFacility(
  {
    hospitalSystemId,
    facilityName,
    city = null,
    state = 'TX',
    facilityType = null,
    facilityPageUrl = null,
    externalFacilityId = null
  },
  client = null
) {
  const q = client || { query };

  const existingId = await findFacilityByIdentity(
    { hospitalSystemId, facilityName, city, state },
    q
  );

  if (!existingId) {
    const inserted = await q.query(
      `insert into facilities (
         hospital_system_id,
         facility_name,
         city,
         state,
         facility_type,
         facility_page_url,
         external_facility_id
       )
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        hospitalSystemId,
        facilityName,
        city,
        state,
        facilityType,
        facilityPageUrl,
        externalFacilityId
      ]
    );

    return inserted.rows[0].id;
  }

  await q.query(
    `update facilities
     set facility_type = coalesce($2, facility_type),
         facility_page_url = coalesce($3, facility_page_url),
         external_facility_id = coalesce($4, external_facility_id),
         active = true,
         updated_at = now()
     where id = $1`,
    [existingId, facilityType, facilityPageUrl, externalFacilityId]
  );

  return existingId;
}

export async function upsertSeedUrl(
  {
    hospitalSystemId,
    facilityId = null,
    url,
    seedType = 'system_records_page',
    active = true,
    approvedByHuman = false,
    evidenceNote = null,
  },
  client = null
) {
  const q = client || { query };

  const result = await q.query(
    `insert into seed_urls (
       hospital_system_id,
       facility_id,
       url,
       seed_type,
       active,
       approved_by_human,
       evidence_note
     )
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (hospital_system_id, url)
     do update set hospital_system_id = excluded.hospital_system_id,
                   facility_id = excluded.facility_id,
                   seed_type = excluded.seed_type,
                   active = excluded.active,
                   approved_by_human = excluded.approved_by_human,
                   evidence_note = excluded.evidence_note
     returning id`,
    [hospitalSystemId, facilityId, url, seedType, active, approvedByHuman, evidenceNote]
  );

  return result.rows[0].id;
}

export async function listActiveSeeds({
  systemName = null,
  state = null,
  systemId = null,
  facilityId = null,
  seedUrl = null,
  hospitalSystemIds = [],
} = {}) {
  const params = [];
  let where = 'where su.active = true and hs.active = true';

  if (state) {
    params.push(normalizeStateCode(state));
    where += ` and hs.state = $${params.length}`;
  }

  if (systemName) {
    params.push(systemName);
    where += ` and hs.system_name = $${params.length}`;
  }

  if (systemId) {
    params.push(systemId);
    where += ` and hs.id = $${params.length}`;
  }

  if (facilityId) {
    params.push(facilityId);
    where += ` and su.facility_id = $${params.length}`;
  }

  if (seedUrl) {
    params.push(seedUrl);
    where += ` and su.url = $${params.length}`;
  }

  if (Array.isArray(hospitalSystemIds) && hospitalSystemIds.length > 0) {
    params.push(hospitalSystemIds);
    where += ` and hs.id = any($${params.length}::uuid[])`;
  }

  const result = await query(
    `select
       su.id,
       su.url,
       su.seed_type,
       su.approved_by_human,
       su.evidence_note,
       su.hospital_system_id,
       su.facility_id,
       hs.system_name,
       hs.canonical_domain,
       hs.state as system_state,
       f.facility_name
     from seed_urls su
     join hospital_systems hs on hs.id = su.hospital_system_id
     left join facilities f on f.id = su.facility_id
     ${where}
     order by hs.system_name, su.created_at`,
    params
  );

  return result.rows;
}

export async function listKnownPdfSourcePages({
  systemName = null,
  state = null,
  systemId = null,
  facilityId = null,
  hospitalSystemIds = [],
} = {}) {
  const params = [];
  let where = 'where hs.active = true';

  if (state) {
    params.push(normalizeStateCode(state));
    where += ` and hs.state = $${params.length}`;
  }

  if (systemName) {
    params.push(systemName);
    where += ` and hs.system_name = $${params.length}`;
  }

  if (systemId) {
    params.push(systemId);
    where += ` and hs.id = $${params.length}`;
  }

  if (facilityId) {
    params.push(facilityId);
    where += ` and source_pages.facility_id = $${params.length}`;
  }

  if (Array.isArray(hospitalSystemIds) && hospitalSystemIds.length > 0) {
    params.push(hospitalSystemIds);
    where += ` and hs.id = any($${params.length}::uuid[])`;
  }

  const result = await query(
    `with source_pages as (
       select distinct
         sd.hospital_system_id,
         sd.facility_id,
         sd.source_page_url as url
       from source_documents sd
       where sd.source_type = 'pdf'
         and coalesce(sd.source_page_url, '') <> ''

       union

       select distinct
         rw.hospital_system_id,
         rw.facility_id,
         rw.official_page_url as url
       from records_workflows rw
       where coalesce(rw.official_page_url, '') <> ''
     )
     select distinct on (source_pages.hospital_system_id, source_pages.url)
       gen_random_uuid() as id,
       source_pages.url,
       'known_pdf_source_page'::text as seed_type,
       true as approved_by_human,
       'derived from existing PDF/source-page provenance'::text as evidence_note,
       source_pages.hospital_system_id,
       source_pages.facility_id,
       hs.system_name,
       hs.canonical_domain,
       hs.state as system_state,
       f.facility_name
     from source_pages
     join hospital_systems hs on hs.id = source_pages.hospital_system_id
     left join facilities f on f.id = source_pages.facility_id
     ${where}
     order by source_pages.hospital_system_id, source_pages.url, source_pages.facility_id nulls last`,
    params,
  );

  return result.rows;
}

export async function insertSourceDocument(
  {
    hospitalSystemId,
    facilityId = null,
    sourceUrl,
    sourcePageUrl = null,
    discoveredFromUrl = null,
    acceptedStageRunId = null,
    fetchArtifactId = null,
    triageDecisionId = null,
    sourceType,
    title,
    fetchedAt,
    httpStatus,
    contentHash,
    storagePath,
    extractedText,
    parserVersion,
    importMode = 'crawl',
    importNotes = null,
  },
  client = null
) {
  const q = client || { query };

  const result = await q.query(
    `insert into source_documents (
       hospital_system_id,
       facility_id,
       source_url,
       source_page_url,
       discovered_from_url,
       accepted_stage_run_id,
       fetch_artifact_id,
       triage_decision_id,
       source_type,
       title,
       fetched_at,
       http_status,
       content_hash,
       storage_path,
       extracted_text,
       parser_version,
       import_mode,
       import_notes
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     on conflict (hospital_system_id, source_url, content_hash)
     do update set hospital_system_id = case
                     when excluded.facility_id is not null then excluded.hospital_system_id
                     else source_documents.hospital_system_id
                   end,
                   facility_id = coalesce(excluded.facility_id, source_documents.facility_id),
                   fetched_at = excluded.fetched_at,
                   http_status = excluded.http_status,
                   title = excluded.title,
                   source_page_url = coalesce(excluded.source_page_url, source_documents.source_page_url),
                   discovered_from_url = coalesce(excluded.discovered_from_url, source_documents.discovered_from_url),
                   accepted_stage_run_id = coalesce(excluded.accepted_stage_run_id, source_documents.accepted_stage_run_id),
                   fetch_artifact_id = coalesce(excluded.fetch_artifact_id, source_documents.fetch_artifact_id),
                   triage_decision_id = coalesce(excluded.triage_decision_id, source_documents.triage_decision_id),
                   storage_path = excluded.storage_path,
                   extracted_text = excluded.extracted_text,
                   parser_version = excluded.parser_version,
                   import_mode = excluded.import_mode,
                   import_notes = excluded.import_notes
     returning id`,
    [
      hospitalSystemId,
      facilityId,
      sourceUrl,
      sourcePageUrl,
      discoveredFromUrl,
      acceptedStageRunId,
      fetchArtifactId,
      triageDecisionId,
      sourceType,
      title,
      fetchedAt,
      httpStatus,
      contentHash,
      storagePath,
      extractedText,
      parserVersion,
      importMode,
      importNotes,
    ]
  );

  return result.rows[0].id;
}

export async function listPdfSourceDocumentsByState({ state }, client = null) {
  const q = client || { query };
  const normalizedState = normalizeStateCode(state);
  const result = await q.query(
    `select
       sd.id,
       sd.source_url,
       sd.title,
       sd.content_hash,
       sd.storage_path,
       hs.system_name,
       hs.state as system_state,
       f.facility_name
     from source_documents sd
     join hospital_systems hs on hs.id = sd.hospital_system_id
     left join facilities f on f.id = sd.facility_id
     where sd.source_type = 'pdf'
       and hs.state = $1
     order by hs.system_name, sd.source_url`,
    [normalizedState]
  );

  return result.rows;
}

export async function updateSourceDocumentStoragePath(
  { sourceDocumentId, storagePath },
  client = null
) {
  const q = client || { query };
  await q.query(
    `update source_documents
     set storage_path = $2
     where id = $1`,
    [sourceDocumentId, storagePath]
  );
}

export async function insertExtractionRun(
  {
    sourceDocumentId,
    extractorName = 'workflow_extractor',
    extractorVersion = 'v1',
    status,
    structuredOutput
  },
  client = null
) {
  const q = client || { query };

  const result = await q.query(
    `insert into extraction_runs (
       source_document_id,
       extractor_name,
       extractor_version,
       status,
       structured_output
     )
     values ($1, $2, $3, $4, $5)
     returning id`,
    [sourceDocumentId, extractorName, extractorVersion, status, structuredOutput]
  );

  return result.rows[0].id;
}

export async function upsertPortalProfile(
  {
    hospitalSystemId,
    facilityId = null,
    portalName,
    portalUrl,
    portalScope,
    supportsFormalCopyRequestInPortal,
    notes = null
  },
  client = null
) {
  const q = client || { query };
  const scopeRank = {
    none: 0,
    unclear: 1,
    partial: 2,
    most_records: 3,
    full: 4
  };

  const existing = await q.query(
    `select
       id,
       portal_name,
       portal_url,
       portal_scope,
       supports_formal_copy_request_in_portal
     from portal_profiles
     where hospital_system_id = $1
       and facility_id is not distinct from $2
     order by updated_at desc
     limit 1`,
    [hospitalSystemId, facilityId]
  );

  if (existing.rows.length > 0) {
    const current = existing.rows[0];
    const portalId = current.id;
    const incomingRank = scopeRank[portalScope] ?? 0;
    const currentRank = scopeRank[current.portal_scope] ?? 0;
    const incomingHasPortalIdentity = Boolean(portalName || portalUrl);
    const preserveCurrent = !incomingHasPortalIdentity && incomingRank <= currentRank;

    const nextPortalName = preserveCurrent
      ? current.portal_name
      : portalName || current.portal_name;
    const nextPortalUrl = preserveCurrent
      ? current.portal_url
      : portalUrl || current.portal_url;
    const nextPortalScope = preserveCurrent ? current.portal_scope : portalScope;
    const nextSupportsFormal = preserveCurrent
      ? current.supports_formal_copy_request_in_portal
      : supportsFormalCopyRequestInPortal ??
        current.supports_formal_copy_request_in_portal;

    await q.query(
      `update portal_profiles
       set portal_name = $2,
           portal_url = $3,
           portal_scope = $4,
           supports_formal_copy_request_in_portal = $5,
           notes = $6,
           updated_at = now()
       where id = $1`,
      [
        portalId,
        nextPortalName,
        nextPortalUrl,
        nextPortalScope,
        nextSupportsFormal,
        notes
      ]
    );

    return portalId;
  }

  const inserted = await q.query(
    `insert into portal_profiles (
       hospital_system_id,
       facility_id,
       portal_name,
       portal_url,
       portal_scope,
       supports_formal_copy_request_in_portal,
       notes
     )
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [
      hospitalSystemId,
      facilityId,
      portalName,
      portalUrl,
      portalScope,
      supportsFormalCopyRequestInPortal,
      notes
    ]
  );

  return inserted.rows[0].id;
}

export async function upsertWorkflowBundle(
  {
    hospitalSystemId,
    facilityId = null,
    officialPageUrl,
    contentHash,
    verifiedAt,
    workflows
  },
  client = null
) {
  const q = client || { query };

  const workflowIds = [];

  for (const workflow of workflows) {
    const existing = await q.query(
      `select id
       from records_workflows
       where hospital_system_id = $1
         and facility_id is not distinct from $2
         and workflow_type = $3
         and official_page_url = $4
       limit 1`,
      [hospitalSystemId, facilityId, workflow.workflowType, officialPageUrl]
    );

    let workflowId;

    if (existing.rows.length > 0) {
      workflowId = existing.rows[0].id;
      await q.query(
        `update records_workflows
         set request_scope = $2,
             formal_request_required = $3,
             online_request_available = $4,
             portal_request_available = $5,
             email_available = $6,
             fax_available = $7,
             mail_available = $8,
             in_person_available = $9,
             phone_available = $10,
             turnaround_notes = $11,
             fee_notes = $12,
             special_instructions = $13,
             confidence = $14,
             last_verified_at = $15,
             content_hash = $16,
             updated_at = now()
         where id = $1`,
        [
          workflowId,
          workflow.requestScope,
          workflow.formalRequestRequired,
          workflow.onlineRequestAvailable,
          workflow.portalRequestAvailable,
          workflow.emailAvailable,
          workflow.faxAvailable,
          workflow.mailAvailable,
          workflow.inPersonAvailable,
          workflow.phoneAvailable,
          workflow.turnaroundNotes,
          workflow.feeNotes,
          workflow.specialInstructions,
          workflow.confidence,
          verifiedAt,
          contentHash
        ]
      );
    } else {
      const inserted = await q.query(
        `insert into records_workflows (
           hospital_system_id,
           facility_id,
           workflow_type,
           official_page_url,
           request_scope,
           formal_request_required,
           online_request_available,
           portal_request_available,
           email_available,
           fax_available,
           mail_available,
           in_person_available,
           phone_available,
           turnaround_notes,
           fee_notes,
           special_instructions,
           confidence,
           last_verified_at,
           content_hash
         )
         values (
           $1, $2, $3, $4, $5, $6, $7, $8, $9,
           $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
         )
         returning id`,
        [
          hospitalSystemId,
          facilityId,
          workflow.workflowType,
          officialPageUrl,
          workflow.requestScope,
          workflow.formalRequestRequired,
          workflow.onlineRequestAvailable,
          workflow.portalRequestAvailable,
          workflow.emailAvailable,
          workflow.faxAvailable,
          workflow.mailAvailable,
          workflow.inPersonAvailable,
          workflow.phoneAvailable,
          workflow.turnaroundNotes,
          workflow.feeNotes,
          workflow.specialInstructions,
          workflow.confidence,
          verifiedAt,
          contentHash
        ]
      );
      workflowId = inserted.rows[0].id;
    }

    await q.query('delete from workflow_contacts where records_workflow_id = $1', [workflowId]);
    for (const contact of workflow.contacts || []) {
      await q.query(
        `insert into workflow_contacts (records_workflow_id, contact_type, label, value)
         values ($1, $2, $3, $4)`,
        [workflowId, contact.type, contact.label || null, contact.value]
      );
    }

    await q.query('delete from workflow_forms where records_workflow_id = $1', [workflowId]);
    for (const form of workflow.forms || []) {
      await q.query(
        `insert into workflow_forms (
           records_workflow_id,
           form_name,
           form_url,
           form_format,
           language,
           required_for_request
         )
         values ($1, $2, $3, $4, $5, $6)`,
        [
          workflowId,
          form.name,
          form.url,
          form.format,
          form.language || null,
          form.requiredForRequest ?? null
        ]
      );
    }

    await q.query('delete from workflow_instructions where records_workflow_id = $1', [workflowId]);
    for (const instruction of workflow.instructions || []) {
      await q.query(
        `insert into workflow_instructions (
           records_workflow_id,
           instruction_kind,
           sequence_no,
           label,
           channel,
           value,
           details
         )
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          workflowId,
          instruction.instructionKind,
          instruction.sequenceNo ?? 0,
          instruction.label || null,
          instruction.channel || null,
          instruction.value || null,
          instruction.details
        ]
      );
    }

    workflowIds.push(workflowId);
  }

  return workflowIds;
}

export async function markStaleQuestionTemplatesForSourceDocument(
  {
    hospitalSystemId,
    sourceUrl,
    sourceDocumentId,
    contentHash = null,
  },
  client = null
) {
  const q = client || { query };

  if (!hospitalSystemId || !sourceUrl || !sourceDocumentId) {
    return {
      previousSourceDocumentIds: [],
      staleVersionIds: [],
    };
  }

  const previousDocuments = await q.query(
    `select id
     from source_documents
     where hospital_system_id = $1
       and source_url = $2
       and id <> $3
       and coalesce(content_hash, '') <> coalesce($4, '')`,
    [hospitalSystemId, sourceUrl, sourceDocumentId, contentHash]
  );

  const previousSourceDocumentIds = previousDocuments.rows.map((row) => row.id).filter(Boolean);
  if (previousSourceDocumentIds.length === 0) {
    return {
      previousSourceDocumentIds: [],
      staleVersionIds: [],
    };
  }

  await q.query(
    `update pdf_question_templates
     set status = 'stale',
         updated_at = now()
     where source_document_id = any($1::uuid[])
       and status in ('approved', 'unsupported')`,
    [previousSourceDocumentIds]
  );

  const staleVersions = await q.query(
    `update pdf_question_template_versions
     set status = 'stale'
     where source_document_id = any($1::uuid[])
       and status in ('approved', 'unsupported')
     returning id`,
    [previousSourceDocumentIds]
  );

  const staleVersionIds = staleVersions.rows.map((row) => row.id).filter(Boolean);
  if (staleVersionIds.length > 0) {
    await q.query(
      `update workflow_forms
       set published_question_template_version_id = null,
           updated_at = now()
       where published_question_template_version_id = any($1::uuid[])`,
      [staleVersionIds]
    );
  }

  return {
    previousSourceDocumentIds,
    staleVersionIds,
  };
}

export async function saveExtractionResult(payload) {
  return withTransaction(async (client) => {
    const sourceDocumentId = await insertSourceDocument(payload.sourceDocument, client);

    await insertExtractionRun(
      {
        sourceDocumentId,
        status: payload.status,
        structuredOutput: payload.structuredOutput
      },
      client
    );

    if (payload.portal) {
      await upsertPortalProfile(
        {
          hospitalSystemId: payload.sourceDocument.hospitalSystemId,
          facilityId: payload.sourceDocument.facilityId,
          portalName: payload.portal.portalName,
          portalUrl: payload.portal.portalUrl,
          portalScope: payload.portal.portalScope,
          supportsFormalCopyRequestInPortal:
            payload.portal.supportsFormalCopyRequestInPortal,
          notes: payload.portal.notes || null
        },
        client
      );
    }

    await upsertWorkflowBundle(
      {
        hospitalSystemId: payload.sourceDocument.hospitalSystemId,
        facilityId: payload.sourceDocument.facilityId,
        officialPageUrl: payload.sourceDocument.sourceUrl,
        contentHash: payload.sourceDocument.contentHash,
        verifiedAt: payload.sourceDocument.fetchedAt,
        workflows: payload.workflows
      },
      client
    );

    await markStaleQuestionTemplatesForSourceDocument(
      {
        hospitalSystemId: payload.sourceDocument.hospitalSystemId,
        sourceUrl: payload.sourceDocument.sourceUrl,
        sourceDocumentId,
        contentHash: payload.sourceDocument.contentHash,
      },
      client
    );

    return sourceDocumentId;
  });
}

export async function searchFacilities(searchTerm, limit = 20) {
  const q = `%${searchTerm}%`;
  const normalizedSearch = searchTerm.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const normalizedLike = `%${normalizedSearch}%`;
  const normalizedPrefix = `${normalizedSearch}%`;

  const result = await query(
    `select
       f.id as facility_id,
       f.facility_name,
       hs.system_name as hospital_system,
       f.city,
       f.state
     from facilities f
     join hospital_systems hs on hs.id = f.hospital_system_id
     where f.active = true
       and hs.active = true
       and (
         f.facility_name ilike $1
         or hs.system_name ilike $1
         or regexp_replace(lower(f.facility_name), '[^a-z0-9]+', '', 'g') like $2
         or regexp_replace(lower(hs.system_name), '[^a-z0-9]+', '', 'g') like $2
       )
     order by
       case
         when f.facility_name ilike $3 then 0
         when regexp_replace(lower(f.facility_name), '[^a-z0-9]+', '', 'g') like $4 then 1
         else 2
       end,
       f.facility_name asc
     limit $5`,
    [q, normalizedLike, `${searchTerm}%`, normalizedPrefix, limit]
  );

  return result.rows;
}

export async function listHospitalSystems(searchTerm = '', limit = 50) {
  const trimmed = searchTerm.trim();

  if (!trimmed) {
    const result = await query(
      `select
         id,
         system_name,
         canonical_domain,
         state
       from hospital_systems
       where active = true
       order by system_name asc
       limit $1`,
      [limit]
    );

    return result.rows;
  }

  const connectorInsensitive = (value) =>
    value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\band\b/g, ' ')
      .replace(/[^a-z0-9]+/g, '');

  const q = `%${trimmed}%`;
  const normalizedSearch = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const connectorInsensitiveSearch = connectorInsensitive(trimmed);
  const normalizedLike = `%${normalizedSearch}%`;
  const normalizedPrefix = `${normalizedSearch}%`;
  const connectorInsensitiveLike = `%${connectorInsensitiveSearch}%`;
  const connectorInsensitivePrefix = `${connectorInsensitiveSearch}%`;

  const result = await query(
    `select
       id,
       system_name,
       canonical_domain,
       state
     from hospital_systems
     where active = true
       and (
         system_name ilike $1
         or coalesce(canonical_domain, '') ilike $1
         or regexp_replace(lower(system_name), '[^a-z0-9]+', '', 'g') like $2
         or regexp_replace(lower(coalesce(canonical_domain, '')), '[^a-z0-9]+', '', 'g') like $2
         or regexp_replace(
           regexp_replace(
             regexp_replace(lower(system_name), '&', ' and ', 'g'),
             '(^|[^a-z0-9])and([^a-z0-9]|$)',
             '',
             'g'
           ),
           '[^a-z0-9]+',
           '',
           'g'
         ) like $5
         or regexp_replace(
           regexp_replace(
             regexp_replace(lower(coalesce(canonical_domain, '')), '&', ' and ', 'g'),
             '(^|[^a-z0-9])and([^a-z0-9]|$)',
             '',
             'g'
           ),
           '[^a-z0-9]+',
           '',
           'g'
         ) like $5
       )
     order by
       case
         when system_name ilike $3 then 0
         when regexp_replace(lower(system_name), '[^a-z0-9]+', '', 'g') like $4 then 1
         when regexp_replace(
           regexp_replace(
             regexp_replace(lower(system_name), '&', ' and ', 'g'),
             '(^|[^a-z0-9])and([^a-z0-9]|$)',
             '',
             'g'
           ),
           '[^a-z0-9]+',
           '',
           'g'
         ) like $6 then 2
         else 3
       end,
       system_name asc
     limit $7`,
    [
      q,
      normalizedLike,
      `${trimmed}%`,
      normalizedPrefix,
      connectorInsensitiveLike,
      connectorInsensitivePrefix,
      limit,
    ]
  );

  return result.rows;
}

export async function getHospitalSystemById(systemId) {
  const result = await query(
    `select
       id,
       system_name,
       canonical_domain,
       state
     from hospital_systems
     where id = $1 and active = true`,
    [systemId]
  );

  return result.rows[0] || null;
}

export async function getFacilityById(facilityId) {
  const result = await query(
    `select
       f.id,
       f.hospital_system_id,
       f.facility_name,
       f.city,
       f.state,
       hs.system_name as hospital_system
     from facilities f
     join hospital_systems hs on hs.id = f.hospital_system_id
     where f.id = $1 and f.active = true and hs.active = true`,
    [facilityId]
  );

  return result.rows[0] || null;
}

async function getWorkflowArtifacts(recordsWorkflowId) {
  if (!recordsWorkflowId) {
    return {
      contacts: [],
      forms: [],
      instructions: []
    };
  }

  const [contactsRes, formsRes, instructionsRes] = await Promise.all([
    query(
      `select contact_type as type, label, value
       from workflow_contacts
       where records_workflow_id = $1
       order by created_at asc`,
      [recordsWorkflowId]
    ),
    query(
      `select form_name as name, form_url as url, form_format as format
       from workflow_forms
       where records_workflow_id = $1
       order by created_at asc`,
      [recordsWorkflowId]
    ),
    query(
      `select
         instruction_kind as kind,
         sequence_no,
         label,
         channel,
         value,
         details
       from workflow_instructions
       where records_workflow_id = $1
       order by sequence_no asc, created_at asc`,
      [recordsWorkflowId]
    )
  ]);

  return {
    contacts: contactsRes.rows,
    forms: formsRes.rows,
    instructions: instructionsRes.rows
  };
}

function normalizeComparableUrl(value) {
  if (!value) return '';

  try {
    const normalized = new URL(value);
    normalized.hash = '';
    normalized.search = '';
    normalized.pathname = normalized.pathname.replace(/\/+$/, '') || '/';
    return normalized.toString();
  } catch {
    return String(value || '')
      .trim()
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }
}

function normalizeComparableLabel(value) {
  return collapseWhitespace(String(value || ''))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toCachedContentUrl(sourceDocumentId) {
  return `/api/records-workflow/source-documents/${sourceDocumentId}/content`;
}

function buildCachedDocumentFormName(document = {}) {
  const title = collapseWhitespace(document.title || '');
  if (title) {
    return title;
  }

  const sourceUrlName = (() => {
    try {
      const normalized = new URL(document.source_url || '');
      return decodeURIComponent(path.basename(normalized.pathname || ''));
    } catch {
      return path.basename(document.source_url || '');
    }
  })();
  const storageName = path.basename(document.storage_path || '');
  const bestName = sourceUrlName || storageName || 'Authorization Form';

  return collapseWhitespace(bestName.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' '));
}

async function listCachedPdfSourceDocuments({ hospitalSystemId, facilityId = undefined } = {}) {
  if (!hospitalSystemId) return [];

  const params = [hospitalSystemId];
  let facilityClause = 'and facility_id is null';
  let orderBy = 'order by fetched_at desc, source_url asc';

  if (typeof facilityId === 'string' && facilityId) {
    params.push(facilityId);
    facilityClause = 'and (facility_id = $2 or facility_id is null)';
    orderBy =
      'order by case when facility_id = $2 then 0 else 1 end, fetched_at desc, source_url asc';
  }

  const result = await query(
    `select
       id,
       facility_id,
       source_url,
       title,
       storage_path,
       fetched_at
     from source_documents
     where hospital_system_id = $1
       ${facilityClause}
       and source_type = 'pdf'
       and storage_path is not null
       and storage_path <> ''
     ${orderBy}`,
    params
  );

  return uniqueBy(result.rows, (row) => normalizeComparableUrl(row.source_url) || row.id);
}

async function attachCachedDocumentsToForms(
  forms = [],
  { hospitalSystemId, facilityId = undefined } = {}
) {
  const cachedDocuments = await listCachedPdfSourceDocuments({ hospitalSystemId, facilityId });
  const normalizedFormUrls = new Set(
    forms.map((form) => normalizeComparableUrl(form?.url)).filter(Boolean)
  );

  const cachedDocumentsWithNames = cachedDocuments.map((document) => ({
    ...document,
    derived_form_name: buildCachedDocumentFormName(document)
  }));
  const byExactUrl = new Map(
    cachedDocumentsWithNames.map((document) => [document.source_url, document])
  );
  const byNormalizedUrl = new Map(
    cachedDocumentsWithNames.map((document) => [
      normalizeComparableUrl(document.source_url),
      document
    ])
  );
  const byNormalizedName = new Map();

  for (const document of cachedDocumentsWithNames) {
    const normalizedName = normalizeComparableLabel(document.derived_form_name);
    if (!normalizedName) continue;
    if (!byNormalizedName.has(normalizedName)) {
      byNormalizedName.set(normalizedName, []);
    }
    byNormalizedName.get(normalizedName).push(document);
  }

  const matchedDocumentIds = new Set();
  const hydratedForms = forms.map((form) => {
    const normalizedFormUrl = normalizeComparableUrl(form?.url);
    const normalizedFormName = normalizeComparableLabel(form?.name);
    let cached =
      byExactUrl.get(form?.url) ||
      byNormalizedUrl.get(normalizedFormUrl);

    if (!cached && form?.format === 'pdf' && normalizedFormName) {
      const nameMatches = byNormalizedName.get(normalizedFormName) || [];
      if (nameMatches.length === 1) {
        cached = nameMatches[0];
      }
    }

    if (cached?.id) {
      matchedDocumentIds.add(cached.id);
    }

    return {
      ...form,
      cached_source_document_id: cached?.id || null,
      cached_content_url: cached ? toCachedContentUrl(cached.id) : null
    };
  });

  const fallbackForms = cachedDocumentsWithNames
    .filter((document) => !matchedDocumentIds.has(document.id))
    .filter((document) => {
      const normalizedSourceUrl = normalizeComparableUrl(document.source_url);
      return !normalizedSourceUrl || !normalizedFormUrls.has(normalizedSourceUrl);
    })
    .map((document) => ({
      name: document.derived_form_name,
      url: document.source_url,
      format: 'pdf',
      cached_source_document_id: document.id,
      cached_content_url: toCachedContentUrl(document.id)
    }));

  return [...hydratedForms, ...fallbackForms];
}

async function listLatestPublishedQuestionTemplatePayloads(sourceDocumentIds = []) {
  const normalizedIds = sourceDocumentIds.filter(Boolean);
  if (normalizedIds.length === 0) {
    return new Map();
  }

  const result = await query(
    `select distinct on (source_document_id)
       source_document_id,
       payload
     from pdf_question_template_versions
     where source_document_id = any($1::uuid[])
       and status in ('approved', 'unsupported')
     order by source_document_id, version_no desc, published_at desc`,
    [normalizedIds]
  );

  return new Map(
    result.rows.map((row) => [
      row.source_document_id,
      row.payload || buildUnsupportedAutofillPayload(),
    ])
  );
}

const QUESTION_FLOW_FOLLOW_UP_HINT_PATTERN = /\bif\b|\bother\b|\bspecify\b|\bdescribe\b|\bdetail\b|\bfill\b/i;
const QUESTION_FLOW_OTHER_PATTERN =
  /\bif\s*\(?other\)?\b|\bother\b|\bother\s*\(please specify\)|\bplease specify\b/i;
const QUESTION_FLOW_TRAILING_HINT_PATTERN =
  /\b(fill|field|text|value|answer|entry|details?|description)\b/g;
const QUESTION_FLOW_STOP_WORDS = new Set([
  'a',
  'all',
  'an',
  'answer',
  'and',
  'applicable',
  'apply',
  'be',
  'for',
  'if',
  'in',
  'of',
  'or',
  'please',
  'question',
  'rest',
  'selected',
  'the',
  'this',
  'to',
  'your',
]);

function normalizeQuestionFlowText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function trimQuestionFlowHintTokens(value) {
  return normalizeQuestionFlowText(value).replace(QUESTION_FLOW_TRAILING_HINT_PATTERN, ' ').trim();
}

function tokenizeQuestionFlowText(value) {
  return trimQuestionFlowHintTokens(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !QUESTION_FLOW_STOP_WORDS.has(token));
}

function buildQuestionFlowSignal(question) {
  return [
    question?.label,
    question?.help_text,
    ...(Array.isArray(question?.bindings)
      ? question.bindings
          .filter((binding) => binding && typeof binding.field_name === 'string')
          .map((binding) => binding.field_name)
      : []),
  ]
    .filter(Boolean)
    .join(' ');
}

function buildOptionFlowSignal(option) {
  return [
    option?.label,
    option?.id,
    ...(Array.isArray(option?.bindings)
      ? option.bindings
          .filter((binding) => binding && typeof binding.field_name === 'string')
          .map((binding) => binding.field_name)
      : []),
  ]
    .filter(Boolean)
    .join(' ');
}

function scoreQuestionVisibilityOptionMatch(question, option) {
  const questionSignal = normalizeQuestionFlowText(buildQuestionFlowSignal(question));
  const questionSignalTrimmed = trimQuestionFlowHintTokens(buildQuestionFlowSignal(question));
  const optionSignal = normalizeQuestionFlowText(buildOptionFlowSignal(option));
  const optionSignalTrimmed = trimQuestionFlowHintTokens(buildOptionFlowSignal(option));
  const questionTokens = new Set(tokenizeQuestionFlowText(buildQuestionFlowSignal(question)));
  const optionTokens = new Set(tokenizeQuestionFlowText(buildOptionFlowSignal(option)));

  let score = 0;

  if (QUESTION_FLOW_OTHER_PATTERN.test(questionSignal) && /\bother\b/.test(optionSignal)) {
    score += 6;
  }

  if (
    questionSignalTrimmed &&
    optionSignalTrimmed &&
    (questionSignalTrimmed.includes(optionSignalTrimmed) ||
      optionSignalTrimmed.includes(questionSignalTrimmed))
  ) {
    score += 5;
  }

  for (const token of questionTokens) {
    if (optionTokens.has(token)) {
      score += token === 'other' ? 3 : 2;
    }
  }

  return score;
}

function normalizeVisibilityRule(rule) {
  if (!rule || typeof rule !== 'object') return null;

  const parentQuestionId = String(
    rule.parent_question_id || rule.parentQuestionId || '',
  ).trim();
  const rawParentOptionIds = Array.isArray(rule.parent_option_ids)
    ? rule.parent_option_ids
    : Array.isArray(rule.parentOptionIds)
      ? rule.parentOptionIds
      : [];
  const parentOptionIds = rawParentOptionIds
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (!parentQuestionId || parentOptionIds.length === 0) {
    return null;
  }

  return {
    parent_question_id: parentQuestionId,
    parent_option_ids: Array.from(new Set(parentOptionIds)),
  };
}

function inferLegacyVisibilityRule(questions = [], questionIndex = 0) {
  const question = questions[questionIndex];
  if (!question || question.kind !== 'short_text') return null;

  const questionSignal = buildQuestionFlowSignal(question);
  if (!QUESTION_FLOW_FOLLOW_UP_HINT_PATTERN.test(questionSignal)) {
    return null;
  }

  let bestMatch = null;

  for (let parentIndex = questionIndex - 1; parentIndex >= 0; parentIndex -= 1) {
    const parentQuestion = questions[parentIndex];
    if (!parentQuestion || parentQuestion.kind === 'short_text') continue;

    const scoredOptions = (parentQuestion.options || [])
      .map((option) => ({
        option_id: option.id,
        score: scoreQuestionVisibilityOptionMatch(question, option),
      }))
      .filter((entry) => entry.score > 0);

    if (scoredOptions.length === 0) continue;

    const topScore = Math.max(...scoredOptions.map((entry) => entry.score));
    if (topScore < 4) continue;

    const dependency = {
      parent_question_id: parentQuestion.id,
      parent_option_ids: scoredOptions
        .filter((entry) => entry.score === topScore)
        .map((entry) => entry.option_id),
      score: topScore,
      parentIndex,
    };

    if (
      !bestMatch ||
      dependency.parentIndex > bestMatch.parentIndex ||
      (dependency.parentIndex === bestMatch.parentIndex && dependency.score > bestMatch.score)
    ) {
      bestMatch = dependency;
    }
  }

  if (!bestMatch) return null;

  return {
    parent_question_id: bestMatch.parent_question_id,
    parent_option_ids: bestMatch.parent_option_ids,
  };
}

function normalizeQuestionFlowLinkId(questionId) {
  const normalizedQuestionId = String(questionId || '').trim();
  return normalizedQuestionId || null;
}

function attachQuestionFlowMetadataToAutofillPayload(autofill = buildUnsupportedAutofillPayload()) {
  if (!autofill?.supported || !Array.isArray(autofill.questions) || autofill.questions.length === 0) {
    return autofill;
  }

  const questions = autofill.questions.map((question, questionIndex, allQuestions) => {
    const hasExplicitVisibilityRule =
      Object.prototype.hasOwnProperty.call(question || {}, 'visibility_rule') ||
      Object.prototype.hasOwnProperty.call(question || {}, 'visibilityRule');
    const visibilityRule = hasExplicitVisibilityRule
      ? normalizeVisibilityRule(question.visibility_rule || question.visibilityRule)
      : inferLegacyVisibilityRule(allQuestions, questionIndex);
    const previousQuestionId =
      normalizeQuestionFlowLinkId(question.previous_question_id || question.previousQuestionId) ||
      allQuestions[questionIndex - 1]?.id ||
      null;
    const nextQuestionId =
      normalizeQuestionFlowLinkId(question.next_question_id || question.nextQuestionId) ||
      allQuestions[questionIndex + 1]?.id ||
      null;

    return {
      ...question,
      visibility_rule: visibilityRule,
      previous_question_id: previousQuestionId,
      next_question_id: nextQuestionId,
    };
  });

  return {
    ...autofill,
    questions,
  };
}

async function attachAutofillMetadataToForms(forms = []) {
  const sourceDocumentIds = forms
    .map((form) => form?.cached_source_document_id)
    .filter((value) => typeof value === 'string' && value);
  const bySourceDocumentId = await listLatestPublishedQuestionTemplatePayloads(sourceDocumentIds);

  return forms.map((form) => ({
    ...form,
    autofill: attachQuestionFlowMetadataToAutofillPayload(
      form?.cached_source_document_id
        ? bySourceDocumentId.get(form.cached_source_document_id) || buildUnsupportedAutofillPayload()
        : buildUnsupportedAutofillPayload(),
    ),
  }));
}

function buildFormalMethods(medicalWorkflow) {
  const formalMethods = [];
  if (medicalWorkflow?.online_request_available) formalMethods.push('online_request');
  if (medicalWorkflow?.portal_request_available) formalMethods.push('portal');
  if (medicalWorkflow?.email_available) formalMethods.push('email');
  if (medicalWorkflow?.fax_available) formalMethods.push('fax');
  if (medicalWorkflow?.mail_available) formalMethods.push('mail');
  if (medicalWorkflow?.phone_available) formalMethods.push('phone');
  if (medicalWorkflow?.in_person_available) formalMethods.push('in_person');
  return formalMethods;
}

function hasPhotoIdRequirement(instructions = []) {
  return instructions.some((instruction) => {
    const haystack = [instruction?.label, instruction?.details, instruction?.value]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return /photo\s*i\.?d|valid photo id|driver'?s license|state i\.?d|identification/.test(
      haystack
    );
  });
}

function buildRequestPacket({
  facility = null,
  hospitalSystem = null,
  portal = null,
  workflows = [],
  contacts = [],
  forms = [],
  instructions = []
}) {
  const medicalWorkflow = workflows.find((workflow) => workflow.workflow_type === 'medical_records') || null;
  const specialWorkflows = workflows.filter((workflow) => workflow.workflow_type !== 'medical_records');
  const resolvedPortal = portal || {
    portal_name: null,
    portal_url: null,
    portal_scope: 'none',
    supports_formal_copy_request_in_portal: false
  };
  const formalMethods = buildFormalMethods(medicalWorkflow);
  const hasFormalRequestPath = Boolean(medicalWorkflow?.formal_request_required || forms.length > 0);
  const sources = workflows.map((workflow) => ({
    url: workflow.official_page_url,
    last_verified_at: workflow.last_verified_at
  }));

  return {
    ...(facility
      ? {
          facility: {
            id: facility.id,
            name: facility.facility_name,
            city: facility.city,
            state: facility.state,
            hospital_system: facility.hospital_system
          }
        }
      : {}),
    ...(hospitalSystem
      ? {
          hospital_system: {
            id: hospitalSystem.id,
            name: hospitalSystem.system_name,
            domain: hospitalSystem.canonical_domain,
            state: hospitalSystem.state
          }
        }
      : {}),
    portal: {
      name: resolvedPortal.portal_name,
      url: resolvedPortal.portal_url,
      scope: resolvedPortal.portal_scope,
      supports_formal_copy_request_in_portal:
        resolvedPortal.supports_formal_copy_request_in_portal ?? false
    },
    medical_workflow: medicalWorkflow
      ? {
          request_scope: medicalWorkflow.request_scope,
          formal_request_required: medicalWorkflow.formal_request_required ?? false,
          available_methods: formalMethods
        }
      : null,
    recommended_paths: [
      {
        type: 'portal',
        label: 'View available records now',
        available: resolvedPortal.portal_scope !== 'none'
      },
      {
        type: 'formal_request',
        label: 'Request complete or official copy',
        available: hasFormalRequestPath,
        methods: formalMethods
      }
    ],
    special_cases: specialWorkflows.map((workflow) => ({
      type: workflow.workflow_type,
      label:
        workflow.workflow_type === 'imaging'
          ? 'Imaging may require a separate request'
          : `${workflow.workflow_type} may require a separate request`
    })),
    contacts,
    forms,
    instructions,
    requires_photo_id: hasPhotoIdRequirement(instructions),
    sources
  };
}

export async function getEffectiveWorkflowForFacility(facilityId) {
  const facility = await getFacilityById(facilityId);
  if (!facility) return null;

  const portalRes = await query(
    `select *
     from portal_profiles
     where hospital_system_id = $1
       and (facility_id = $2 or facility_id is null)
     order by
       case when facility_id = $2 then 0 else 1 end,
       updated_at desc
     limit 1`,
    [facility.hospital_system_id, facility.id]
  );

  const workflowsRes = await query(
    `with ranked as (
       select
         rw.*,
         row_number() over (
           partition by workflow_type
           order by
             case when facility_id = $2 then 0 else 1 end,
             case
               when workflow_type = 'medical_records' and formal_request_required then 0
               when workflow_type = 'medical_records' then 1
               else 0
             end,
             case
               when workflow_type = 'medical_records'
                    and request_scope in ('mixed', 'complete_chart') then 0
               when workflow_type = 'medical_records' then 1
               else 0
             end,
             case
               when workflow_type = 'medical_records'
                    and official_page_url ~* '(medical-records|requesting-your-record|release|authorization)'
               then 0
               when workflow_type = 'medical_records' then 1
               else 0
             end,
             updated_at desc
         ) as rn
       from records_workflows rw
       where rw.hospital_system_id = $1
         and (rw.facility_id = $2 or rw.facility_id is null)
     )
     select * from ranked where rn = 1`,
    [facility.hospital_system_id, facility.id]
  );

  const workflows = workflowsRes.rows;
  const medicalWorkflow = workflows.find((workflow) => workflow.workflow_type === 'medical_records') || null;
  const artifacts = await getWorkflowArtifacts(medicalWorkflow?.id || null);
  const forms = await attachAutofillMetadataToForms(await attachCachedDocumentsToForms(artifacts.forms, {
    hospitalSystemId: facility.hospital_system_id,
    facilityId: facility.id
  }));
  const portal = portalRes.rows[0] || null;

  return buildRequestPacket({
    facility,
    portal,
    workflows,
    contacts: artifacts.contacts,
    forms,
    instructions: artifacts.instructions
  });
}

export async function getSystemRequestPacket(systemId) {
  const hospitalSystem = await getHospitalSystemById(systemId);
  if (!hospitalSystem) return null;

  const [portalRes, workflowsRes] = await Promise.all([
    query(
      `select *
       from portal_profiles
       where hospital_system_id = $1
         and facility_id is null
       order by updated_at desc
       limit 1`,
      [systemId]
    ),
    query(
      `with ranked as (
         select
           rw.*,
           row_number() over (
             partition by workflow_type
             order by
               case
                 when workflow_type = 'medical_records' and formal_request_required then 0
                 when workflow_type = 'medical_records' then 1
                 else 0
               end,
               case
                 when workflow_type = 'medical_records'
                      and request_scope in ('mixed', 'complete_chart') then 0
                 when workflow_type = 'medical_records' then 1
                 else 0
               end,
               case
                 when workflow_type = 'medical_records'
                      and official_page_url ~* '(medical-records|requesting-your-record|release|authorization)'
                 then 0
                 when workflow_type = 'medical_records' then 1
                 else 0
               end,
               updated_at desc
           ) as rn
         from records_workflows rw
         where rw.hospital_system_id = $1
           and rw.facility_id is null
       )
       select * from ranked where rn = 1`,
      [systemId]
    )
  ]);

  const workflows = workflowsRes.rows;
  const medicalWorkflow = workflows.find((workflow) => workflow.workflow_type === 'medical_records') || null;
  const artifacts = await getWorkflowArtifacts(medicalWorkflow?.id || null);
  const forms = await attachAutofillMetadataToForms(await attachCachedDocumentsToForms(artifacts.forms, {
    hospitalSystemId: systemId
  }));
  const portal = portalRes.rows[0] || null;

  return buildRequestPacket({
    hospitalSystem,
    portal,
    workflows,
    contacts: artifacts.contacts,
    forms,
    instructions: artifacts.instructions
  });
}

export async function getSourceDocumentById(sourceDocumentId) {
  const result = await query(
    `select
      id,
      source_url,
      source_page_url,
      source_type,
      storage_path,
      fetched_at
     from source_documents
     where id = $1`,
    [sourceDocumentId]
  );

  return result.rows[0] || null;
}

export async function getSystemWorkflows(systemId) {
  const result = await query(
    `select
       rw.*,
       hs.system_name
     from records_workflows rw
     join hospital_systems hs on hs.id = rw.hospital_system_id
     where rw.hospital_system_id = $1
       and rw.facility_id is null
     order by rw.workflow_type asc, rw.updated_at desc`,
    [systemId]
  );

  return result.rows;
}

export async function getExtractionRunById(runId) {
  const result = await query(
    `select
       er.*,
       sd.source_url,
       sd.fetched_at,
       sd.http_status
     from extraction_runs er
     join source_documents sd on sd.id = er.source_document_id
     where er.id = $1`,
    [runId]
  );

  return result.rows[0] || null;
}
