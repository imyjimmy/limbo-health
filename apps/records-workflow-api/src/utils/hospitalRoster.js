import { getStateName, isUsStateCode, listUsStateCodes, normalizeStateCode } from './states.js';

export const CMS_POS_HOSPITAL_ROSTER_URL =
  'https://data.cms.gov/sites/default/files/2026-01/c500f848-83b3-4f29-a677-562243a2f23b/Hospital_and_other.DATA.Q4_2025.csv';

export const CMS_POS_LAYOUT_URL =
  'https://data.cms.gov/sites/default/files/2022-10/58ee74d6-9221-48cf-b039-5b7a773bf39a/Layout%20Sep%2022%20Other.pdf';

export const CMS_HOSPITAL_SUBTYPE_LABELS = {
  '01': 'Short Term',
  '02': 'Long Term',
  '03': 'Religious Non-Medical Health Care Institutions',
  '04': 'Psychiatric',
  '05': 'Rehabilitation',
  '06': 'Childrens Hospitals',
  '07': 'Distinct Part Psychiatric Hospital',
  '11': 'Critical Access Hospitals',
  '20': 'Transplant Hospitals',
  '22': 'Medicaid Only Short-Term Hospitals',
  '23': 'Medicaid Only Childrens Hospitals',
  '24': "Medicaid Only Children's Psychiatric",
  '25': 'Medicaid Only Psychiatric Hospitals',
  '26': 'Medicaid Only Rehabilitation Hospitals',
  '27': 'Medicaid Only Long-Term Hospitals'
};

export const CMS_PROVIDER_TERMINATION_LABELS = {
  '00': 'Active provider',
  '01': 'Voluntary merger or closure',
  '02': 'Voluntary dissatisfaction with reimbursement',
  '03': 'Voluntary risk of involuntary termination',
  '04': 'Voluntary other reason for withdrawal',
  '05': 'Involuntary failure to meet health and safety requirements',
  '06': 'Involuntary failure to meet agreement',
  '07': 'Other provider status change',
  '08': 'Nonpayment of fees - CLIA only',
  '09': 'Revoked or unsuccessful participation in PT - CLIA only',
  '10': 'Revoked for other reason - CLIA only',
  '11': 'Incomplete CLIA application information - CLIA only',
  '12': 'No longer performing tests - CLIA only',
  '13': 'Multiple to single site certificate - CLIA only',
  '14': 'Shared laboratory - CLIA only',
  '15': 'Failure to renew waiver PPM certificate - CLIA only',
  '16': 'Duplicate CLIA number - CLIA only',
  '17': 'Mail returned no forward address cert ended - CLIA only',
  '20': 'Notification bankruptcy - CLIA only',
  '33': 'Accreditation not confirmed - CLIA only',
  '80': 'Awaiting state approval',
  '99': 'OIG action - do not activate - CLIA only'
};

const TOKEN_EXPANSIONS = {
  st: 'saint',
  mt: 'mount',
  ctr: 'center',
  ctrs: 'centers',
  hosp: 'hospital',
  med: 'medical',
  univ: 'university',
  hlth: 'health'
};

const LOOSE_STOPWORDS = new Set([
  'and',
  'at',
  'center',
  'centers',
  'clinic',
  'clinics',
  'for',
  'health',
  'healthcare',
  'hospital',
  'hospitals',
  'medical',
  'network',
  'of',
  'regional',
  'system',
  'systems',
  'the',
  'university'
]);

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandToken(token) {
  return TOKEN_EXPANSIONS[token] || token;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

export function* iterateCsvRecords(csvText) {
  const lines = String(csvText || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/);

  if (lines.length === 0) {
    return;
  }

  const header = parseCsvLine(lines[0]);

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || !line.trim()) {
      continue;
    }

    const row = parseCsvLine(line);
    const record = {};
    for (let columnIndex = 0; columnIndex < header.length; columnIndex += 1) {
      record[header[columnIndex]] = row[columnIndex] ?? '';
    }
    yield record;
  }
}

