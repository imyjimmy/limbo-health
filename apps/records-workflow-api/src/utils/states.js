export const US_STATE_NAMES = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia'
};

export function normalizeStateCode(value) {
  if (value == null) return null;

  const normalized = String(value).trim().toUpperCase();
  return normalized || null;
}

export function isUsStateCode(value) {
  const normalized = normalizeStateCode(value);
  return Boolean(normalized && US_STATE_NAMES[normalized]);
}

export function getStateName(value) {
  const normalized = normalizeStateCode(value);
  return normalized ? US_STATE_NAMES[normalized] || null : null;
}

export function listUsStateCodes() {
  return Object.keys(US_STATE_NAMES);
}

export function listRolloutStateCodes() {
  return listUsStateCodes().filter((stateCode) => stateCode !== 'DC');
}

export function isRolloutStateCode(value) {
  const normalized = normalizeStateCode(value);
  return Boolean(normalized && listRolloutStateCodes().includes(normalized));
}
