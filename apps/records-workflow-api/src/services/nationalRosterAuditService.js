import fs from 'node:fs/promises';
import path from 'node:path';
import { query } from '../db.js';
import { config, resolveFromServiceRoot } from '../config.js';
import { parsePdfDocument } from '../parsers/pdfParser.js';
import { resolveSeedFilePath } from './seedService.js';
import {
  buildNationalHospitalRoster,
  buildOfficialHospitalIdentities,
  CMS_POS_HOSPITAL_ROSTER_URL,
  fetchCmsPosHospitalCsv,
  findBestHospitalNameMatch,
  normalizeHospitalName
} from '../utils/hospitalRoster.js';
import { inferFacilityNameFromHeaderLines } from '../utils/pdfHeader.js';
import { getStateName, normalizeStateCode } from '../utils/states.js';

export const DEFAULT_ROSTER_FILE = 'data/national-roster/cms-pos-q4-2025-active-hospitals.json';

export function buildDefaultAuditOutputPath() {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `logs/reports/${dateStamp}-national-roster-audit.json`;
}

function roundTo(value, digits = 3) {
  return Number(Number(value || 0).toFixed(digits));
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadOrBuildRoster(rosterFilePath = DEFAULT_ROSTER_FILE) {
  const resolvedRosterFilePath = resolveFromServiceRoot(rosterFilePath, rosterFilePath);
  if (await pathExists(resolvedRosterFilePath)) {
    const raw = await fs.readFile(resolvedRosterFilePath, 'utf8');
    return {
      roster: JSON.parse(raw),
      resolvedRosterFilePath,
      builtNow: false
    };
  }

  const csvText = await fetchCmsPosHospitalCsv(CMS_POS_HOSPITAL_ROSTER_URL);
  const roster = buildNationalHospitalRoster({ csvText });
  await fs.mkdir(path.dirname(resolvedRosterFilePath), { recursive: true });
  await fs.writeFile(resolvedRosterFilePath, `${JSON.stringify(roster, null, 2)}\n`, 'utf8');

  return {
    roster,
    resolvedRosterFilePath,
    builtNow: true
  };
}

export async function discoverProcessedRawStates() {
  const entries = await fs.readdir(config.rawStorageDir, { withFileTypes: true });
  const states = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const state = normalizeStateCode(entry.name);
    if (!state) {
      continue;
    }

    const directoryPath = path.join(config.rawStorageDir, entry.name);
    const files = await fs.readdir(directoryPath);
    const pdfCount = files.filter((fileName) => fileName.toLowerCase().endsWith('.pdf')).length;
    if (pdfCount > 0) {
      states.push({
        state,
        raw_pdf_file_count: pdfCount,
        directory_path: directoryPath
      });
    }
  }

  return states.sort((left, right) => left.state.localeCompare(right.state));
}

export async function listDbStatesWithSourceDocuments() {
  const result = await query(
    `select hs.state, count(sd.id)::int as source_document_count
     from hospital_systems hs
     join source_documents sd on sd.hospital_system_id = hs.id
     where hs.active = true
     group by hs.state
     order by hs.state`
  );

  return result.rows.map((row) => ({
    state: row.state,
    source_document_count: row.source_document_count
  }));
}

async function readSeedSnapshot(state) {
  try {
    const seedFilePath = resolveSeedFilePath({ state });
    const raw = await fs.readFile(seedFilePath, 'utf8');
    const systems = JSON.parse(raw);

    const facilityNames = [];
    const systemNames = [];
    let seedUrlCount = 0;

    for (const system of systems) {
      systemNames.push(system.system_name);
      seedUrlCount += Array.isArray(system.seed_urls) ? system.seed_urls.length : 0;

      for (const facility of system.facilities || []) {
        facilityNames.push(facility.facility_name);
      }
    }

    return {
      seed_file_path: seedFilePath,
      system_count: systemNames.length,
      facility_count: facilityNames.length,
      seed_url_count: seedUrlCount,
      system_names: systemNames,
      facility_names: facilityNames
    };
  } catch (error) {
    return {
      seed_file_path: null,
      system_count: 0,
      facility_count: 0,
      seed_url_count: 0,
      system_names: [],
      facility_names: [],
      error: error.message
    };
  }
}