export async function fetchCmsPosHospitalCsv(url = CMS_POS_HOSPITAL_ROSTER_URL) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download CMS hospital roster CSV: ${response.status}`);
  }

  return response.text();
}

export function normalizeHospitalName(value) {
  const stripped = normalizeWhitespace(value)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase();

  const tokens = stripped
    .split(/\s+/)
    .filter(Boolean)
    .map(expandToken)
    .filter((token, index) => !(token === 'the' && index === 0));

  return tokens.join(' ');
}

export function buildLooseHospitalTokens(value) {
  return normalizeHospitalName(value)
    .split(' ')
    .filter(Boolean)
    .filter((token) => !LOOSE_STOPWORDS.has(token));
}

export function scoreHospitalNameSimilarity(left, right) {
  const normalizedLeft = normalizeHospitalName(left);
  const normalizedRight = normalizeHospitalName(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const leftTokens = new Set(buildLooseHospitalTokens(left));
  const rightTokens = new Set(buildLooseHospitalTokens(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = union === 0 ? 0 : intersection / union;
  const containment = intersection / Math.min(leftTokens.size, rightTokens.size);
  const substringBoost =
    normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft) ? 0.05 : 0;

  return Math.min(1, jaccard * 0.65 + containment * 0.35 + substringBoost);
}

export function isCmsHospitalCategoryRow(record) {
  return record?.PRVDR_CTGRY_CD === '01';
}

export function isCmsActiveNonSkeletonHospitalRow(record) {
  return (
    isCmsHospitalCategoryRow(record) &&
    record?.SKLTN_REC_SW !== 'Y' &&
    record?.PGM_TRMNTN_CD === '00' &&
    isUsStateCode(record?.STATE_CD)
  );
}

function buildRosterEntry(record) {
  const state = normalizeStateCode(record.STATE_CD);
  const facilityName = normalizeWhitespace(record.FAC_NAME);
  const city = normalizeWhitespace(record.CITY_NAME);

  return {
    provider_number: normalizeWhitespace(record.PRVDR_NUM),
    facility_name: facilityName,
    normalized_facility_name: normalizeHospitalName(facilityName),
    city: city || null,
    normalized_city: city ? normalizeHospitalName(city) : '',
    state,
    state_name: getStateName(state),
    address: normalizeWhitespace(record.ST_ADR) || null,
    zip_code: normalizeWhitespace(record.ZIP_CD) || null,
    phone_number: normalizeWhitespace(record.PHNE_NUM) || null,
    provider_category_code: record.PRVDR_CTGRY_CD,
    provider_category_subtype_code: record.PRVDR_CTGRY_SBTYP_CD || null,
    provider_category_subtype_label:
      CMS_HOSPITAL_SUBTYPE_LABELS[record.PRVDR_CTGRY_SBTYP_CD] || null,
    skeleton_record: record.SKLTN_REC_SW === 'Y',
    termination_code: record.PGM_TRMNTN_CD,
    termination_label: CMS_PROVIDER_TERMINATION_LABELS[record.PGM_TRMNTN_CD] || null
  };
}

function buildStateSummary(state, hospitals) {
  const identityKeys = new Set();
  for (const hospital of hospitals) {
    identityKeys.add(`${hospital.normalized_facility_name}::${hospital.normalized_city}`);
  }

  return {
    state,
    state_name: getStateName(state),
    provider_rows: hospitals.length,
    unique_hospital_identities: identityKeys.size
  };
}

export function buildNationalHospitalRoster({ csvText, sourceUrl = CMS_POS_HOSPITAL_ROSTER_URL } = {}) {
  const hospitalsByState = Object.fromEntries(listUsStateCodes().map((state) => [state, []]));
  let totalHospitalCategoryRows = 0;
  let totalActiveNonSkeletonHospitals = 0;

  for (const record of iterateCsvRecords(csvText)) {
    if (!isCmsHospitalCategoryRow(record)) {
      continue;
    }

    totalHospitalCategoryRows += 1;

    if (!isCmsActiveNonSkeletonHospitalRow(record)) {
      continue;
    }

    const entry = buildRosterEntry(record);
    hospitalsByState[entry.state].push(entry);
    totalActiveNonSkeletonHospitals += 1;
  }

  const stateSummaries = [];
  for (const state of listUsStateCodes()) {
    hospitalsByState[state].sort((left, right) => {
      return (
        left.facility_name.localeCompare(right.facility_name) ||
        (left.city || '').localeCompare(right.city || '') ||
        left.provider_number.localeCompare(right.provider_number)
      );
    });
    stateSummaries.push(buildStateSummary(state, hospitalsByState[state]));
  }

  return {
    generated_at: new Date().toISOString(),
    source: {
      provider_file_url: sourceUrl,
      layout_reference_url: CMS_POS_LAYOUT_URL
    },
    filters: {
      provider_category_code: '01',
      provider_category_label: 'Hospital',
      skeleton_record_excluded: true,
      termination_code_required: '00',
      termination_code_label: CMS_PROVIDER_TERMINATION_LABELS['00'],
      included_state_scope: '50 states plus District of Columbia'
    },
    notes: [
      'Provider category code 01 is Hospital per the CMS POS layout PDF.',
      'Skeleton records are excluded because the CMS POS layout describes them as limited records with no survey data.',
      'Termination code 00 is Active provider per the CMS POS layout PDF.'
    ],
    totals: {
      hospital_category_rows: totalHospitalCategoryRows,
      active_non_skeleton_hospital_rows: totalActiveNonSkeletonHospitals,
      states_included: listUsStateCodes().length
    },
    state_summaries: stateSummaries,
    hospitals_by_state: hospitalsByState
  };
}

export function buildOfficialHospitalIdentities(hospitals) {
  const grouped = new Map();

  for (const hospital of hospitals || []) {
    const key = `${hospital.normalized_facility_name}::${hospital.normalized_city}`;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        identity_key: key,
        facility_name: hospital.facility_name,
        normalized_facility_name: hospital.normalized_facility_name,
        city: hospital.city,
        normalized_city: hospital.normalized_city,
        state: hospital.state,
        provider_numbers: [hospital.provider_number],
        provider_row_count: 1,
        subtype_labels: hospital.provider_category_subtype_label ? [hospital.provider_category_subtype_label] : []
      });
      continue;
    }

    existing.provider_numbers.push(hospital.provider_number);
    existing.provider_row_count += 1;
    if (
      hospital.provider_category_subtype_label &&
      !existing.subtype_labels.includes(hospital.provider_category_subtype_label)
    ) {
      existing.subtype_labels.push(hospital.provider_category_subtype_label);
    }
  }

  return Array.from(grouped.values()).sort((left, right) => {
    return left.facility_name.localeCompare(right.facility_name) || (left.city || '').localeCompare(right.city || '');
  });
}

export function findBestHospitalNameMatch(officialHospital, candidates) {
  let best = null;

  for (const candidate of candidates || []) {
    let score = scoreHospitalNameSimilarity(officialHospital.facility_name, candidate.name);

    if (
      officialHospital.normalized_city &&
      candidate.normalizedCity &&
      officialHospital.normalized_city === candidate.normalizedCity
    ) {
      score = Math.min(1, score + 0.05);
    }

    if (!best || score > best.score) {
      best = {
        score,
        candidate
      };
    }
  }

  return best;
}
