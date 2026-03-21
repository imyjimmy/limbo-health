import { query } from '../db.js';
import {
  getStateName,
  isUsStateCode,
  listRolloutStateCodes,
  normalizeStateCode,
} from '../utils/states.js';
import { readStateSeedFile } from './seedEditorService.js';

const NATIONAL_OVERVIEW_CACHE_TTL_MS = 60_000;
const NATIONAL_OVERVIEW_BATCH_SIZE = 6;

let nationalOverviewCache = null;
let nationalOverviewCacheAt = 0;
let nationalOverviewPendingPromise = null;

function toInt(value) {
  return Number.parseInt(String(value ?? 0), 10) || 0;
}

function assertState(state) {
  const normalizedState = normalizeStateCode(state);
  if (!isUsStateCode(normalizedState)) {
    throw new Error(`A valid US state code is required: ${state}`);
  }
  return normalizedState;
}

function maxIsoDate(left, right) {
  if (!left) return right || null;
  if (!right) return left || null;
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

function indexBySystemName(rows = []) {
  return new Map(rows.map((row) => [row.system_name, row]));
}

function groupSeedRows(rows = []) {
  const grouped = new Map();

  for (const row of rows) {
    if (!grouped.has(row.system_name)) {
      grouped.set(row.system_name, []);
    }
    grouped.get(row.system_name).push(row);
  }

  return grouped;
}

function toContentUrl(sourceDocumentId) {
  return `/api/records-workflow/source-documents/${sourceDocumentId}/content`;
}

function groupPdfLinksBySystemId(rows = []) {
  const grouped = new Map();

  for (const row of rows) {
    if (!grouped.has(row.hospital_system_id)) {
      grouped.set(row.hospital_system_id, []);
    }

    grouped.get(row.hospital_system_id).push({
      id: row.id,
      source_url: row.source_url || null,
      source_page_url: row.source_page_url || null,
      title: row.title || null,
      storage_path: row.storage_path || null,
      content_url: toContentUrl(row.id),
    });
  }

  return grouped;
}

function createEmptySummaryCounts() {
  return {
    seeded_systems: 0,
    seeded_facilities: 0,
    active_seed_urls: 0,
    db_systems: 0,
    db_facilities: 0,
    source_documents: 0,
    pdf_source_documents: 0,
    workflows: 0,
    approved_templates: 0,
    stale_templates: 0,
    zero_pdf_systems: 0,
    failures: 0,
    last_crawl_at: null,
  };
}

function summarizeStateSystems(stateSystems) {
  return stateSystems.systems.reduce((totals, system) => {
    totals.seeded_systems += system.in_seed_file ? 1 : 0;
    totals.seeded_facilities += system.stats.seed_facilities;
    totals.active_seed_urls += system.stats.seed_urls;
    totals.db_systems += system.hospital_system_id ? 1 : 0;
    totals.db_facilities += system.stats.db_facilities;
    totals.source_documents += system.stats.source_documents;
    totals.pdf_source_documents += system.stats.pdf_source_documents;
    totals.workflows += system.stats.workflows;
    totals.approved_templates += system.stats.approved_templates;
    totals.stale_templates += system.stats.stale_templates;
    totals.zero_pdf_systems += system.zero_pdf ? 1 : 0;
    totals.failures +=
      system.stats.parse_failures +
      system.stats.partial_workflows +
      system.stats.low_confidence_question_drafts;
    totals.last_crawl_at = maxIsoDate(totals.last_crawl_at, system.stats.last_crawl_at);
    return totals;
  }, createEmptySummaryCounts());
}

function classifyStateHealth(counts) {
  if (counts.seeded_systems === 0 && counts.db_systems === 0) {
    return {
      key: 'empty',
      label: 'No Coverage',
      tone: 'empty',
      reason: 'No seeded systems or DB coverage yet.',
    };
  }

  if (counts.source_documents === 0) {
    return {
      key: 'seeded',
      label: 'Seeded Only',
      tone: 'seeded',
      reason: 'Seed data exists, but no source documents have been captured yet.',
    };
  }

  if (counts.zero_pdf_systems > 0 || counts.failures > 0 || counts.stale_templates > 0) {
    return {
      key: 'attention',
      label: 'Needs Attention',
      tone: 'attention',
      reason: 'Open review signals exist, including failures, stale templates, or zero-PDF systems.',
    };
  }

  if (counts.approved_templates > 0) {
    return {
      key: 'healthy',
      label: 'Healthy',
      tone: 'healthy',
      reason: 'Approved templates are published and there are no tracked review blockers.',
    };
  }

  return {
    key: 'active',
    label: 'In Progress',
    tone: 'active',
    reason: 'Documents are loaded, but approved templates are still catching up.',
  };
}

function buildNationalStateOverviewEntry(stateSystems) {
  const counts = summarizeStateSystems(stateSystems);

  return {
    state: stateSystems.state,
    state_name: getStateName(stateSystems.state),
    seed_file_path: stateSystems.seed_file_path,
    counts,
    health: classifyStateHealth(counts),
  };
}

function buildNationalOverviewTotals(states = []) {
  const by_health = {
    healthy: 0,
    attention: 0,
    active: 0,
    seeded: 0,
    empty: 0,
    error: 0,
  };

  const totals = states.reduce(
    (summary, entry) => {
      summary.seeded_states += entry.counts.seeded_systems > 0 ? 1 : 0;
      summary.active_states += entry.counts.source_documents > 0 ? 1 : 0;
      summary.total_failures += entry.counts.failures;
      summary.total_zero_pdf_systems += entry.counts.zero_pdf_systems;
      summary.total_approved_templates += entry.counts.approved_templates;
      summary.last_crawl_at = maxIsoDate(summary.last_crawl_at, entry.counts.last_crawl_at);
      summary.by_health[entry.health.key] = (summary.by_health[entry.health.key] || 0) + 1;
      return summary;
    },
    {
      rollout_states: states.length,
      seeded_states: 0,
      active_states: 0,
      total_failures: 0,
      total_zero_pdf_systems: 0,
      total_approved_templates: 0,
      last_crawl_at: null,
      by_health,
    },
  );

  totals.healthy_states = totals.by_health.healthy || 0;
  totals.attention_states = totals.by_health.attention || 0;
  totals.seeded_only_states = totals.by_health.seeded || 0;
  totals.unstarted_states = totals.by_health.empty || 0;
  totals.failed_states = totals.by_health.error || 0;

  return totals;
}

async function computeNationalStateOverview() {
  const targetStates = listRolloutStateCodes();
  const entries = [];

  for (let index = 0; index < targetStates.length; index += NATIONAL_OVERVIEW_BATCH_SIZE) {
    const batch = targetStates.slice(index, index + NATIONAL_OVERVIEW_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((state) => listStateSystems(state)));

    for (const [offset, result] of results.entries()) {
      const state = batch[offset];
      if (result.status === 'fulfilled') {
        entries.push(buildNationalStateOverviewEntry(result.value));
        continue;
      }

      const errorMessage =
        result.reason instanceof Error && result.reason.message
          ? result.reason.message
          : 'Failed to load this state.';

      entries.push({
        state,
        state_name: getStateName(state),
        seed_file_path: null,
        counts: createEmptySummaryCounts(),
        health: {
          key: 'error',
          label: 'Load Failed',
          tone: 'error',
          reason: errorMessage,
        },
        error: errorMessage,
      });
    }
  }

  const states = entries.sort((left, right) => left.state.localeCompare(right.state));

  return {
    generated_at: new Date().toISOString(),
    states,
    totals: buildNationalOverviewTotals(states),
  };
}

async function loadStateSystemStats(state) {
  const [systemStats, templateStats, dbSeedUrls, qualityStats, pdfLinks] = await Promise.all([
    query(
      `select
         hs.id,
         hs.system_name,
         hs.canonical_domain,
         hs.state,
         count(distinct f.id)::int as db_facilities,
         count(distinct sd.id)::int as source_documents,
         count(distinct case when sd.source_type = 'html' then sd.id end)::int as html_source_documents,
         count(distinct case when sd.source_type = 'pdf' then sd.id end)::int as pdf_source_documents,
         count(distinct rw.id)::int as workflows,
         max(sd.fetched_at) as last_crawl_at
       from hospital_systems hs
       left join facilities f
         on f.hospital_system_id = hs.id
        and f.active = true
       left join source_documents sd
         on sd.hospital_system_id = hs.id
       left join records_workflows rw
         on rw.hospital_system_id = hs.id
       where hs.state = $1
         and hs.active = true
       group by hs.id, hs.system_name, hs.canonical_domain, hs.state
       order by hs.system_name`,
      [state],
    ),
    query(
      `select
         hs.system_name,
         count(*) filter (where pqt.status = 'draft')::int as draft_templates,
         count(*) filter (where pqt.status = 'approved')::int as approved_templates,
         count(*) filter (where pqt.status = 'stale')::int as stale_templates,
         count(*) filter (where pqt.status = 'unsupported')::int as unsupported_templates
       from hospital_systems hs
       join source_documents sd
         on sd.hospital_system_id = hs.id
        and sd.source_type = 'pdf'
       left join pdf_question_templates pqt
         on pqt.source_document_id = sd.id
       where hs.state = $1
         and hs.active = true
       group by hs.system_name`,
      [state],
    ),
    query(
      `select
         hs.system_name,
         su.id,
         su.url,
         su.seed_type,
         su.approved_by_human,
         su.evidence_note,
         su.facility_id,
         f.facility_name
       from seed_urls su
       join hospital_systems hs
         on hs.id = su.hospital_system_id
       left join facilities f
         on f.id = su.facility_id
       where hs.state = $1
         and hs.active = true
         and su.active = true
       order by hs.system_name, su.created_at`,
      [state],
    ),
    query(
      `with latest_workflow_runs as (
         select distinct on (er.source_document_id)
           er.source_document_id,
           er.status,
           er.structured_output
         from extraction_runs er
         join source_documents sd on sd.id = er.source_document_id
         join hospital_systems hs on hs.id = sd.hospital_system_id
         where hs.state = $1
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
         join hospital_systems hs on hs.id = sd.hospital_system_id
         where hs.state = $1
           and er.extractor_name = 'pdf_form_understanding_openai'
         order by er.source_document_id, er.created_at desc
       )
       select
         hs.system_name,
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
           where sd.source_type = 'pdf'
             and coalesce(sd.storage_path, '') ~ '(^|/)[0-9a-f]{64}\\.pdf$'
         )::int as suspicious_filenames,
         count(*) filter (
           where sd.import_mode in ('manual_html', 'manual_pdf')
         )::int as manual_imports
       from hospital_systems hs
       left join source_documents sd
         on sd.hospital_system_id = hs.id
       left join latest_workflow_runs
         on latest_workflow_runs.source_document_id = sd.id
       left join latest_form_runs
         on latest_form_runs.source_document_id = sd.id
       where hs.state = $1
         and hs.active = true
       group by hs.system_name`,
      [state],
    ),
    query(
      `with ranked_pdfs as (
         select
           hs.id as hospital_system_id,
           sd.id,
           sd.source_url,
           workflow_source.official_page_url as source_page_url,
           sd.title,
           sd.storage_path,
           row_number() over (
             partition by hs.id
             order by sd.fetched_at desc nulls last, sd.created_at desc
           ) as pdf_rank
         from hospital_systems hs
         join source_documents sd
           on sd.hospital_system_id = hs.id
          and sd.source_type = 'pdf'
         left join lateral (
           select rw.official_page_url
           from workflow_forms wf
           join records_workflows rw
             on rw.id = wf.records_workflow_id
           where rw.hospital_system_id = hs.id
             and wf.form_url = sd.source_url
           order by rw.updated_at desc nulls last, rw.created_at desc
           limit 1
         ) workflow_source on true
         where hs.state = $1
           and hs.active = true
       )
       select
         hospital_system_id,
         id,
         source_url,
         source_page_url,
         title,
         storage_path
       from ranked_pdfs
       where pdf_rank <= 3
       order by hospital_system_id asc, pdf_rank asc`,
      [state],
    ),
  ]);

  return {
    systemStatsByName: indexBySystemName(systemStats.rows),
    templateStatsByName: indexBySystemName(templateStats.rows),
    seedRowsBySystem: groupSeedRows(dbSeedUrls.rows),
    qualityStatsByName: indexBySystemName(qualityStats.rows),
    pdfLinksBySystemId: groupPdfLinksBySystemId(pdfLinks.rows),
  };
}

export async function listStateSystems(state) {
  const normalizedState = assertState(state);
  const seedSnapshot = await readStateSeedFile(normalizedState);
  const { systemStatsByName, templateStatsByName, seedRowsBySystem, qualityStatsByName, pdfLinksBySystemId } =
    await loadStateSystemStats(normalizedState);

  const names = new Set([
    ...seedSnapshot.systems.map((system) => system.system_name),
    ...systemStatsByName.keys(),
  ]);

  const systems = Array.from(names)
    .sort((left, right) => left.localeCompare(right))
    .map((systemName) => {
      const seedSystem =
        seedSnapshot.systems.find((system) => system.system_name === systemName) || null;
      const dbSystem = systemStatsByName.get(systemName) || null;
      const templateStats = templateStatsByName.get(systemName) || {};
      const qualityStats = qualityStatsByName.get(systemName) || {};
      return {
        hospital_system_id: dbSystem?.id || null,
        system_name: systemName,
        state: normalizedState,
        domain: seedSystem?.domain || dbSystem?.canonical_domain || null,
        pdf_links: dbSystem?.id ? pdfLinksBySystemId.get(dbSystem.id) || [] : [],
        in_seed_file: Boolean(seedSystem),
        seed_file: {
          facilities: seedSystem?.facilities || [],
          seed_urls: seedSystem?.seed_urls || [],
        },
        db_seed_urls: seedRowsBySystem.get(systemName) || [],
        stats: {
          seed_facilities: seedSystem?.facilities?.length || 0,
          seed_urls: seedSystem?.seed_urls?.length || 0,
          db_facilities: toInt(dbSystem?.db_facilities),
          source_documents: toInt(dbSystem?.source_documents),
          html_source_documents: toInt(dbSystem?.html_source_documents),
          pdf_source_documents: toInt(dbSystem?.pdf_source_documents),
          workflows: toInt(dbSystem?.workflows),
          draft_templates: toInt(templateStats?.draft_templates),
          approved_templates: toInt(templateStats?.approved_templates),
          stale_templates: toInt(templateStats?.stale_templates),
          unsupported_templates: toInt(templateStats?.unsupported_templates),
          parse_failures: toInt(qualityStats?.parse_failures),
          partial_workflows: toInt(qualityStats?.partial_workflows),
          low_confidence_question_drafts: toInt(qualityStats?.low_confidence_question_drafts),
          suspicious_filenames: toInt(qualityStats?.suspicious_filenames),
          manual_imports: toInt(qualityStats?.manual_imports),
          last_crawl_at: dbSystem?.last_crawl_at || null,
        },
        zero_pdf: toInt(dbSystem?.pdf_source_documents) === 0,
      };
    });

  return {
    state: normalizedState,
    seed_file_path: seedSnapshot.seed_file_path,
    systems,
  };
}

export async function getStateSummary(state) {
  const normalizedState = assertState(state);
  const stateSystems = await listStateSystems(normalizedState);
  const counts = summarizeStateSystems(stateSystems);

  return {
    state: normalizedState,
    seed_file_path: stateSystems.seed_file_path,
    counts,
    systems: stateSystems.systems,
  };
}

export async function getNationalStateOverview({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (
    !forceRefresh &&
    nationalOverviewCache &&
    now - nationalOverviewCacheAt < NATIONAL_OVERVIEW_CACHE_TTL_MS
  ) {
    return nationalOverviewCache;
  }

  if (!forceRefresh && nationalOverviewPendingPromise) {
    return nationalOverviewPendingPromise;
  }

  const pendingPromise = computeNationalStateOverview();
  nationalOverviewPendingPromise = pendingPromise;

  try {
    const overview = await pendingPromise;
    nationalOverviewCache = overview;
    nationalOverviewCacheAt = Date.now();
    return overview;
  } finally {
    if (nationalOverviewPendingPromise === pendingPromise) {
      nationalOverviewPendingPromise = null;
    }
  }
}