async function buildRawPdfSnapshot(rawSnapshot) {
  const pdfCandidates = [];
  const errors = [];

  if (!rawSnapshot?.directory_path || rawSnapshot.raw_pdf_file_count === 0) {
    return {
      facility_candidates: pdfCandidates,
      parse_errors: errors
    };
  }

  const files = (await fs.readdir(rawSnapshot.directory_path))
    .filter((fileName) => fileName.toLowerCase().endsWith('.pdf'))
    .sort();

  for (const fileName of files) {
    const absolutePath = path.join(rawSnapshot.directory_path, fileName);

    try {
      const buffer = await fs.readFile(absolutePath);
      const parsed = await parsePdfDocument({ buffer });
      const facilityName = inferFacilityNameFromHeaderLines({
        systemName: '',
        headerLines: parsed.headerLines || []
      });

      if (!facilityName) {
        continue;
      }

      pdfCandidates.push({
        name: facilityName,
        city: null,
        file_name: fileName,
        absolute_path: absolutePath
      });
    } catch (error) {
      errors.push({
        file_name: fileName,
        absolute_path: absolutePath,
        error: error.message
      });
    }
  }

  return {
    facility_candidates: pdfCandidates,
    parse_errors: errors
  };
}

async function getDbStateMetrics(state) {
  const [
    systemCountResult,
    facilityCountResult,
    seedCountResult,
    sourceCountResult,
    pdfCountResult,
    workflowCountResult,
    systemsResult,
    facilitiesResult
  ] = await Promise.all([
    query(
      `select count(*)::int as count
       from hospital_systems
       where state = $1 and active = true`,
      [state]
    ),
    query(
      `select count(*)::int as count
       from facilities f
       join hospital_systems hs on hs.id = f.hospital_system_id
       where hs.state = $1 and hs.active = true and f.active = true`,
      [state]
    ),
    query(
      `select count(*)::int as count
       from seed_urls su
       join hospital_systems hs on hs.id = su.hospital_system_id
       where hs.state = $1 and hs.active = true and su.active = true`,
      [state]
    ),
    query(
      `select count(*)::int as count
       from source_documents sd
       join hospital_systems hs on hs.id = sd.hospital_system_id
       where hs.state = $1 and hs.active = true`,
      [state]
    ),
    query(
      `select count(*)::int as count
       from source_documents sd
       join hospital_systems hs on hs.id = sd.hospital_system_id
       where hs.state = $1 and hs.active = true and sd.source_type = 'pdf'`,
      [state]
    ),
    query(
      `select
         count(*)::int as workflow_count,
         count(*) filter (where confidence = 'low')::int as low_confidence_count,
         count(*) filter (where confidence = 'medium')::int as medium_confidence_count,
         count(*) filter (where confidence = 'high')::int as high_confidence_count
       from records_workflows rw
       join hospital_systems hs on hs.id = rw.hospital_system_id
       where hs.state = $1 and hs.active = true`,
      [state]
    ),
    query(
      `select system_name
       from hospital_systems
       where state = $1 and active = true
       order by system_name`,
      [state]
    ),
    query(
      `select f.facility_name, f.city
       from facilities f
       join hospital_systems hs on hs.id = f.hospital_system_id
       where hs.state = $1 and hs.active = true and f.active = true
       order by f.facility_name, f.city`,
      [state]
    )
  ]);

  return {
    system_count: systemCountResult.rows[0]?.count || 0,
    facility_count: facilityCountResult.rows[0]?.count || 0,
    seed_url_count: seedCountResult.rows[0]?.count || 0,
    source_document_count: sourceCountResult.rows[0]?.count || 0,
    pdf_source_document_count: pdfCountResult.rows[0]?.count || 0,
    workflow_count: workflowCountResult.rows[0]?.workflow_count || 0,
    low_confidence_count: workflowCountResult.rows[0]?.low_confidence_count || 0,
    medium_confidence_count: workflowCountResult.rows[0]?.medium_confidence_count || 0,
    high_confidence_count: workflowCountResult.rows[0]?.high_confidence_count || 0,
    system_names: systemsResult.rows.map((row) => row.system_name),
    facilities: facilitiesResult.rows.map((row) => ({
      name: row.facility_name,
      city: row.city || null
    }))
  };
}

