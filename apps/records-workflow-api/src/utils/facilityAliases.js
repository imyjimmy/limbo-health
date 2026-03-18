const MASS_GENERAL_BRIGHAM_DOCUMENT_FACILITY_CODES = {
  bwfh: "Brigham and Women's Faulkner Hospital",
  bwh: "Brigham and Women's Hospital",
  cdh: 'Cooley Dickinson Hospital',
  mgh: 'Massachusetts General Hospital',
  mee: 'Mass Eye and Ear',
  mgb: 'Mass General Brigham',
  mcl: 'McLean Hospital',
  nch: 'Nantucket Cottage Hospital',
  nwh: 'Newton-Wellesley Hospital',
  slm: 'Salem Hospital',
  wdh: 'Wentworth-Douglass Hospital',
  'nsmc-union': 'North Shore Medical Center - Union Hospital',
  'srn-boston': 'Spaulding Rehabilitation Hospital - Boston',
  'srn-cape-cod': 'Spaulding Rehabilitation Hospital Cape Cod',
  'srn-cambridge': 'Spaulding Hospital for Continuing Medical Care Cambridge',
  'srn-brighton': 'Spaulding Nursing and Therapy Center Brighton'
};

const MASS_GENERAL_BRIGHAM_TITLE_ALIASES = [
  {
    pattern: /\bbrigham and women'?s faulkner hospital\b/i,
    facilityName: "Brigham and Women's Faulkner Hospital"
  },
  {
    pattern: /\bbrigham and women'?s hospital\b/i,
    facilityName: "Brigham and Women's Hospital"
  },
  { pattern: /\bcooley dickinson hospital\b/i, facilityName: 'Cooley Dickinson Hospital' },
  { pattern: /\bmassachusetts general hospital\b/i, facilityName: 'Massachusetts General Hospital' },
  { pattern: /\bmass eye and ear\b/i, facilityName: 'Mass Eye and Ear' },
  { pattern: /\bmclean hospital\b/i, facilityName: 'McLean Hospital' },
  { pattern: /\bnantucket cottage hospital\b/i, facilityName: 'Nantucket Cottage Hospital' },
  { pattern: /\bnewton[-\s]wellesley hospital\b/i, facilityName: 'Newton-Wellesley Hospital' },
  { pattern: /\bsalem hospital\b/i, facilityName: 'Salem Hospital' },
  {
    pattern: /\bnorth shore medical center\s*[-–]\s*union hospital\b/i,
    facilityName: 'North Shore Medical Center - Union Hospital'
  },
  {
    pattern: /\bspaulding rehabilitation hospital\s*[-–]\s*boston\b/i,
    facilityName: 'Spaulding Rehabilitation Hospital - Boston'
  },
  {
    pattern: /\bspaulding rehabilitation hospital cape cod\b/i,
    facilityName: 'Spaulding Rehabilitation Hospital Cape Cod'
  },
  {
    pattern: /\bspaulding hospital for continuing medical care cambridge\b/i,
    facilityName: 'Spaulding Hospital for Continuing Medical Care Cambridge'
  },
  {
    pattern: /\bspaulding nursing and therapy center brighton\b/i,
    facilityName: 'Spaulding Nursing and Therapy Center Brighton'
  },
  { pattern: /\bwentworth-douglass hospital\b/i, facilityName: 'Wentworth-Douglass Hospital' }
];

function inferMassGeneralBrighamFacilityFromUrl(url = '') {
  const codeMatch =
    /medical-records-release-([a-z0-9-]+?)-(?:english|spanish|portuguese|indonesian)\.pdf(?:$|\?)/i.exec(
      url
    );

  if (!codeMatch) return null;
  return MASS_GENERAL_BRIGHAM_DOCUMENT_FACILITY_CODES[codeMatch[1].toLowerCase()] || null;
}

function inferMassGeneralBrighamFacilityFromTitle(title = '') {
  for (const alias of MASS_GENERAL_BRIGHAM_TITLE_ALIASES) {
    if (alias.pattern.test(title)) {
      return alias.facilityName;
    }
  }

  return null;
}

export function inferFacilityNameFromDocument({ systemName = '', url = '', title = '' }) {
  if ((systemName || '').trim().toLowerCase() !== 'mass general brigham') {
    return null;
  }

  return (
    inferMassGeneralBrighamFacilityFromUrl(url) || inferMassGeneralBrighamFacilityFromTitle(title) || null
  );
}
