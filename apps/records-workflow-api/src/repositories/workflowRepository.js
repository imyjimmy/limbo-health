import { query, withTransaction } from '../db.js';
import { normalizeStateCode } from '../utils/states.js';

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
    active = true
  },
  client = null
) {
  const q = client || { query };

  const result = await q.query(
    `insert into seed_urls (hospital_system_id, facility_id, url, seed_type, active)
     values ($1, $2, $3, $4, $5)
     on conflict (hospital_system_id, url)
     do update set hospital_system_id = excluded.hospital_system_id,
                   facility_id = excluded.facility_id,
                   seed_type = excluded.seed_type,
                   active = excluded.active
     returning id`,
    [hospitalSystemId, facilityId, url, seedType, active]
  );

  return result.rows[0].id;
}

export async function listActiveSeeds({ systemName = null, state = null } = {}) {
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

  const result = await query(
    `select
       su.id,
       su.url,
       su.seed_type,
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

export async function insertSourceDocument(
  {
    hospitalSystemId,
    facilityId = null,
    sourceUrl,
    sourceType,
    title,
    fetchedAt,
    httpStatus,
    contentHash,
    storagePath,
    extractedText,
    parserVersion
  },
  client = null
) {
  const q = client || { query };

  const result = await q.query(
    `insert into source_documents (
       hospital_system_id,
       facility_id,
       source_url,
       source_type,
       title,
       fetched_at,
       http_status,
       content_hash,
       storage_path,
       extracted_text,
       parser_version
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (hospital_system_id, source_url, content_hash)
     do update set hospital_system_id = case
                     when excluded.facility_id is not null then excluded.hospital_system_id
                     else source_documents.hospital_system_id
                   end,
                   facility_id = coalesce(excluded.facility_id, source_documents.facility_id),
                   fetched_at = excluded.fetched_at,
                   http_status = excluded.http_status,
                   title = excluded.title,
                   storage_path = excluded.storage_path,
                   extracted_text = excluded.extracted_text,
                   parser_version = excluded.parser_version
     returning id`,
    [
      hospitalSystemId,
      facilityId,
      sourceUrl,
      sourceType,
      title,
      fetchedAt,
      httpStatus,
      contentHash,
      storagePath,
      extractedText,
      parserVersion
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
  const specialWorkflows = workflows.filter((workflow) => workflow.workflow_type !== 'medical_records');

  let contacts = [];
  let forms = [];
  let instructions = [];
  if (medicalWorkflow) {
    const [contactsRes, formsRes, instructionsRes] = await Promise.all([
      query(
        `select contact_type as type, label, value
         from workflow_contacts
         where records_workflow_id = $1
         order by created_at asc`,
        [medicalWorkflow.id]
      ),
      query(
        `select form_name as name, form_url as url, form_format as format
         from workflow_forms
         where records_workflow_id = $1
         order by created_at asc`,
        [medicalWorkflow.id]
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
        [medicalWorkflow.id]
      )
    ]);

    contacts = contactsRes.rows;
    forms = formsRes.rows;
    instructions = instructionsRes.rows;
  }

  const portal = portalRes.rows[0] || {
    portal_name: null,
    portal_url: null,
    portal_scope: 'none',
    supports_formal_copy_request_in_portal: false
  };

  const formalMethods = [];
  if (medicalWorkflow?.online_request_available) formalMethods.push('online_request');
  if (medicalWorkflow?.portal_request_available) formalMethods.push('portal');
  if (medicalWorkflow?.email_available) formalMethods.push('email');
  if (medicalWorkflow?.fax_available) formalMethods.push('fax');
  if (medicalWorkflow?.mail_available) formalMethods.push('mail');
  if (medicalWorkflow?.phone_available) formalMethods.push('phone');
  if (medicalWorkflow?.in_person_available) formalMethods.push('in_person');

  const sources = workflows.map((workflow) => ({
    url: workflow.official_page_url,
    last_verified_at: workflow.last_verified_at
  }));

  return {
    facility: {
      id: facility.id,
      name: facility.facility_name,
      city: facility.city,
      state: facility.state,
      hospital_system: facility.hospital_system
    },
    portal: {
      name: portal.portal_name,
      url: portal.portal_url,
      scope: portal.portal_scope,
      supports_formal_copy_request_in_portal:
        portal.supports_formal_copy_request_in_portal ?? false
    },
    recommended_paths: [
      {
        type: 'portal',
        label: 'View available records now',
        available: portal.portal_scope !== 'none'
      },
      {
        type: 'formal_request',
        label: 'Request complete or official copy',
        available: Boolean(medicalWorkflow?.formal_request_required),
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
    sources
  };
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