function buildCandidates(seedSnapshot, dbMetrics, rawPdfSnapshot) {
  const seen = new Set();
  const candidates = [];

  const pushCandidate = (name, type, city = null, source = null) => {
    const normalizedName = normalizeHospitalName(name);
    if (!normalizedName) {
      return;
    }

    const normalizedCity = normalizeHospitalName(city || '');
    const key = `${type}::${normalizedName}::${normalizedCity}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    candidates.push({
      name,
      type,
      city,
      normalizedName,
      normalizedCity,
      source
    });
  };

  for (const facility of dbMetrics.facilities) {
    pushCandidate(facility.name, 'facility', facility.city, 'db');
  }

  for (const systemName of dbMetrics.system_names) {
    pushCandidate(systemName, 'system', null, 'db');
  }

  for (const facilityName of seedSnapshot.facility_names) {
    pushCandidate(facilityName, 'facility', null, 'seed');
  }

  for (const systemName of seedSnapshot.system_names) {
    pushCandidate(systemName, 'system', null, 'seed');
  }

  for (const rawPdfCandidate of rawPdfSnapshot.facility_candidates) {
    pushCandidate(rawPdfCandidate.name, 'facility', rawPdfCandidate.city, 'raw_pdf');
  }

  return candidates;
}

function chooseExactMatch(candidates, officialHospital) {
  if (!candidates || candidates.length === 0) {
    return null;
  }

  const sameCity = candidates.find((candidate) => candidate.normalizedCity === officialHospital.normalized_city);
  return sameCity || candidates[0];
}

function scoreToBucket(score) {
  if (score >= 0.85) return 'likely';
  if (score >= 0.7) return 'possible';
  return 'missing';
}

function evaluateStateReadiness(summary) {
  const lowConfidenceRate =
    summary.db.workflow_count > 0 ? summary.db.low_confidence_count / summary.db.workflow_count : 0;
  const exactCoverage = summary.coverage.exact_match_rate;
  const weightedCoverage = summary.coverage.weighted_match_rate;

  if (exactCoverage >= 0.75 && weightedCoverage >= 0.85 && lowConfidenceRate <= 0.15) {
    return 'ready';
  }

  if (exactCoverage >= 0.55 && weightedCoverage >= 0.7 && lowConfidenceRate <= 0.2) {
    return 'review';
  }

  return 'not_ready';
}

function classifyCoverageQuality(coverage) {
  if (coverage.exact_match_rate >= 0.75 && coverage.weighted_match_rate >= 0.85) {
    return 'strong';
  }

  if (coverage.exact_match_rate >= 0.55 && coverage.weighted_match_rate >= 0.7) {
    return 'adequate';
  }

  if (coverage.exact_match_rate >= 0.35 && coverage.weighted_match_rate >= 0.55) {
    return 'partial';
  }

  return 'weak';
}

function classifyWorkflowQuality(dbMetrics) {
  const lowConfidenceRate =
    dbMetrics.workflow_count > 0 ? dbMetrics.low_confidence_count / dbMetrics.workflow_count : 0;

  if (dbMetrics.workflow_count === 0) {
    return 'missing';
  }

  if (lowConfidenceRate <= 0.08) {
    return 'strong';
  }

  if (lowConfidenceRate <= 0.15) {
    return 'mixed';
  }

  return 'weak';
}

function buildStateQualityAssessment({
  state,
  coverage,
  dbMetrics,
  rawSnapshot,
  rawPdfSnapshot,
  recommendation
}) {
  const coverageQuality = classifyCoverageQuality(coverage);
  const workflowQuality = classifyWorkflowQuality(dbMetrics);
  const exactCoveragePercent = roundTo(coverage.exact_match_rate * 100, 1);
  const weightedCoveragePercent = roundTo(coverage.weighted_match_rate * 100, 1);
  const lowConfidencePercent =
    dbMetrics.workflow_count > 0 ? roundTo((dbMetrics.low_confidence_count / dbMetrics.workflow_count) * 100, 1) : 0;
  const strengths = [];
  const concerns = [];
  const nextActions = [];

  if (coverage.exact_match_rate >= 0.75) {
    strengths.push(`Exact CMS hospital coverage is ${exactCoveragePercent}% for ${state}.`);
  } else if (coverage.exact_match_rate >= 0.55) {
    strengths.push(`Exact CMS hospital coverage is moderate at ${exactCoveragePercent}% for ${state}.`);
  } else {
    concerns.push(`Exact CMS hospital coverage is only ${exactCoveragePercent}% for ${state}.`);
  }

  if (coverage.weighted_match_rate >= 0.85) {
    strengths.push(`Weighted match coverage is strong at ${weightedCoveragePercent}%.`);
  } else if (coverage.weighted_match_rate >= 0.7) {
    strengths.push(`Weighted match coverage is usable at ${weightedCoveragePercent}%.`);
  } else {
    concerns.push(`Weighted coverage is only ${weightedCoveragePercent}%, which means the roster mapping is still thin.`);
  }

  if (dbMetrics.workflow_count === 0) {
    concerns.push('No workflows were extracted for this state.');
  } else if (lowConfidencePercent <= 8) {
    strengths.push(`Low-confidence workflow rate is low at ${lowConfidencePercent}%.`);
  } else if (lowConfidencePercent <= 15) {
    concerns.push(`Low-confidence workflow rate is moderate at ${lowConfidencePercent}%.`);
  } else {
    concerns.push(`Low-confidence workflow rate is high at ${lowConfidencePercent}%.`);
  }

  if (rawSnapshot.raw_pdf_file_count > 0) {
    strengths.push(`Raw PDF evidence exists for this state (${rawSnapshot.raw_pdf_file_count} files).`);
  } else {
    concerns.push('No raw PDF evidence is present in storage for this state.');
  }

  if (rawPdfSnapshot.parse_errors.length > 0) {
    concerns.push(`${rawPdfSnapshot.parse_errors.length} raw PDF files could not be parsed during audit.`);
  }

  if (coverage.missing_hospitals > 0) {
    nextActions.push(`Backfill the ${coverage.missing_hospitals} unmatched CMS hospital identities.`);
  }

  if (coverage.possible_matches > 0 || coverage.likely_matches > 0) {
    nextActions.push('Review likely/possible roster matches and convert them into exact facility mappings.');
  }

  if (workflowQuality !== 'strong') {
    nextActions.push('Review low-confidence workflows and weak portal/form extractions.');
  }

  if (rawSnapshot.raw_pdf_file_count === 0 && dbMetrics.source_document_count > 0) {
    nextActions.push('Backfill or rehydrate raw PDF storage for this state if PDF evidence is expected.');
  }

  let verdictSummary;
  if (recommendation === 'ready') {
    verdictSummary = `State data quality is strong enough for nationwide strategy alignment. ${state} looks rollout-ready.`;
  } else if (recommendation === 'review') {
    verdictSummary = `State data quality is promising but not complete. ${state} needs targeted review before it should be treated as exhaustive.`;
  } else {
    verdictSummary = `State data quality is not yet good enough for the nationwide completeness strategy. ${state} has major coverage gaps.`;
  }

  return {
    rollout_readiness: recommendation,
    coverage_quality: coverageQuality,
    workflow_quality: workflowQuality,
    exact_coverage_percent: exactCoveragePercent,
    weighted_coverage_percent: weightedCoveragePercent,
    low_confidence_workflow_percent: lowConfidencePercent,
    summary: verdictSummary,
    strengths,
    concerns,
    next_actions: nextActions
  };
}

function buildStateAudit(state, roster, rawSnapshot, seedSnapshot, dbMetrics, rawPdfSnapshot) {
  const rosterHospitals = roster.hospitals_by_state[state] || [];
  const officialHospitals = buildOfficialHospitalIdentities(rosterHospitals);
  const candidates = buildCandidates(seedSnapshot, dbMetrics, rawPdfSnapshot);

  const exactFacilityMap = new Map();
  const exactSystemMap = new Map();

  for (const candidate of candidates) {
    if (candidate.type === 'facility') {
      const list = exactFacilityMap.get(candidate.normalizedName) || [];
      list.push(candidate);
      exactFacilityMap.set(candidate.normalizedName, list);
    } else {
      const list = exactSystemMap.get(candidate.normalizedName) || [];
      list.push(candidate);
      exactSystemMap.set(candidate.normalizedName, list);
    }
  }

  const exactFacilityMatches = [];
  const exactSystemMatches = [];
  const likelyMatches = [];
  const possibleMatches = [];
  const missingHospitals = [];
  let weightedMatchUnits = 0;

  for (const officialHospital of officialHospitals) {
    const exactFacilityCandidates = exactFacilityMap.get(officialHospital.normalized_facility_name) || [];
    const exactFacilityMatch = chooseExactMatch(exactFacilityCandidates, officialHospital);

    if (exactFacilityMatch) {
      exactFacilityMatches.push({
        official_hospital: officialHospital.facility_name,
        official_city: officialHospital.city,
        matched_name: exactFacilityMatch.name,
        matched_city: exactFacilityMatch.city,
        matched_source: exactFacilityMatch.source
      });
      weightedMatchUnits += 1;
      continue;
    }

    const exactSystemCandidates = exactSystemMap.get(officialHospital.normalized_facility_name) || [];
    const exactSystemMatch = chooseExactMatch(exactSystemCandidates, officialHospital);
    if (exactSystemMatch) {
      exactSystemMatches.push({
        official_hospital: officialHospital.facility_name,
        official_city: officialHospital.city,
        matched_system: exactSystemMatch.name,
        matched_source: exactSystemMatch.source
      });
      weightedMatchUnits += 0.5;
      continue;
    }

    const best = findBestHospitalNameMatch(officialHospital, candidates);
    const bucket = scoreToBucket(best?.score || 0);

    if (bucket === 'likely' && best) {
      likelyMatches.push({
        official_hospital: officialHospital.facility_name,
        official_city: officialHospital.city,
        matched_name: best.candidate.name,
        matched_type: best.candidate.type,
        matched_city: best.candidate.city,
        matched_source: best.candidate.source,
        similarity_score: Number(best.score.toFixed(3))
      });
      weightedMatchUnits += best.candidate.type === 'facility' ? 0.75 : 0.4;
      continue;
    }

    if (bucket === 'possible' && best) {
      possibleMatches.push({
        official_hospital: officialHospital.facility_name,
        official_city: officialHospital.city,
        matched_name: best.candidate.name,
        matched_type: best.candidate.type,
        matched_city: best.candidate.city,
        matched_source: best.candidate.source,
        similarity_score: Number(best.score.toFixed(3))
      });
      weightedMatchUnits += 0.25;
      continue;
    }

    missingHospitals.push({
      official_hospital: officialHospital.facility_name,
      official_city: officialHospital.city,
      provider_numbers: officialHospital.provider_numbers
    });
  }

  const officialHospitalCount = officialHospitals.length;
  const exactMatchCount = exactFacilityMatches.length + exactSystemMatches.length;
  const coverage = {
    official_provider_rows: rosterHospitals.length,
    official_unique_hospital_identities: officialHospitalCount,
    exact_facility_matches: exactFacilityMatches.length,
    exact_system_matches: exactSystemMatches.length,
    likely_matches: likelyMatches.length,
    possible_matches: possibleMatches.length,
    missing_hospitals: missingHospitals.length,
    exact_match_rate:
      officialHospitalCount > 0 ? Number((exactMatchCount / officialHospitalCount).toFixed(3)) : 0,
    weighted_match_rate:
      officialHospitalCount > 0 ? Number((weightedMatchUnits / officialHospitalCount).toFixed(3)) : 0
  };

  const audit = {
    state,
    state_name: getStateName(state),
    phase_1_scope_reason:
      rawSnapshot.raw_pdf_file_count > 0
        ? 'state directory exists under the accepted-form corpus and contains PDFs'
        : 'state has crawl data in the database but no accepted-form PDF directory yet',
    raw_storage: rawSnapshot,
    raw_pdf_snapshot: {
      inferred_facility_candidate_count: rawPdfSnapshot.facility_candidates.length,
      parse_error_count: rawPdfSnapshot.parse_errors.length,
      parse_error_sample: rawPdfSnapshot.parse_errors.slice(0, 10)
    },
    seed_snapshot: {
      seed_file_path: seedSnapshot.seed_file_path,
      system_count: seedSnapshot.system_count,
      facility_count: seedSnapshot.facility_count,
      seed_url_count: seedSnapshot.seed_url_count,
      seed_error: seedSnapshot.error || null
    },
    db: {
      system_count: dbMetrics.system_count,
      facility_count: dbMetrics.facility_count,
      seed_url_count: dbMetrics.seed_url_count,
      source_document_count: dbMetrics.source_document_count,
      pdf_source_document_count: dbMetrics.pdf_source_document_count,
      workflow_count: dbMetrics.workflow_count,
      low_confidence_count: dbMetrics.low_confidence_count,
      medium_confidence_count: dbMetrics.medium_confidence_count,
      high_confidence_count: dbMetrics.high_confidence_count,
      low_confidence_rate:
        dbMetrics.workflow_count > 0
          ? Number((dbMetrics.low_confidence_count / dbMetrics.workflow_count).toFixed(3))
          : 0
    },
    coverage,
    recommendation: '',
    quality_against_national_strategy: null,
    missing_official_hospitals_sample: missingHospitals.slice(0, 20),
    possible_matches_sample: possibleMatches.slice(0, 15),
    likely_matches_sample: likelyMatches.slice(0, 15),
    notes: []
  };

  audit.recommendation = evaluateStateReadiness(audit);
  audit.quality_against_national_strategy = buildStateQualityAssessment({
    state,
    coverage,
    dbMetrics,
    rawSnapshot,
    rawPdfSnapshot,
    recommendation: audit.recommendation
  });

  if (coverage.missing_hospitals > 0) {
    audit.notes.push('Official CMS hospitals remain unmatched against current facilities/systems.');
  }

  if (dbMetrics.low_confidence_count > 0) {
    audit.notes.push('Low-confidence workflows are present and should be reviewed alongside coverage gaps.');
  }

  if (dbMetrics.pdf_source_document_count === 0) {
    audit.notes.push('This state has no PDF source_documents in the DB.');
  }

  if (rawPdfSnapshot.facility_candidates.length > 0) {
    audit.notes.push('Raw PDF header inference was included as additional evidence for facility coverage.');
  }

  return audit;
}

export function buildOverallDecision(stateAudits) {
  const readyStates = stateAudits.filter((state) => state.recommendation === 'ready').length;
  const reviewStates = stateAudits.filter((state) => state.recommendation === 'review').length;
  const notReadyStates = stateAudits.filter((state) => state.recommendation === 'not_ready').length;
  const averageWeightedCoverage =
    stateAudits.length > 0
      ? Number(
          (
            stateAudits.reduce((sum, state) => sum + state.coverage.weighted_match_rate, 0) /
            stateAudits.length
          ).toFixed(3)
        )
      : 0;

  const proceedToRemainingStates =
    stateAudits.length > 0 &&
    notReadyStates === 0 &&
    averageWeightedCoverage >= 0.75 &&
    readyStates + reviewStates === stateAudits.length;

  return {
    proceed_to_remaining_states: proceedToRemainingStates,
    ready_states: readyStates,
    review_states: reviewStates,
    not_ready_states: notReadyStates,
    average_weighted_match_rate: averageWeightedCoverage,
    summary:
      readyStates === stateAudits.length && stateAudits.length > 0
        ? 'All audited states currently meet the national completeness strategy.'
        : notReadyStates > 0
          ? 'At least one audited state falls short of the national completeness strategy.'
          : 'Audited states are mixed; some are usable, but the overall footprint still needs review.',
    rationale: proceedToRemainingStates
      ? 'Coverage and confidence look strong enough to expand.'
      : 'Coverage is still incomplete in at least some states; use the report as the remediation backlog.'
  };
}

function buildNationalStrategySummary(stateAudits) {
  const ordered = [...stateAudits].sort((left, right) => {
    return (
      left.coverage.weighted_match_rate - right.coverage.weighted_match_rate ||
      right.coverage.missing_hospitals - left.coverage.missing_hospitals ||
      left.state.localeCompare(right.state)
    );
  });

  return {
    goal: 'Measure whether the existing crawled state data is complete and trustworthy enough relative to the CMS national hospital roster baseline.',
    pass_criteria: {
      state_ready_threshold: {
        exact_match_rate_at_least: 0.75,
        weighted_match_rate_at_least: 0.85,
        low_confidence_rate_at_most: 0.15
      },
      state_review_threshold: {
        exact_match_rate_at_least: 0.55,
        weighted_match_rate_at_least: 0.7,
        low_confidence_rate_at_most: 0.2
      }
    },
    verdict: stateAudits.some((audit) => audit.recommendation === 'not_ready')
      ? 'Current fetched data is not yet strong enough, as a whole, to satisfy the national completeness strategy.'
      : 'Current fetched data is broadly aligned with the national completeness strategy.',
    strongest_states: [...stateAudits]
      .sort((left, right) => {
        return (
          right.coverage.weighted_match_rate - left.coverage.weighted_match_rate ||
          left.db.low_confidence_rate - right.db.low_confidence_rate ||
          left.state.localeCompare(right.state)
        );
      })
      .slice(0, 5)
      .map((audit) => ({
        state: audit.state,
        recommendation: audit.recommendation,
        exact_match_rate: audit.coverage.exact_match_rate,
        weighted_match_rate: audit.coverage.weighted_match_rate,
        low_confidence_rate: audit.db.low_confidence_rate
      })),
    weakest_states: ordered.slice(0, 5).map((audit) => ({
      state: audit.state,
      recommendation: audit.recommendation,
      exact_match_rate: audit.coverage.exact_match_rate,
      weighted_match_rate: audit.coverage.weighted_match_rate,
      missing_hospitals: audit.coverage.missing_hospitals
    })),
    remediation_backlog_order: [...stateAudits]
      .sort((left, right) => {
        return (
          right.coverage.missing_hospitals - left.coverage.missing_hospitals ||
          right.db.low_confidence_rate - left.db.low_confidence_rate ||
          left.state.localeCompare(right.state)
        );
      })
      .map((audit) => ({
        state: audit.state,
        recommendation: audit.recommendation,
        missing_hospitals: audit.coverage.missing_hospitals,
        low_confidence_rate: audit.db.low_confidence_rate
      }))
  };
}

export async function buildNationalRosterCoverageReport({
  rosterFilePath = DEFAULT_ROSTER_FILE,
  states = null,
  includeDbOnlyStates = true
} = {}) {
  const { roster, resolvedRosterFilePath, builtNow } = await loadOrBuildRoster(rosterFilePath);
  const rawStates = await discoverProcessedRawStates();
  const rawStateLookup = new Map(rawStates.map((entry) => [entry.state, entry]));
  const dbStatesWithSourceDocuments = await listDbStatesWithSourceDocuments();

  let auditedStates;
  if (states && states.length > 0) {
    auditedStates = states.map((state) => normalizeStateCode(state)).filter(Boolean);
  } else {
    const combined = new Set(rawStates.map((entry) => entry.state));
    if (includeDbOnlyStates) {
      for (const entry of dbStatesWithSourceDocuments) {
        combined.add(entry.state);
      }
    }
    auditedStates = Array.from(combined).sort();
  }

  const stateAudits = [];

  for (const state of auditedStates) {
    const rawSnapshot = rawStateLookup.get(state) || {
      state,
      raw_pdf_file_count: 0,
      directory_path: path.join(config.rawStorageDir, state.toLowerCase())
    };

    const [seedSnapshot, dbMetrics, rawPdfSnapshot] = await Promise.all([
      readSeedSnapshot(state),
      getDbStateMetrics(state),
      buildRawPdfSnapshot(rawSnapshot)
    ]);

    stateAudits.push(buildStateAudit(state, roster, rawSnapshot, seedSnapshot, dbMetrics, rawPdfSnapshot));
  }

  const rawStateSet = new Set(rawStates.map((entry) => entry.state));
  const supplementalStates = dbStatesWithSourceDocuments.filter((entry) => !rawStateSet.has(entry.state));

  return {
    generated_at: new Date().toISOString(),
    scope: 'National roster coverage audit against currently processed state crawl data',
    national_strategy_summary: buildNationalStrategySummary(stateAudits),
    roster_file_path: resolvedRosterFilePath,
    roster_built_during_run: builtNow,
    source_filters: roster.filters,
    processed_raw_states: rawStates,
    state_audits: stateAudits,
    supplemental_crawl_states_without_raw_pdf_directory: supplementalStates,
    overall_decision: buildOverallDecision(stateAudits)
  };
}

export async function writeNationalRosterCoverageReport({
  rosterFilePath = DEFAULT_ROSTER_FILE,
  outputPath = buildDefaultAuditOutputPath(),
  states = null,
  includeDbOnlyStates = true
} = {}) {
  const report = await buildNationalRosterCoverageReport({
    rosterFilePath,
    states,
    includeDbOnlyStates
  });

  const resolvedOutputPath = resolveFromServiceRoot(outputPath, outputPath);
  await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await fs.writeFile(resolvedOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return {
    report,
    resolvedOutputPath
  };
}
