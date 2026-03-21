const STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY',
];

const STATE_NAMES = {
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
};

const FIPS_TO_STATE = {
  '01': 'AL',
  '02': 'AK',
  '04': 'AZ',
  '05': 'AR',
  '06': 'CA',
  '08': 'CO',
  '09': 'CT',
  '10': 'DE',
  '12': 'FL',
  '13': 'GA',
  '15': 'HI',
  '16': 'ID',
  '17': 'IL',
  '18': 'IN',
  '19': 'IA',
  '20': 'KS',
  '21': 'KY',
  '22': 'LA',
  '23': 'ME',
  '24': 'MD',
  '25': 'MA',
  '26': 'MI',
  '27': 'MN',
  '28': 'MS',
  '29': 'MO',
  '30': 'MT',
  '31': 'NE',
  '32': 'NV',
  '33': 'NH',
  '34': 'NJ',
  '35': 'NM',
  '36': 'NY',
  '37': 'NC',
  '38': 'ND',
  '39': 'OH',
  '40': 'OK',
  '41': 'OR',
  '42': 'PA',
  '44': 'RI',
  '45': 'SC',
  '46': 'SD',
  '47': 'TN',
  '48': 'TX',
  '49': 'UT',
  '50': 'VT',
  '51': 'VA',
  '53': 'WA',
  '54': 'WV',
  '55': 'WI',
  '56': 'WY',
};

const REVIEW_BUCKET_LABELS = {
  parse_failures: 'Parse Failures',
  zero_pdf_systems: 'Zero-PDF Systems',
  low_confidence_question_drafts: 'Low-Confidence Drafts',
  stale_templates: 'Stale Templates',
  suspicious_filenames: 'Suspicious Filenames',
  partial_workflows: 'Partial Workflows',
  manual_imports_pending_recrawl: 'Manual Imports Pending Recrawl',
};

const MAP_COLORS = {
  green: '#22c55e',
  yellow: '#d97706',
  red: '#f87171',
};

const state = {
  currentView: 'home',
  currentState: null,
  currentStateTab: 'systems',
  currentPipelineTab: 'flow',
  sidebarDesktopExpanded: true,
  sidebarMobileOpen: false,
  homePreviewState: 'WA',
  nationalOverview: null,
  stateSummary: null,
  systems: [],
  reviewQueue: null,
  selectedSystemId: null,
  selectedSystemDetail: null,
  runHistory: null,
  runHistoryFilterSystemId: '',
  systemFilter: '',
  pipelineRunResult: null,
  pdfEditorReview: null,
  pdfEditorDraftPayload: null,
  pdfEditorQuestions: [],
  pdfEditorActiveQuestionId: null,
  pdfEditorRenderedPages: [],
  pdfEditorDrawMode: false,
  pdfEditorPendingDraw: null,
  pdfEditorDraftDirty: false,
  pdfEditorSaveStatus: null,
  pdfDocumentProxy: null,
  pdfJsLib: null,
  pdfEditorRenderToken: 0,
  mapFeatures: null,
  mapNationMesh: null,
  mapPathsSelection: null,
};

const elements = {
  appShell: document.querySelector('#app-shell'),
  sidebarBackdrop: document.querySelector('#sidebar-backdrop'),
  appSidebar: document.querySelector('#app-sidebar'),
  sidebarToggle: document.querySelector('#sidebar-toggle'),
  sidebarToggleDesktopIcon: document.querySelector('#sidebar-toggle-desktop-icon'),
  sidebarToggleMobileIcon: document.querySelector('#sidebar-toggle-mobile-icon'),
  sidebarToggleCloseIcon: document.querySelector('#sidebar-toggle-close-icon'),
  appScrollRoot: document.querySelector('#app-scroll-root'),
  pageKicker: document.querySelector('#page-kicker'),
  homeNav: document.querySelector('#home-nav'),
  stateNav: document.querySelector('#state-nav'),
  sidebarSystemsNav: document.querySelector('#sidebar-systems-nav'),
  sidebarPipelineNav: document.querySelector('#sidebar-pipeline-nav'),
  sidebarResultsNav: document.querySelector('#sidebar-results-nav'),
  sidebarHistoryNav: document.querySelector('#sidebar-history-nav'),
  sidebarEditorNav: document.querySelector('#sidebar-editor-nav'),
  sidebarStateSummary: document.querySelector('#sidebar-state-summary'),
  homeView: document.querySelector('#home-view'),
  stateView: document.querySelector('#state-view'),
  homeMap: document.querySelector('#home-map'),
  homeOverviewCards: document.querySelector('#home-overview-cards'),
  homeStatePreview: document.querySelector('#home-state-preview'),
  homeAttentionList: document.querySelector('#home-attention-list'),
  refreshMap: document.querySelector('#refresh-map'),
  backHome: document.querySelector('#back-home'),
  stateBreadcrumb: document.querySelector('#state-breadcrumb'),
  stateTitle: document.querySelector('#state-title'),
  pageCopy: document.querySelector('#page-copy'),
  stateSelect: document.querySelector('#state-select'),
  refreshState: document.querySelector('#refresh-state'),
  stateSummary: document.querySelector('#state-summary'),
  systemsTab: document.querySelector('#systems-tab'),
  pipelineTab: document.querySelector('#pipeline-tab'),
  historyTab: document.querySelector('#history-tab'),
  systemsPanel: document.querySelector('#systems-panel'),
  pipelinePanel: document.querySelector('#pipeline-panel'),
  runHistoryPanel: document.querySelector('#run-history-panel'),
  systemFilter: document.querySelector('#system-filter'),
  systemsTable: document.querySelector('#systems-table'),
  priorityBuckets: document.querySelector('#priority-buckets'),
  pipelineSystemSelect: document.querySelector('#pipeline-system-select'),
  runPipeline: document.querySelector('#run-pipeline'),
  pipelineFlowTab: document.querySelector('#pipeline-flow-tab'),
  pipelineResultsTab: document.querySelector('#pipeline-results-tab'),
  pipelineFlowPanel: document.querySelector('#pipeline-flow-panel'),
  pipelineResultsPanel: document.querySelector('#pipeline-results-panel'),
  pipelineRunResult: document.querySelector('#pipeline-run-result'),
  pipelineVisual: document.querySelector('#pipeline-visual'),
  pipelineInsights: document.querySelector('#pipeline-insights'),
  pipelineResultsSummary: document.querySelector('#pipeline-results-summary'),
  pipelineResultsList: document.querySelector('#pipeline-results-list'),
  runHistorySystemSelect: document.querySelector('#run-history-system-select'),
  refreshRunHistory: document.querySelector('#refresh-run-history'),
  runHistorySummary: document.querySelector('#run-history-summary'),
  runHistoryList: document.querySelector('#run-history-list'),
  runHistoryInsights: document.querySelector('#run-history-insights'),
  pdfEditorPanel: document.querySelector('#pdf-editor-panel'),
  backToResults: document.querySelector('#back-to-results'),
  pdfEditorTitle: document.querySelector('#pdf-editor-title'),
  pdfEditorCopy: document.querySelector('#pdf-editor-copy'),
  pdfEditorSaveStatus: document.querySelector('#pdf-editor-save-status'),
  pdfEditorMetrics: document.querySelector('#pdf-editor-metrics'),
  startManualMapping: document.querySelector('#start-manual-mapping'),
  savePdfDraft: document.querySelector('#save-pdf-draft'),
  publishPdfDraft: document.querySelector('#publish-pdf-draft'),
  openCachedPdf: document.querySelector('#open-cached-pdf'),
  pdfEditorAuthoring: document.querySelector('#pdf-editor-authoring'),
  manualQuestionLabel: document.querySelector('#manual-question-label'),
  addManualQuestion: document.querySelector('#add-manual-question'),
  mapSelectedQuestion: document.querySelector('#map-selected-question'),
  pdfEditorQuestions: document.querySelector('#pdf-editor-questions'),
  pdfEditorPages: document.querySelector('#pdf-editor-pages'),
};

const DESKTOP_SIDEBAR_MEDIA_QUERY = window.matchMedia('(min-width: 1280px)');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] || character;
  });
}

function renderIconLink(url, label) {
  if (!url) {
    return '<span class="system-subtext">No source URL</span>';
  }

  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label || 'Open source URL');

  return `
    <a
      class="icon-link"
      href="${safeUrl}"
      target="_blank"
      rel="noreferrer"
      title="${safeUrl}"
      aria-label="${safeLabel}"
    >
      <svg class="icon-link-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="sr-only">${safeLabel}</span>
    </a>
  `;
}

function renderIconAction(action, label, dataAttributes = '') {
  const safeLabel = escapeHtml(label || 'Open');

  return `
    <button
      type="button"
      class="icon-link"
      data-action="${escapeHtml(action)}"
      ${dataAttributes}
      aria-label="${safeLabel}"
      title="${safeLabel}"
    >
      <svg class="icon-link-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="sr-only">${safeLabel}</span>
    </button>
  `;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return 'n/a';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function isDesktopSidebarViewport() {
  return DESKTOP_SIDEBAR_MEDIA_QUERY.matches;
}

function syncSidebarFrame() {
  const isDesktop = isDesktopSidebarViewport();
  if (isDesktop) {
    state.sidebarMobileOpen = false;
  }

  elements.appShell?.classList.toggle(
    'sidebar-desktop-collapsed',
    isDesktop && !state.sidebarDesktopExpanded,
  );
  elements.appShell?.classList.toggle('sidebar-mobile-open', !isDesktop && state.sidebarMobileOpen);

  const toggleActive = isDesktop ? !state.sidebarDesktopExpanded : state.sidebarMobileOpen;
  elements.sidebarToggle?.classList.toggle('sidebar-toggle-button-active', toggleActive);
  elements.sidebarToggle?.setAttribute(
    'aria-label',
    isDesktop
      ? state.sidebarDesktopExpanded
        ? 'Collapse sidebar'
        : 'Expand sidebar'
      : state.sidebarMobileOpen
        ? 'Close sidebar'
        : 'Open sidebar',
  );
  elements.sidebarToggle?.setAttribute(
    'aria-expanded',
    isDesktop ? String(state.sidebarDesktopExpanded) : String(state.sidebarMobileOpen),
  );

  elements.sidebarToggleDesktopIcon?.classList.toggle('hidden', !isDesktop);
  elements.sidebarToggleMobileIcon?.classList.toggle('hidden', isDesktop || state.sidebarMobileOpen);
  elements.sidebarToggleCloseIcon?.classList.toggle('hidden', isDesktop || !state.sidebarMobileOpen);
}

function closeSidebarIfMobile() {
  if (isDesktopSidebarViewport() || !state.sidebarMobileOpen) return;
  state.sidebarMobileOpen = false;
  syncSidebarFrame();
}

function toggleSidebar() {
  if (isDesktopSidebarViewport()) {
    state.sidebarDesktopExpanded = !state.sidebarDesktopExpanded;
  } else {
    state.sidebarMobileOpen = !state.sidebarMobileOpen;
  }

  syncSidebarFrame();
}

function scrollDashboardToTop() {
  if (elements.appScrollRoot) {
    elements.appScrollRoot.scrollTo({ top: 0, behavior: 'auto' });
    return;
  }

  window.scrollTo({ top: 0, behavior: 'auto' });
}

function cloneJson(value) {
  if (value == null) return null;
  return JSON.parse(JSON.stringify(value));
}

function slugifyId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `question-${Date.now()}`;
}

function deltaPillClass(metric) {
  if (metric?.improved === true) return 'delta-pill delta-pill-improved';
  if (metric?.improved === false) return 'delta-pill delta-pill-regressed';
  return 'delta-pill delta-pill-neutral';
}

function formatSignedDelta(value) {
  const number = Number(value || 0);
  if (number > 0) return `+${formatNumber(number)}`;
  if (number < 0) return `-${formatNumber(Math.abs(number))}`;
  return '0';
}

async function fetchJson(path, init) {
  const response = await fetch(path, init);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : `Request failed: ${response.status}`);
  }

  return body;
}

function notify(message, isError = false) {
  if (isError) {
    window.alert(message);
    return;
  }
  console.log(message);
}

function overviewEntryForState(stateCode) {
  return state.nationalOverview?.states?.find((entry) => entry.state === stateCode) || null;
}

function currentSystem() {
  return state.systems.find((system) => system.hospital_system_id === state.selectedSystemId) || null;
}

function latestRunForSelectedSystem() {
  const runs = Array.isArray(state.runHistory?.runs) ? state.runHistory.runs : [];
  if (!state.selectedSystemId) {
    return runs[0] || null;
  }

  return runs.find((run) => run.hospital_system_id === state.selectedSystemId) || null;
}

function fileNameFromPath(filePath) {
  const value = String(filePath || '').trim();
  if (!value) return null;
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : value;
}

function fileNameFromUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.length ? decodeURIComponent(parts[parts.length - 1]) : null;
  } catch {
    return null;
  }
}

function sourceDocumentDisplayName(document) {
  return (
    String(document?.title || '').trim() ||
    fileNameFromPath(document?.storage_path) ||
    fileNameFromUrl(document?.source_url) ||
    'PDF Document'
  );
}

function currentPdfEditorQuestion() {
  return (
    state.pdfEditorQuestions.find((question) => question.id === state.pdfEditorActiveQuestionId) || null
  );
}

function currentPdfDraftPayload() {
  return state.pdfEditorDraftPayload || null;
}

function canStartManualMapping() {
  const payload = currentPdfDraftPayload();
  if (!payload) return false;
  if (payload.supported && payload.mode === 'overlay') return true;
  return !payload.supported || !Array.isArray(payload.questions) || payload.questions.length === 0;
}

function hasManualOverlayDraft() {
  const payload = currentPdfDraftPayload();
  return Boolean(payload?.supported && payload?.mode === 'overlay');
}

function resetPdfEditorState() {
  state.pdfEditorReview = null;
  state.pdfEditorDraftPayload = null;
  state.pdfEditorQuestions = [];
  state.pdfEditorActiveQuestionId = null;
  state.pdfEditorRenderedPages = [];
  state.pdfEditorDrawMode = false;
  state.pdfEditorPendingDraw = null;
  state.pdfEditorDraftDirty = false;
  state.pdfEditorSaveStatus = null;
  state.pdfDocumentProxy = null;
}

function systemFailures(system) {
  if (!system?.stats) return 0;
  return (
    Number(system.stats.parse_failures || 0) +
    Number(system.stats.partial_workflows || 0) +
    Number(system.stats.low_confidence_question_drafts || 0)
  );
}

function mapStatus(entry) {
  const counts = entry?.counts || {};
  const seededSystems = Number(counts.seeded_systems || 0);
  const dbSystems = Number(counts.db_systems || 0);
  const activeSeedUrls = Number(counts.active_seed_urls || 0);
  const sourceDocuments = Number(counts.source_documents || 0);
  const pdfSourceDocuments = Number(counts.pdf_source_documents || 0);
  const workflows = Number(counts.workflows || 0);
  const zeroPdfSystems = Number(counts.zero_pdf_systems || 0);

  if (pdfSourceDocuments > 0 && zeroPdfSystems === 0) {
    return 'green';
  }

  if (
    seededSystems > 0 ||
    dbSystems > 0 ||
    activeSeedUrls > 0 ||
    sourceDocuments > 0 ||
    pdfSourceDocuments > 0 ||
    workflows > 0
  ) {
    return 'yellow';
  }

  return 'red';
}

function statusPillClass(status) {
  if (status === 'green') return 'status-pill status-green';
  if (status === 'red') return 'status-pill status-red';
  return 'status-pill status-yellow';
}

function mapStatusLabel(status) {
  if (status === 'green') return 'Healthy';
  if (status === 'red') return 'Blocked / Unstarted';
  return 'In Progress';
}

function deriveReachability(system) {
  if (!system?.stats) {
    return { label: 'Unknown', tone: 'red' };
  }

  if (Number(system.stats.manual_imports || 0) > 0 && Number(system.stats.source_documents || 0) > 0) {
    return { label: 'Human assisted', tone: 'yellow' };
  }

  if (Number(system.stats.pdf_source_documents || 0) > 0) {
    return { label: 'Reachable', tone: 'green' };
  }

  if (Number(system.stats.source_documents || 0) > 0) {
    return { label: 'Partial', tone: 'yellow' };
  }

  return { label: 'Needs assist', tone: 'red' };
}

function deriveSystemUrl(system) {
  return (
    system?.db_seed_urls?.[0]?.url ||
    system?.seed_file?.seed_urls?.[0] ||
    (system?.domain ? `https://${system.domain}` : null)
  );
}

function deriveHomeTotals() {
  const entries = Array.isArray(state.nationalOverview?.states) ? state.nationalOverview.states : [];
  return entries.reduce(
    (totals, entry) => {
      const status = mapStatus(entry);
      totals.totalStates += 1;
      totals.totalSystems += Number(entry.counts?.db_systems || 0);
      totals.totalPdfs += Number(entry.counts?.pdf_source_documents || 0);
      totals[status] += 1;
      return totals;
    },
    {
      totalStates: 0,
      totalSystems: 0,
      totalPdfs: 0,
      green: 0,
      yellow: 0,
      red: 0,
    },
  );
}

function statusPriority(status) {
  if (status === 'red') return 0;
  if (status === 'yellow') return 1;
  return 2;
}

function sidebarMenuClass(isActive, isEnabled = true) {
  if (!isEnabled) {
    return 'menu-item menu-item-inactive opacity-40';
  }

  return isActive ? 'menu-item menu-item-active' : 'menu-item menu-item-inactive';
}

function applySidebarButtonState(button, isActive, isEnabled = true) {
  if (!button) return;
  button.disabled = !isEnabled;
  button.className = sidebarMenuClass(isActive, isEnabled);

  const icon = button.querySelector('svg');
  if (!icon) return;

  icon.className = `menu-item-icon ${isActive ? 'menu-item-icon-active' : 'menu-item-icon-inactive'}${
    isEnabled ? '' : ' opacity-60'
  }`;
}

function defaultSystemId() {
  const highPriority =
    state.systems.find((system) => system.zero_pdf || systemFailures(system) > 0) || state.systems[0];
  return highPriority?.hospital_system_id || null;
}

function syncOverviewForCurrentState() {
  if (!state.nationalOverview || !state.stateSummary) return;

  state.nationalOverview.states = state.nationalOverview.states.map((entry) =>
    entry.state === state.currentState
      ? {
          ...entry,
          counts: state.stateSummary.counts,
        }
      : entry,
  );

  renderHomeAttentionList();
  renderSidebarStateSummary();
}

function populateStateSelect() {
  elements.stateSelect.innerHTML = STATE_CODES.map(
    (stateCode) => `<option value="${stateCode}">${escapeHtml(stateCode)} - ${escapeHtml(STATE_NAMES[stateCode])}</option>`,
  ).join('');

  if (state.currentState) {
    elements.stateSelect.value = state.currentState;
    return;
  }

  elements.stateSelect.value = state.homePreviewState;
}

function updateBreadcrumb() {
  if (state.currentView === 'home') {
    elements.stateBreadcrumb.textContent = 'Home > National Map';
    return;
  }

  if (state.currentStateTab === 'history') {
    elements.stateBreadcrumb.textContent = 'State View > Run History';
    return;
  }

  if (state.currentStateTab === 'systems') {
    elements.stateBreadcrumb.textContent = 'State View > Systems';
    return;
  }

  if (state.pdfEditorReview) {
    elements.stateBreadcrumb.textContent = 'State View > Pipeline > Results > PDF Editor';
    return;
  }

  if (state.currentPipelineTab === 'results') {
    elements.stateBreadcrumb.textContent = 'State View > Pipeline > Results';
    return;
  }

  elements.stateBreadcrumb.textContent = 'State View > Pipeline > Flow';
}

function renderSidebarStateSummary() {
  if (!state.nationalOverview) {
    elements.sidebarStateSummary.innerHTML = '<div class="empty-state">Loading coverage summary…</div>';
    return;
  }

  const stateEntry = overviewEntryForState(state.currentState || state.homePreviewState);
  const stateStatus = mapStatus(stateEntry);
  const system = currentSystem();

  if (!state.currentState) {
    elements.sidebarStateSummary.innerHTML = `
      <div class="${statusPillClass(stateStatus)}">${escapeHtml(mapStatusLabel(stateStatus))}</div>
      <div class="mt-4 text-lg font-semibold text-gray-900">${escapeHtml(STATE_NAMES[state.homePreviewState] || state.homePreviewState)}</div>
      <p class="mt-3 text-sm leading-6 text-gray-500">
        Highlighted on the map.
      </p>
    `;
    return;
  }

  elements.sidebarStateSummary.innerHTML = `
    <div class="${statusPillClass(stateStatus)}">${escapeHtml(mapStatusLabel(stateStatus))}</div>
    <div class="mt-4 text-lg font-semibold text-gray-900">${escapeHtml(STATE_NAMES[state.currentState] || state.currentState)}</div>
    <p class="mt-3 text-sm leading-6 text-gray-500">
      ${formatNumber(state.systems.length)} systems in scope.
      ${system ? `Focused system: ${escapeHtml(system.system_name)}.` : 'Choose a system to focus the pipeline.'}
    </p>
    <div class="sidebar-metric-grid">
      <div class="sidebar-metric">
        <div class="sidebar-metric-label">PDFs</div>
        <div class="sidebar-metric-value">${formatNumber(state.stateSummary?.counts?.pdf_source_documents || 0)}</div>
      </div>
      <div class="sidebar-metric">
        <div class="sidebar-metric-label">Failures</div>
        <div class="sidebar-metric-value">${formatNumber(state.stateSummary?.counts?.failures || 0)}</div>
      </div>
    </div>
  `;
}

function updateSidebarSectionNav() {
  const hasState = Boolean(state.currentState);
  const systemsActive = state.currentView === 'state' && state.currentStateTab === 'systems';
  const historyActive = state.currentView === 'state' && state.currentStateTab === 'history';
  const pipelineActive =
    state.currentView === 'state' &&
    state.currentStateTab === 'pipeline' &&
    state.currentPipelineTab === 'flow' &&
    !state.pdfEditorReview;
  const resultsActive =
    state.currentView === 'state' &&
    state.currentStateTab === 'pipeline' &&
    state.currentPipelineTab === 'results' &&
    !state.pdfEditorReview;
  const editorActive = state.currentView === 'state' && Boolean(state.pdfEditorReview);

  elements.sidebarEditorNav.classList.toggle('hidden', !state.pdfEditorReview);

  applySidebarButtonState(elements.sidebarSystemsNav, systemsActive, hasState);
  applySidebarButtonState(elements.sidebarPipelineNav, pipelineActive, hasState);
  applySidebarButtonState(elements.sidebarResultsNav, resultsActive, hasState);
  applySidebarButtonState(elements.sidebarHistoryNav, historyActive, hasState);
  applySidebarButtonState(elements.sidebarEditorNav, editorActive, Boolean(state.pdfEditorReview));
  if (!state.pdfEditorReview) {
    elements.sidebarEditorNav.classList.add('hidden');
  }
}

function updateDashboardChrome() {
  if (state.currentView === 'home') {
    elements.pageKicker.textContent = 'Dashboard';
    elements.stateTitle.textContent = 'Records Workflow';
    elements.pageCopy.textContent = '';
    elements.pageCopy.classList.toggle('hidden', !elements.pageCopy.textContent.trim());
    elements.refreshMap.classList.remove('hidden');
    elements.refreshState.classList.add('hidden');
    elements.backHome.classList.add('hidden');
    updateBreadcrumb();
    renderSidebarStateSummary();
    updateSidebarSectionNav();
    return;
  }

  const stateName = STATE_NAMES[state.currentState] || state.currentState || 'State';
  elements.pageKicker.textContent = state.pdfEditorReview
    ? 'PDF Editor'
    : state.currentStateTab === 'history'
      ? 'Run History'
    : state.currentStateTab === 'pipeline'
      ? 'Pipeline'
      : 'State View';
  elements.stateTitle.textContent = state.pdfEditorReview
    ? `${stateName} PDF Editor`
    : state.currentStateTab === 'history'
      ? `${stateName} Run History`
    : state.currentStateTab === 'pipeline'
      ? `${stateName} Pipeline`
      : `${stateName}`;
  elements.pageCopy.textContent = '';
  elements.pageCopy.classList.toggle('hidden', !elements.pageCopy.textContent.trim());
  elements.refreshMap.classList.add('hidden');
  elements.refreshState.classList.remove('hidden');
  elements.backHome.classList.remove('hidden');
  updateBreadcrumb();
  renderSidebarStateSummary();
  updateSidebarSectionNav();
}

function setNavState() {
  elements.homeView.classList.toggle('hidden', state.currentView !== 'home');
  elements.stateView.classList.toggle('hidden', state.currentView !== 'state');

  applySidebarButtonState(elements.homeNav, state.currentView === 'home');
  applySidebarButtonState(elements.stateNav, state.currentView === 'state', Boolean(state.currentState));
  updateDashboardChrome();
}

function setStateTab(nextTab) {
  state.currentStateTab = nextTab;
  elements.systemsPanel.classList.toggle('hidden', nextTab !== 'systems');
  elements.pipelinePanel.classList.toggle('hidden', nextTab !== 'pipeline');
  elements.runHistoryPanel.classList.toggle('hidden', nextTab !== 'history');
  elements.systemsTab.className = nextTab === 'systems' ? 'nav-pill nav-pill-active' : 'nav-pill';
  elements.pipelineTab.className = nextTab === 'pipeline' ? 'nav-pill nav-pill-active' : 'nav-pill';
  elements.historyTab.className = nextTab === 'history' ? 'nav-pill nav-pill-active' : 'nav-pill';
  scrollDashboardToTop();
  if (nextTab !== 'pipeline') {
    resetPdfEditorState();
  }
  if (nextTab === 'pipeline') {
    setPipelineTab(state.currentPipelineTab || 'flow');
    return;
  }
  updateDashboardChrome();
}

function setPipelineTab(nextTab) {
  state.currentPipelineTab = nextTab;
  elements.pipelineFlowPanel.classList.toggle('hidden', nextTab !== 'flow');
  elements.pipelineResultsPanel.classList.toggle('hidden', nextTab !== 'results');
  elements.pipelineFlowTab.className =
    nextTab === 'flow' ? 'subnav-pill subnav-pill-active' : 'subnav-pill';
  elements.pipelineResultsTab.className =
    nextTab === 'results' ? 'subnav-pill subnav-pill-active' : 'subnav-pill';
  scrollDashboardToTop();
  updateDashboardChrome();
}

function showHomeView() {
  state.currentView = 'home';
  closeSidebarIfMobile();
  scrollDashboardToTop();
  setNavState();
}

function showStateView() {
  state.currentView = 'state';
  closeSidebarIfMobile();
  scrollDashboardToTop();
  setNavState();
}

function renderHomeOverviewCards() {
  if (!state.nationalOverview) {
    elements.homeOverviewCards.innerHTML = '<div class="empty-state">Loading national coverage metrics…</div>';
    return;
  }

  const totals = deriveHomeTotals();
  const cards = [
    {
      label: 'States',
      value: totals.totalStates,
      note: 'Tracked rollout states.',
    },
    {
      label: 'Systems',
      value: totals.totalSystems,
      note: 'Hospital systems in scope.',
    },
    {
      label: 'PDFs',
      value: totals.totalPdfs,
      note: 'Cached PDF source documents.',
    },
    {
      label: 'Full Coverage',
      value: totals.green,
      note: 'States with PDFs across all tracked systems.',
    },
  ];

  elements.homeOverviewCards.innerHTML = cards
    .map(
      (card) => `
        <article class="metric-card">
          <div class="metric-label">${escapeHtml(card.label)}</div>
          <div class="metric-value">${formatNumber(card.value)}</div>
          <p class="metric-note">${escapeHtml(card.note)}</p>
        </article>
      `,
    )
    .join('');
}

function renderHomeStatePreview() {
  if (!state.nationalOverview) {
    elements.homeStatePreview.innerHTML = '<div class="empty-state">Select a state once the map loads.</div>';
    return;
  }

  const entry = overviewEntryForState(state.homePreviewState) || state.nationalOverview.states[0];
  if (!entry) {
    elements.homeStatePreview.innerHTML = '<div class="empty-state">No state data is available.</div>';
    return;
  }

  const status = mapStatus(entry);
  elements.homeStatePreview.innerHTML = `
    <div class="${statusPillClass(status)}">${escapeHtml(mapStatusLabel(status))}</div>
    <h3 class="preview-title">${escapeHtml(entry.state_name || entry.state)}</h3>
    <p class="preview-copy">
      ${formatNumber(entry.counts?.db_systems || 0)} hospital systems,
      ${formatNumber(entry.counts?.pdf_source_documents || 0)} PDFs,
      ${formatNumber(entry.counts?.workflows || 0)} workflows.
    </p>
    <div class="preview-grid">
      <div class="detail-item">
        <div class="detail-item-title">Seeded Systems</div>
        <div class="detail-item-copy">${formatNumber(entry.counts?.seeded_systems || 0)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-item-title">Workflows</div>
        <div class="detail-item-copy">${formatNumber(entry.counts?.workflows || 0)}</div>
      </div>
    </div>
    <button type="button" class="preview-button" data-action="open-state" data-state="${escapeHtml(entry.state)}">
      Open ${escapeHtml(entry.state)} State View
    </button>
  `;
}

function renderHomeAttentionList() {
  if (!state.nationalOverview) {
    elements.homeAttentionList.innerHTML = '<div class="empty-state">Loading state queue…</div>';
    return;
  }

  const rankedStates = [...(state.nationalOverview.states || [])]
    .sort((left, right) => {
      const statusDelta = statusPriority(mapStatus(left)) - statusPriority(mapStatus(right));
      if (statusDelta !== 0) return statusDelta;
      return Number(right.counts?.failures || 0) - Number(left.counts?.failures || 0);
    })
    .slice(0, 6);

  if (!rankedStates.length) {
    elements.homeAttentionList.innerHTML = '<div class="empty-state">No state rows are available.</div>';
    return;
  }

  elements.homeAttentionList.innerHTML = rankedStates
    .map((entry) => {
      const status = mapStatus(entry);
      return `
        <article class="attention-item">
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="attention-title">${escapeHtml(entry.state_name || entry.state)}</div>
              <div class="attention-copy">
                ${formatNumber(entry.counts?.db_systems || 0)} systems •
                ${formatNumber(entry.counts?.pdf_source_documents || 0)} PDFs •
                ${formatNumber(entry.counts?.failures || 0)} failures
              </div>
            </div>
            <span class="${statusPillClass(status)}">${escapeHtml(mapStatusLabel(status))}</span>
          </div>
          <button type="button" class="bucket-action mt-4" data-action="open-state" data-state="${escapeHtml(entry.state)}">
            Open ${escapeHtml(entry.state)}
          </button>
        </article>
      `;
    })
    .join('');
}

async function ensureMapData() {
  if (state.mapFeatures && state.mapNationMesh) {
    return;
  }

  const topology = await fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json').then((response) =>
    response.json(),
  );
  const features = topojson.feature(topology, topology.objects.states).features.filter((feature) =>
    Boolean(FIPS_TO_STATE[String(feature.id).padStart(2, '0')]),
  );
  state.mapFeatures = features;
  state.mapNationMesh = topojson.mesh(topology, topology.objects.states, (left, right) => left !== right);
}

function updateMapHighlight() {
  if (!state.mapPathsSelection) return;

  state.mapPathsSelection
    .attr('stroke', (feature) => {
      const code = FIPS_TO_STATE[String(feature.id).padStart(2, '0')];
      return code === state.homePreviewState ? '#0f172a' : '#ffffff';
    })
    .attr('stroke-width', (feature) => {
      const code = FIPS_TO_STATE[String(feature.id).padStart(2, '0')];
      return code === state.homePreviewState ? 2.5 : 1.25;
    });
}

async function renderMap() {
  elements.homeMap.innerHTML = '<div class="empty-state">Loading state map…</div>';

  if (!state.nationalOverview) {
    return;
  }

  await ensureMapData();

  elements.homeMap.innerHTML = '';
  const width = Math.max(elements.homeMap.clientWidth, 720);
  const height = 460;
  const projection = d3
    .geoAlbersUsa()
    .fitSize([width, height], { type: 'FeatureCollection', features: state.mapFeatures });
  const path = d3.geoPath(projection);

  const svg = d3
    .select(elements.homeMap)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'United States state status map');

  svg
    .append('path')
    .datum(state.mapNationMesh)
    .attr('d', path)
    .attr('fill', 'none')
    .attr('stroke', '#ffffff')
    .attr('stroke-linejoin', 'round')
    .attr('stroke-width', 1);

  state.mapPathsSelection = svg
    .append('g')
    .selectAll('path')
    .data(state.mapFeatures)
    .join('path')
    .attr('d', path)
    .attr('fill', (feature) => {
      const code = FIPS_TO_STATE[String(feature.id).padStart(2, '0')];
      const status = mapStatus(overviewEntryForState(code));
      return MAP_COLORS[status];
    })
    .style('cursor', 'pointer')
    .on('mouseenter', (_event, feature) => {
      const code = FIPS_TO_STATE[String(feature.id).padStart(2, '0')];
      state.homePreviewState = code;
      renderHomeStatePreview();
      updateMapHighlight();
    })
    .on('click', async (_event, feature) => {
      const code = FIPS_TO_STATE[String(feature.id).padStart(2, '0')];
      await loadStateView(code);
    });

  state.mapPathsSelection.append('title').text((feature) => {
    const code = FIPS_TO_STATE[String(feature.id).padStart(2, '0')];
    const entry = overviewEntryForState(code);
    const status = mapStatus(entry);
    return `${STATE_NAMES[code]}: ${mapStatusLabel(status)}`;
  });

  updateMapHighlight();
}

function renderStateSummary() {
  if (!state.stateSummary) {
    elements.stateSummary.innerHTML = '<div class="empty-state">Choose a state from the map to load its dashboard.</div>';
    return;
  }

  const counts = state.stateSummary.counts || {};
  const cards = [
    ['Seeded Systems', counts.seeded_systems, 'Systems currently present in the seed file.'],
    ['Source Documents', counts.source_documents, 'HTML and PDF source documents cached in the DB.'],
    ['PDFs', counts.pdf_source_documents, 'PDF-backed documents discovered for this state.'],
    ['Workflows', counts.workflows, 'Structured workflow rows extracted from crawled documents.'],
    ['Failures', counts.failures, 'Parse failures, partial workflows, and weak PDF drafts.'],
    ['Last Crawl', counts.last_crawl_at ? formatDateTime(counts.last_crawl_at) : 'n/a', 'Most recent document fetch seen for this state.'],
  ];

  elements.stateSummary.innerHTML = cards
    .map(
      ([label, value, note]) => `
        <article class="metric-card">
          <div class="metric-label">${escapeHtml(label)}</div>
          <div class="metric-value">${escapeHtml(typeof value === 'number' ? formatNumber(value) : value)}</div>
          <p class="metric-note">${escapeHtml(note)}</p>
        </article>
      `,
    )
    .join('');
}

function renderSystemsTable() {
  if (!state.stateSummary) {
    elements.systemsTable.innerHTML = '<div class="empty-state">State systems appear here after you open a state.</div>';
    return;
  }

  const query = state.systemFilter.trim().toLowerCase();
  const systems = state.systems.filter((system) => {
    if (!query) return true;
    return (
      system.system_name.toLowerCase().includes(query) ||
      String(system.domain || '').toLowerCase().includes(query) ||
      String(deriveSystemUrl(system) || '').toLowerCase().includes(query)
    );
  });

  if (systems.length === 0) {
    elements.systemsTable.innerHTML = '<div class="empty-state">No hospital systems match the current filter.</div>';
    return;
  }

  elements.systemsTable.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th class="data-head min-w-[16rem]">System</th>
          <th class="data-head min-w-[10rem]">Bot Reachability</th>
          <th class="data-head min-w-[5rem] text-center">PDF Link</th>
          <th class="data-head min-w-[4.5rem]">PDFs</th>
          <th class="data-head min-w-[6.5rem]">Source Docs</th>
          <th class="data-head min-w-[6.5rem]">Workflows</th>
          <th class="data-head min-w-[5.5rem]">Failures</th>
          <th class="data-head min-w-[8.5rem]">Action</th>
        </tr>
      </thead>
      <tbody>
        ${systems
          .map((system) => {
            const reachability = deriveReachability(system);
            const entryUrl = deriveSystemUrl(system);
            const failures = systemFailures(system);
            const isSelected =
              Boolean(system.hospital_system_id) && system.hospital_system_id === state.selectedSystemId;
            const rowClass = [
              'data-row',
              system.hospital_system_id ? 'data-row-selectable' : '',
              isSelected ? 'data-row-selected' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return `
              <tr class="${rowClass}" ${system.hospital_system_id ? `data-system-id="${escapeHtml(system.hospital_system_id)}"` : ''}>
                <td class="data-cell">
                  <div class="system-name">${escapeHtml(system.system_name)}</div>
                  ${
                    entryUrl
                      ? `<a class="system-subtext-link" href="${escapeHtml(entryUrl)}" target="_blank" rel="noreferrer">${escapeHtml(system.domain || entryUrl)}</a>`
                      : `<div class="system-subtext">${escapeHtml(system.domain || 'No canonical domain')}</div>`
                  }
                </td>
                <td class="data-cell">
                  <span class="${statusPillClass(reachability.tone)}">${escapeHtml(reachability.label)}</span>
                </td>
                <td class="data-cell text-center">
                  ${
                    system.hospital_system_id
                      ? renderIconAction(
                          'open-system-results',
                          `Open PDFs for ${system.system_name}`,
                          `data-system-id="${escapeHtml(system.hospital_system_id)}"`,
                        )
                      : '<span class="system-subtext">Unavailable</span>'
                  }
                </td>
                <td class="data-cell">${formatNumber(system.stats?.pdf_source_documents || 0)}</td>
                <td class="data-cell">${formatNumber(system.stats?.source_documents || 0)}</td>
                <td class="data-cell">${formatNumber(system.stats?.workflows || 0)}</td>
                <td class="data-cell">${formatNumber(failures)}</td>
                <td class="data-cell">
                  ${
                    system.hospital_system_id
                      ? `<button type="button" class="ghost-button" data-action="use-in-pipeline" data-system-id="${escapeHtml(system.hospital_system_id)}">Pipeline</button>`
                      : '<span class="system-subtext">Unavailable</span>'
                  }
                </td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>
  `;
}

function renderPriorityBuckets() {
  if (!elements.priorityBuckets) {
    return;
  }

  if (!state.reviewQueue) {
    elements.priorityBuckets.innerHTML = '<div class="empty-state">State review buckets will load here.</div>';
    return;
  }

  const buckets = state.reviewQueue.buckets || {};
  const priorityKeys = ['parse_failures', 'zero_pdf_systems', 'low_confidence_question_drafts'];

  elements.priorityBuckets.innerHTML = priorityKeys
    .map((bucketKey) => {
      const rows = Array.isArray(buckets[bucketKey]) ? buckets[bucketKey] : [];
      const sample = rows[0] || null;

      return `
        <article class="bucket-card">
          <div class="bucket-header">
            <h3 class="bucket-title">${escapeHtml(REVIEW_BUCKET_LABELS[bucketKey] || bucketKey)}</h3>
            <span class="status-pill ${rows.length > 0 ? 'status-red' : 'status-green'}">${formatNumber(rows.length)}</span>
          </div>
          <p class="bucket-copy">
            ${
              sample
                ? `${escapeHtml(sample.system_name || 'System')} ${sample.source_url ? 'is currently represented here.' : 'needs review in this bucket.'}`
                : 'Nothing is currently queued in this bucket.'
            }
          </p>
          ${
            sample?.hospital_system_id
              ? `<button type="button" class="bucket-action" data-action="use-in-pipeline" data-system-id="${escapeHtml(sample.hospital_system_id)}">Use Sample System</button>`
              : ''
          }
        </article>
      `;
    })
    .join('');
}

function renderPipelineSystemSelect() {
  if (!state.systems.length) {
    elements.pipelineSystemSelect.innerHTML = '<option value="">No systems available</option>';
    elements.runPipeline.disabled = true;
    return;
  }

  elements.pipelineSystemSelect.innerHTML = state.systems
    .map(
      (system) => `
        <option value="${escapeHtml(system.hospital_system_id || '')}">
          ${escapeHtml(system.system_name)}
        </option>
      `,
    )
    .join('');

  elements.pipelineSystemSelect.value = state.selectedSystemId || state.systems[0].hospital_system_id || '';
  elements.runPipeline.disabled = !elements.pipelineSystemSelect.value;
}

function renderPipelineInsights() {
  const system = currentSystem();
  if (!system) {
    elements.pipelineInsights.innerHTML =
      '<div class="empty-state">Choose a system to keep pipeline context in view.</div>';
    return;
  }

  const reachability = deriveReachability(system);
  const pdfDocuments = Array.isArray(state.selectedSystemDetail?.source_documents)
    ? state.selectedSystemDetail.source_documents.filter((document) => document.source_type === 'pdf')
    : [];

  elements.pipelineInsights.innerHTML = `
    <article class="focus-card">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="focus-label">Selected system</div>
          <div class="focus-value">${escapeHtml(system.system_name)}</div>
        </div>
        <span class="${statusPillClass(reachability.tone)}">${escapeHtml(reachability.label)}</span>
      </div>
      <div class="focus-copy">${escapeHtml(system.domain || 'No canonical domain')}</div>
    </article>
    <article class="focus-card">
      <div class="focus-label">Pipeline input</div>
      <div class="focus-copy">
        ${formatNumber(system.stats?.seed_urls || 0)} seed URLs •
        ${formatNumber(system.stats?.source_documents || 0)} cached docs
      </div>
    </article>
    <article class="focus-card">
      <div class="focus-label">Pipeline output</div>
      <div class="focus-copy">
        ${formatNumber(pdfDocuments.length)} PDF results •
        ${formatNumber(system.stats?.approved_templates || 0)} approved templates •
        ${formatNumber(system.stats?.draft_templates || 0)} drafts
      </div>
    </article>
    <article class="focus-card">
      <div class="focus-label">Next step</div>
      <div class="focus-copy">
        Run the pipeline, open Results, then click a PDF tile to inspect question mappings.
      </div>
    </article>
  `;
}

function renderPipelineResults() {
  const system = currentSystem();
  const pdfDocuments = Array.isArray(state.selectedSystemDetail?.source_documents)
    ? state.selectedSystemDetail.source_documents.filter((document) => document.source_type === 'pdf')
    : [];
  const latestTrackedRun = latestRunForSelectedSystem();
  const latestActivityAt =
    state.pipelineRunResult?.ranAt || latestTrackedRun?.created_at || system?.stats?.last_crawl_at || null;
  const latestActivityLabel = state.pipelineRunResult?.ranAt
    ? 'Latest Pipeline Run'
    : latestTrackedRun?.created_at
      ? 'Latest Tracked Run'
      : system?.stats?.last_crawl_at
        ? 'Latest Crawl Activity'
        : 'Latest Activity';
  const latestActivityNote = state.pipelineRunResult?.ranAt
    ? 'Most recent run from this dashboard session.'
    : latestTrackedRun?.created_at
      ? 'Most recent tracked run recorded for this system.'
      : system?.stats?.last_crawl_at
        ? 'Most recent crawl activity recorded for this system.'
        : 'No recorded activity is available for this system yet.';

  if (!system) {
    elements.pipelineResultsSummary.innerHTML =
      '<div class="empty-state">Choose a hospital system to inspect pipeline results.</div>';
    elements.pipelineResultsList.innerHTML = '';
    return;
  }

  elements.pipelineResultsSummary.innerHTML = `
    <article class="metric-card">
      <div class="metric-label">Selected System</div>
      <div class="metric-value">${escapeHtml(system.system_name)}</div>
      <p class="metric-note">Results are scoped to this hospital system inside the current state.</p>
    </article>
    <article class="metric-card">
      <div class="metric-label">PDF Results</div>
      <div class="metric-value">${formatNumber(pdfDocuments.length)}</div>
      <p class="metric-note">Cached PDF source documents currently attached to this system.</p>
    </article>
    <article class="metric-card">
      <div class="metric-label">${escapeHtml(latestActivityLabel)}</div>
      <div class="metric-value">${escapeHtml(latestActivityAt ? formatDateTime(latestActivityAt) : 'No record')}</div>
      <p class="metric-note">${escapeHtml(latestActivityNote)}</p>
    </article>
  `;

  if (pdfDocuments.length === 0) {
    elements.pipelineResultsList.innerHTML = `
      <div class="empty-state">
        No PDF results are attached to ${escapeHtml(system.system_name)} yet. Run the pipeline for this
        hospital system, or use a system that already has PDF output to inspect the resulting documents.
      </div>
    `;
    return;
  }

  elements.pipelineResultsList.innerHTML = pdfDocuments
    .map(
      (document) => {
        const displayName = sourceDocumentDisplayName(document);

        return `
        <article class="pdf-result-card">
          <button
            type="button"
            class="pdf-result-button"
            data-action="open-pdf-editor"
            data-source-document-id="${escapeHtml(document.id)}"
          >
            <div class="flex items-start gap-4">
              <div class="pdf-result-icon">PDF</div>
              <div>
                <h4 class="pdf-result-title">${escapeHtml(displayName)}</h4>
                <p class="pdf-result-copy">Open mapping editor</p>
              </div>
            </div>
            <span class="status-pill status-yellow">Inspect</span>
          </button>
          <div class="icon-link-row mt-3">
            ${renderIconLink(document.source_url, `Open source page for ${displayName}`)}
            ${document.source_url ? '<span class="system-subtext">Open source page</span>' : ''}
          </div>
          <div class="pdf-result-meta">
            <span class="${statusPillClass(document.pdf_parse_status === 'empty_text' || document.latest_question_extraction_status === 'failed' ? 'red' : 'green')}">
              ${escapeHtml(document.pdf_parse_status || 'parsed')}
            </span>
            <span class="status-pill status-yellow">${escapeHtml(document.import_mode || 'crawl')}</span>
            <span class="status-pill status-yellow">${formatDateTime(document.fetched_at)}</span>
          </div>
          <p class="pdf-result-copy">
            Question template status: ${escapeHtml(document.question_template_status || 'not reviewed')}.
            Published versions: ${formatNumber(document.published_versions || 0)}.
          </p>
          <div class="pdf-result-actions">
            <a class="link-button" href="${escapeHtml(document.content_url)}" target="_blank" rel="noreferrer">Open Cached PDF</a>
            <button type="button" class="ghost-button" data-action="open-pdf-editor" data-source-document-id="${escapeHtml(document.id)}">
              Open Mapping Editor
            </button>
            ${
              document.storage_path
                ? `<span class="system-subtext">${escapeHtml(document.storage_path)}</span>`
                : ''
            }
          </div>
        </article>
      `;
      },
    )
    .join('');
}

function buildQuestionMappings(review, payloadOverride = null) {
  const payload =
    payloadOverride || review?.draft?.payload || review?.latest_extraction_run?.payload || { supported: false, questions: [] };
  const pdfPages = Array.isArray(review?.pdf_geometry?.pages) ? review.pdf_geometry.pages : [];
  const widgetsByField = new Map();

  for (const page of pdfPages) {
    for (const widget of Array.isArray(page.widgets) ? page.widgets : []) {
      const key = String(widget.field_name || '').trim();
      if (!key) continue;
      if (!widgetsByField.has(key)) {
        widgetsByField.set(key, []);
      }
      widgetsByField.get(key).push({
        page_index: page.page_index,
        x: Number(widget.x || 0),
        y: Number(widget.y || 0),
        width: Math.max(Number(widget.width || 0), 12),
        height: Math.max(Number(widget.height || 0), 12),
        source: 'widget',
        label: widget.field_name,
      });
    }
  }

  function rectsForBinding(binding, contextLabel) {
    if (!binding || typeof binding !== 'object') return [];

    if (binding.type === 'field_text' || binding.type === 'field_checkbox' || binding.type === 'field_radio') {
      const fieldName = String(binding.field_name || '').trim();
      return (widgetsByField.get(fieldName) || []).map((rect) => ({
        ...rect,
        binding_type: binding.type,
        context_label: contextLabel,
      }));
    }

    if (binding.type === 'overlay_text') {
      const width = Math.max(Number(binding.max_width || 120), 36);
      const height = Math.max(Number(binding.font_size || 14) * 1.8, 18);
      return [
        {
          page_index: Number(binding.page_index || 0),
          x: Number(binding.x || 0),
          y: Number(binding.y || 0),
          width,
          height,
          source: 'overlay',
          binding_type: binding.type,
          context_label: contextLabel,
        },
      ];
    }

    if (binding.type === 'overlay_mark') {
      const size = Math.max(Number(binding.size || 14), 12);
      return [
        {
          page_index: Number(binding.page_index || 0),
          x: Number(binding.x || 0) - size / 2,
          y: Number(binding.y || 0) - size / 2,
          width: size,
          height: size,
          source: 'overlay',
          binding_type: binding.type,
          context_label: contextLabel,
        },
      ];
    }

    return [];
  }

  return (Array.isArray(payload.questions) ? payload.questions : []).map((question) => {
    const baseRects = (Array.isArray(question.bindings) ? question.bindings : []).flatMap((binding) =>
      rectsForBinding(binding, question.label),
    );
    const optionRects = (Array.isArray(question.options) ? question.options : []).flatMap((option) =>
      (Array.isArray(option.bindings) ? option.bindings : []).flatMap((binding) =>
        rectsForBinding(binding, `${question.label}: ${option.label}`),
      ),
    );
    const rects = [...baseRects, ...optionRects];
    const pages = Array.from(new Set(rects.map((rect) => rect.page_index))).sort((left, right) => left - right);

    return {
      id: question.id,
      label: question.label,
      kind: question.kind,
      help_text: question.help_text || null,
      rects,
      page_indexes: pages,
      option_count: Array.isArray(question.options) ? question.options.length : 0,
    };
  });
}

function buildManualOverlayPayload() {
  const currentPayload = currentPdfDraftPayload();
  const templateId =
    currentPayload?.template_id ||
    state.pdfEditorReview?.draft?.payload?.template_id ||
    state.pdfEditorReview?.latest_extraction_run?.payload?.template_id ||
    `manual-${state.pdfEditorReview?.source_document?.id || 'template'}`;

  return {
    supported: true,
    mode: 'overlay',
    template_id: templateId,
    confidence: 1,
    questions:
      currentPayload?.supported && currentPayload?.mode === 'overlay' && Array.isArray(currentPayload.questions)
        ? cloneJson(currentPayload.questions)
        : [],
  };
}

function refreshPdfEditorQuestionsFromDraft() {
  state.pdfEditorQuestions = buildQuestionMappings(state.pdfEditorReview, state.pdfEditorDraftPayload);
  if (!state.pdfEditorQuestions.find((question) => question.id === state.pdfEditorActiveQuestionId)) {
    state.pdfEditorActiveQuestionId = state.pdfEditorQuestions[0]?.id || null;
  }
}

function beginManualMapping() {
  const payload = currentPdfDraftPayload();
  if (payload?.supported && payload?.mode === 'acroform' && Array.isArray(payload.questions) && payload.questions.length) {
    throw new Error('This PDF already has an acroform draft. Manual rectangle mapping only supports overlay drafts.');
  }

  state.pdfEditorDraftPayload = buildManualOverlayPayload();
  state.pdfEditorDrawMode = false;
  state.pdfEditorPendingDraw = null;
  state.pdfEditorDraftDirty = true;
  state.pdfEditorSaveStatus = null;
  refreshPdfEditorQuestionsFromDraft();
  renderPdfEditor();
  updatePdfEditorOverlays();
}

function addManualTextQuestion(label) {
  const normalizedLabel = String(label || '').trim();
  if (!normalizedLabel) {
    throw new Error('Enter a question label before adding a manual question.');
  }

  if (!hasManualOverlayDraft()) {
    beginManualMapping();
  }

  const payload = currentPdfDraftPayload();
  const existingIds = new Set((payload.questions || []).map((question) => question.id));
  let baseId = slugifyId(normalizedLabel);
  let nextId = baseId;
  let suffix = 2;
  while (existingIds.has(nextId)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  payload.questions = Array.isArray(payload.questions) ? payload.questions : [];
  payload.questions.push({
    id: nextId,
    label: normalizedLabel,
    kind: 'short_text',
    required: false,
    help_text: null,
    confidence: 1,
    bindings: [],
    options: [],
  });
  state.pdfEditorActiveQuestionId = nextId;
  state.pdfEditorDraftDirty = true;
  state.pdfEditorSaveStatus = null;
  refreshPdfEditorQuestionsFromDraft();
  renderPdfEditor();
  updatePdfEditorOverlays();
}

function upsertManualBindingForActiveQuestion(renderedPage, rect) {
  const payload = currentPdfDraftPayload();
  if (!payload || !Array.isArray(payload.questions)) {
    throw new Error('Start manual mapping before drawing a rectangle.');
  }

  const question = payload.questions.find((entry) => entry.id === state.pdfEditorActiveQuestionId);
  if (!question) {
    throw new Error('Select a manual question before drawing a rectangle.');
  }

  if (question.kind !== 'short_text') {
    throw new Error('Manual rectangle mapping currently supports text questions only.');
  }

  const scaleX = renderedPage.viewport.width / Math.max(renderedPage.page_width || 1, 1);
  const scaleY = renderedPage.viewport.height / Math.max(renderedPage.page_height || 1, 1);
  const pdfX = rect.left / scaleX;
  const pdfWidth = rect.width / scaleX;
  const pdfHeight = rect.height / scaleY;
  const pdfY = renderedPage.page_height - rect.top / scaleY - pdfHeight;

  question.bindings = [
    {
      type: 'overlay_text',
      page_index: renderedPage.page_index,
      x: Number(pdfX.toFixed(2)),
      y: Number(pdfY.toFixed(2)),
      max_width: Number(Math.max(pdfWidth, 24).toFixed(2)),
      font_size: Number(Math.max(pdfHeight / 1.8, 12).toFixed(2)),
    },
  ];

  question.confidence = 1;
  payload.supported = true;
  payload.mode = 'overlay';
  payload.confidence = 1;
  state.pdfEditorDrawMode = false;
  state.pdfEditorPendingDraw = null;
  state.pdfEditorDraftDirty = true;
  state.pdfEditorSaveStatus = null;
  refreshPdfEditorQuestionsFromDraft();
  renderPdfEditorQuestions();
  updatePdfEditorOverlays();
}

async function ensurePdfJs() {
  if (state.pdfJsLib) {
    return state.pdfJsLib;
  }

  const module = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
  module.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  state.pdfJsLib = module;
  return module;
}

function renderPdfEditorQuestions() {
  if (!state.pdfEditorReview) {
    elements.pdfEditorQuestions.innerHTML =
      '<div class="empty-state">Open a PDF result to inspect its extracted questions.</div>';
    return;
  }

  if (!state.pdfEditorQuestions.length) {
    elements.pdfEditorQuestions.innerHTML =
      '<div class="empty-state">PDF geometry loaded, but no extracted questions or mapped rectangles are available for this PDF yet.</div>';
    return;
  }

  elements.pdfEditorQuestions.innerHTML = state.pdfEditorQuestions
    .map((question) => {
      const activeClass =
        question.id === state.pdfEditorActiveQuestionId
          ? 'question-card question-card-active'
          : 'question-card';

      return `
        <button type="button" class="${activeClass}" data-action="select-editor-question" data-question-id="${escapeHtml(question.id)}">
          <div class="question-title">${escapeHtml(question.label)}</div>
          <div class="question-copy">
            ${escapeHtml(question.kind)} • ${formatNumber(question.rects.length)} mapped rectangles •
            ${formatNumber(question.page_indexes.length)} pages
          </div>
          ${
            question.help_text
              ? `<div class="question-copy">${escapeHtml(question.help_text)}</div>`
              : ''
          }
        </button>
      `;
    })
    .join('');
}

async function renderPdfEditorPages() {
  if (!state.pdfEditorReview) {
    elements.pdfEditorPages.innerHTML = '<div class="empty-state">No PDF editor is open.</div>';
    return;
  }

  const review = state.pdfEditorReview;
  const pdfGeometry = review.pdf_geometry;
  if (!pdfGeometry?.pages?.length) {
    elements.pdfEditorPages.innerHTML =
      '<div class="empty-state">This PDF does not have page geometry available for overlay rendering.</div>';
    return;
  }

  const renderToken = ++state.pdfEditorRenderToken;
  elements.pdfEditorPages.innerHTML = '<div class="empty-state">Rendering PDF pages with overlays…</div>';

  const pdfjsLib = await ensurePdfJs();
  if (!state.pdfDocumentProxy || state.pdfDocumentProxy._sourceDocumentId !== review.source_document.id) {
    const loadingTask = pdfjsLib.getDocument(review.source_document.content_url);
    const proxy = await loadingTask.promise;
    proxy._sourceDocumentId = review.source_document.id;
    state.pdfDocumentProxy = proxy;
  }

  if (renderToken !== state.pdfEditorRenderToken) {
    return;
  }

  state.pdfEditorRenderedPages = [];
  elements.pdfEditorPages.innerHTML = '';

  for (const pageInfo of pdfGeometry.pages) {
    const page = await state.pdfDocumentProxy.getPage(pageInfo.page_index + 1);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const targetWidth = Math.min(960, Math.max(elements.pdfEditorPages.clientWidth - 48, 640));
    const scale = targetWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale });

    const card = document.createElement('article');
    card.className = 'pdf-page-card';
    card.innerHTML = `
      <div class="pdf-page-header">
        <div class="question-title">Page ${pageInfo.page_index + 1}</div>
        <div class="system-subtext">${Math.round(pageInfo.width)} × ${Math.round(pageInfo.height)} PDF units</div>
      </div>
      <div class="pdf-stage">
        <canvas class="pdf-canvas"></canvas>
        <svg class="pdf-overlay"></svg>
        <div class="overlay-empty-note hidden">No mapped rectangles yet</div>
      </div>
    `;

    elements.pdfEditorPages.appendChild(card);

    const canvas = card.querySelector('canvas');
    const overlay = card.querySelector('svg');
    const emptyNote = card.querySelector('.overlay-empty-note');
    const context = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    overlay.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
    overlay.dataset.pageIndex = String(pageInfo.page_index);

    await page.render({ canvasContext: context, viewport }).promise;

    state.pdfEditorRenderedPages.push({
      page_index: pageInfo.page_index,
      viewport,
      overlay,
      emptyNote,
      page_height: pageInfo.height,
      page_width: pageInfo.width,
      page_element: card,
    });
  }

  updatePdfEditorOverlays();
}

function updatePdfEditorOverlays() {
  const activeQuestion = currentPdfEditorQuestion();
  const questionsToShow = activeQuestion ? [activeQuestion] : state.pdfEditorQuestions;

  for (const renderedPage of state.pdfEditorRenderedPages) {
    const rects = questionsToShow.flatMap((question) =>
      question.rects
        .filter((rect) => rect.page_index === renderedPage.page_index)
        .map((rect) => ({ ...rect, active: question.id === activeQuestion?.id, question_label: question.label })),
    );

    renderedPage.overlay.innerHTML = rects
      .map((rect) => {
        const scaleX = renderedPage.viewport.width / Math.max(renderedPage.page_width || 1, 1);
        const scaleY = renderedPage.viewport.height / Math.max(renderedPage.page_height || 1, 1);
        const width = Math.max(rect.width * scaleX, 10);
        const height = Math.max(rect.height * scaleY, 10);
        const left = rect.x * scaleX;
        const top = (renderedPage.page_height - rect.y - rect.height) * scaleY;
        const labelY = Math.max(top - 6, 12);
        const safeLabel = escapeHtml(rect.context_label || rect.question_label || rect.binding_type || 'Question');

        return `
          <rect class="${rect.active ? 'overlay-rect overlay-rect-active' : 'overlay-rect'}" x="${left}" y="${top}" width="${width}" height="${height}" rx="6" ry="6"></rect>
          ${rect.active ? `<text class="overlay-label" x="${left + 4}" y="${labelY}">${safeLabel}</text>` : ''}
        `;
      })
      .join('');

    if (state.pdfEditorPendingDraw && state.pdfEditorPendingDraw.page_index === renderedPage.page_index) {
      const draft = state.pdfEditorPendingDraw;
      const left = Math.min(draft.start_x, draft.current_x);
      const top = Math.min(draft.start_y, draft.current_y);
      const width = Math.abs(draft.current_x - draft.start_x);
      const height = Math.abs(draft.current_y - draft.start_y);

      renderedPage.overlay.innerHTML += `
        <rect class="overlay-rect overlay-rect-active" x="${left}" y="${top}" width="${width}" height="${height}" rx="6" ry="6"></rect>
      `;
    }

    renderedPage.overlay.style.pointerEvents = state.pdfEditorDrawMode ? 'auto' : 'none';
    renderedPage.emptyNote?.classList.toggle('hidden', rects.length > 0);
  }
}

function renderedPageForOverlay(overlayElement) {
  return state.pdfEditorRenderedPages.find((page) => page.overlay === overlayElement) || null;
}

function overlayPoint(event, overlayElement) {
  const bounds = overlayElement.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
    y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)),
  };
}

async function savePdfEditorDraft({ publish = false } = {}) {
  if (!hasManualOverlayDraft()) {
    throw new Error('Start manual mapping before saving a draft.');
  }

  if (!state.pdfEditorReview?.source_document?.id) {
    throw new Error('Open a PDF before saving question mappings.');
  }

  const endpoint = publish ? 'publish' : 'draft';
  const response = await fetchJson(
    `/internal/source-documents/${encodeURIComponent(state.pdfEditorReview.source_document.id)}/question-review/${endpoint}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: state.pdfEditorDraftPayload,
      }),
    },
  );

  state.pdfEditorReview = response;
  state.pdfEditorDraftPayload = cloneJson(
    response?.draft?.payload || response?.published_version?.payload || state.pdfEditorDraftPayload,
  );
  state.pdfEditorDraftDirty = false;
  state.pdfEditorSaveStatus = {
    tone: 'success',
    message: publish ? 'Published manual question mappings.' : 'Saved manual question-mapping draft.',
  };
  refreshPdfEditorQuestionsFromDraft();
  renderPdfEditor();
  await renderPdfEditorPages();
}

async function openPdfEditor(sourceDocumentId) {
  state.pdfEditorReview = await fetchJson(
    `/internal/source-documents/${encodeURIComponent(sourceDocumentId)}/question-review`,
  );
  state.pdfEditorDraftPayload = cloneJson(
    state.pdfEditorReview?.draft?.payload ||
      state.pdfEditorReview?.latest_extraction_run?.payload || {
        supported: false,
        mode: null,
        template_id: `manual-${sourceDocumentId}`,
        confidence: null,
        questions: [],
      },
  );
  state.pdfEditorQuestions = buildQuestionMappings(state.pdfEditorReview, state.pdfEditorDraftPayload);
  state.pdfEditorActiveQuestionId = state.pdfEditorQuestions[0]?.id || null;
  state.pdfEditorDrawMode = false;
  state.pdfEditorPendingDraw = null;
  state.pdfEditorDraftDirty = false;
  state.pdfEditorSaveStatus = null;
  state.currentStateTab = 'pipeline';
  state.currentPipelineTab = 'results';
  scrollDashboardToTop();
  renderStateView();
  await renderPdfEditorPages();
}

function renderPdfEditor() {
  const review = state.pdfEditorReview;
  elements.pdfEditorPanel.classList.toggle('hidden', !review);

  if (!review) {
    elements.pdfEditorMetrics.innerHTML = '';
    elements.pdfEditorAuthoring.classList.add('hidden');
    elements.pdfEditorSaveStatus.classList.add('hidden');
    return;
  }

  const totalRects = state.pdfEditorQuestions.reduce((count, question) => count + question.rects.length, 0);
  const pageCount =
    Number(review.pdf_geometry?.page_count || 0) ||
    (Array.isArray(review.pdf_geometry?.pages) ? review.pdf_geometry.pages.length : 0);
  const parseStatus =
    review.source_document.pdf_parse_status || review.pdf_geometry?.parse_status || 'unknown';

  elements.pdfEditorTitle.textContent = review.source_document.title || 'PDF Editor';
  elements.pdfEditorCopy.textContent =
    totalRects > 0
      ? 'SVG rectangles show where the current question mappings land on the rendered PDF.'
      : 'PDF geometry loaded. No extracted question mappings are available for this PDF yet.';
  elements.openCachedPdf.href = review.source_document.content_url;
  const manualAvailable = canStartManualMapping();
  const activeQuestion = currentPdfEditorQuestion();
  elements.startManualMapping.disabled = !manualAvailable;
  elements.startManualMapping.textContent = hasManualOverlayDraft() ? 'Overlay Draft Ready' : 'Start Manual Mapping';
  elements.savePdfDraft.disabled = !hasManualOverlayDraft() || totalRects === 0;
  elements.publishPdfDraft.disabled = !hasManualOverlayDraft() || totalRects === 0;
  elements.mapSelectedQuestion.disabled = !hasManualOverlayDraft() || !activeQuestion;
  elements.mapSelectedQuestion.textContent = state.pdfEditorDrawMode ? 'Draw On PDF...' : 'Map Selected Question';
  elements.pdfEditorAuthoring.classList.toggle('hidden', !hasManualOverlayDraft());
  elements.pdfEditorSaveStatus.classList.toggle('hidden', !state.pdfEditorSaveStatus);
  elements.pdfEditorSaveStatus.textContent = state.pdfEditorSaveStatus?.message || '';
  elements.pdfEditorSaveStatus.className = `section-copy${state.pdfEditorSaveStatus ? '' : ' hidden'} ${
    state.pdfEditorSaveStatus?.tone === 'error' ? 'text-rose-600' : 'text-emerald-600'
  }`;
  elements.pdfEditorMetrics.innerHTML = `
    <article class="metric-card">
      <div class="metric-label">Pages</div>
      <div class="metric-value">${formatNumber(pageCount)}</div>
    </article>
    <article class="metric-card">
      <div class="metric-label">Questions</div>
      <div class="metric-value">${formatNumber(state.pdfEditorQuestions.length)}</div>
    </article>
    <article class="metric-card">
      <div class="metric-label">Mapped Rectangles</div>
      <div class="metric-value">${formatNumber(totalRects)}</div>
    </article>
    <article class="metric-card">
      <div class="metric-label">Parse Status</div>
      <div class="metric-value">${escapeHtml(parseStatus)}</div>
    </article>
  `;
  renderPdfEditorQuestions();
}

function renderPipelineRunResult() {
  if (!state.pipelineRunResult) {
    elements.pipelineRunResult.innerHTML = `
      <div class="empty-state">
        Pick a hospital system above, then run the pipeline here. The action targets only that
        selected hospital system inside the current state.
      </div>
    `;
    return;
  }

  const result = state.pipelineRunResult;
  elements.pipelineRunResult.innerHTML = `
    <div class="result-shell">
      <div class="result-header">
        <div>
          <p class="section-kicker">Latest Pipeline Run</p>
          <h4 class="result-title">${escapeHtml(result.systemName || 'Selected System')}</h4>
          <p class="result-copy">Ran at ${escapeHtml(formatDateTime(result.ranAt))} and targeted only this hospital system.</p>
          ${
            result.history_entry
              ? `<p class="result-copy">Saved to Run History with ${formatNumber(result.history_entry.change_summary?.changed_count || 0)} tracked metric changes.</p>`
              : ''
          }
        </div>
        <span class="${statusPillClass(result.failed > 0 ? 'red' : result.extracted > 0 ? 'green' : 'yellow')}">
          ${escapeHtml(result.status || 'completed')}
        </span>
      </div>
      <div class="result-grid">
        <article class="metric-card">
          <div class="metric-label">Crawled</div>
          <div class="metric-value">${formatNumber(result.crawled || 0)}</div>
        </article>
        <article class="metric-card">
          <div class="metric-label">Extracted</div>
          <div class="metric-value">${formatNumber(result.extracted || 0)}</div>
        </article>
        <article class="metric-card">
          <div class="metric-label">Failed</div>
          <div class="metric-value">${formatNumber(result.failed || 0)}</div>
        </article>
        <article class="metric-card">
          <div class="metric-label">Systems Targeted</div>
          <div class="metric-value">${formatNumber(result.systems || 0)}</div>
        </article>
      </div>
    </div>
  `;
}

function renderPipelineVisual() {
  const system = currentSystem();
  if (!system) {
    elements.pipelineVisual.innerHTML = '<div class="empty-state">Choose a hospital system to see its pipeline.</div>';
    return;
  }

  const reachability = deriveReachability(system);
  const failures = systemFailures(system);
  const stepCards = [
    {
      index: 'Step 1',
      title: 'Seed Inputs',
      copy: 'The selected hospital system starts with state seed JSON, domain metadata, and any approved seed URLs.',
      input: `${formatNumber(system.stats?.seed_urls || 0)} seed URLs and ${formatNumber(system.stats?.seed_facilities || 0)} seeded facilities.`,
      output: 'Queued target URLs for this hospital system only.',
    },
    {
      index: 'Step 2',
      title: 'Bot Fetch',
      copy: 'The crawler attempts to reach the selected system’s URLs and fetches HTML or PDFs when access works.',
      input: `${escapeHtml(reachability.label)} reachability using the current crawl path.`,
      output: `${formatNumber(system.stats?.source_documents || 0)} source documents cached so far.`,
    },
    {
      index: 'Step 3',
      title: 'Parse Documents',
      copy: 'HTML and PDF parsers extract text, metadata, and source artifacts needed for downstream workflow extraction.',
      input: `${formatNumber(system.stats?.html_source_documents || 0)} HTML docs and ${formatNumber(system.stats?.pdf_source_documents || 0)} PDF docs.`,
      output: `${formatNumber(system.stats?.parse_failures || 0)} parse failures currently tracked.`,
    },
    {
      index: 'Step 4',
      title: 'Normalize Workflow',
      copy: 'Workflow extraction turns parsed documents into records workflow rows, contacts, instructions, and linked forms.',
      input: `${formatNumber(system.stats?.source_documents || 0)} parsed source documents ready for extraction.`,
      output: `${formatNumber(system.stats?.workflows || 0)} workflow rows and ${formatNumber(system.stats?.partial_workflows || 0)} partial workflow results.`,
    },
    {
      index: 'Step 5',
      title: 'PDF Output',
      copy: 'PDF-backed forms move into review readiness, including drafts, approved templates, and final PDF output visibility.',
      input: `${formatNumber(system.stats?.pdf_source_documents || 0)} PDFs entering review and template generation.`,
      output: `${formatNumber(system.stats?.approved_templates || 0)} approved templates, ${formatNumber(system.stats?.draft_templates || 0)} drafts, ${formatNumber(failures)} open failure signals.`,
    },
  ];

  elements.pipelineVisual.innerHTML = stepCards
    .map(
      (step) => `
        <article class="step-card">
          <div class="step-index">${escapeHtml(step.index)}</div>
          <h4 class="step-title">${escapeHtml(step.title)}</h4>
          <p class="step-copy">${escapeHtml(step.copy)}</p>
          <div class="step-list">
            <div>
              <span class="step-item-label">Input</span>
              <div class="step-item-value">${escapeHtml(step.input)}</div>
            </div>
            <div>
              <span class="step-item-label">What Happens</span>
              <div class="step-item-value">${escapeHtml(step.copy)}</div>
            </div>
            <div>
              <span class="step-item-label">Output</span>
              <div class="step-item-value">${escapeHtml(step.output)}</div>
            </div>
          </div>
        </article>
      `,
    )
    .join('');
}

function populateRunHistorySystemSelect() {
  const selectedValue =
    state.runHistoryFilterSystemId && state.runHistoryFilterSystemId !== '__all__'
      ? state.runHistoryFilterSystemId
      : '__all__';
  const filterableSystems = state.systems.filter((system) => Boolean(system.hospital_system_id));

  elements.runHistorySystemSelect.innerHTML = [
    `<option value="__all__">All systems in ${escapeHtml(STATE_NAMES[state.currentState] || state.currentState || 'state')}</option>`,
    ...filterableSystems.map(
      (system) => `
        <option value="${escapeHtml(system.hospital_system_id || '')}">
          ${escapeHtml(system.system_name)}
        </option>
      `,
    ),
  ].join('');

  elements.runHistorySystemSelect.value = selectedValue;
}

async function loadRunHistory() {
  if (!state.currentState) {
    state.runHistory = null;
    return;
  }

  const filterSystemId =
    state.runHistoryFilterSystemId && state.runHistoryFilterSystemId !== '__all__'
      ? state.runHistoryFilterSystemId
      : null;
  const search = new URLSearchParams({
    state: state.currentState,
    limit: '30',
  });
  if (filterSystemId) {
    search.set('system_id', filterSystemId);
  }

  state.runHistory = await fetchJson(`/internal/pipeline-runs?${search.toString()}`);
}

function renderRunHistorySummary() {
  const runs = Array.isArray(state.runHistory?.runs) ? state.runHistory.runs : [];

  if (!runs.length) {
    elements.runHistorySummary.innerHTML = '<div class="empty-state md:col-span-4">No pipeline runs have been recorded for this scope yet.</div>';
    return;
  }

  const lastRun = runs[0];
  const positivePdfDelta = runs.reduce((total, run) => {
    const metric = run.change_summary?.metrics?.find((entry) => entry.key === 'pdf_source_documents');
    return total + Math.max(Number(metric?.delta || 0), 0);
  }, 0);
  const positiveWorkflowDelta = runs.reduce((total, run) => {
    const metric = run.change_summary?.metrics?.find((entry) => entry.key === 'workflows');
    return total + Math.max(Number(metric?.delta || 0), 0);
  }, 0);

  elements.runHistorySummary.innerHTML = `
    <article class="metric-card">
      <div class="metric-label">Runs</div>
      <div class="metric-value">${formatNumber(runs.length)}</div>
      <p class="metric-note">Recorded pipeline invocations in this scope.</p>
    </article>
    <article class="metric-card">
      <div class="metric-label">Last Run</div>
      <div class="metric-value">${escapeHtml(formatDateTime(lastRun.created_at))}</div>
      <p class="metric-note">${escapeHtml(lastRun.system_name || 'System')} most recently ran here.</p>
    </article>
    <article class="metric-card">
      <div class="metric-label">PDF Gains</div>
      <div class="metric-value">${formatNumber(positivePdfDelta)}</div>
      <p class="metric-note">Net new PDFs added across the runs shown.</p>
    </article>
    <article class="metric-card">
      <div class="metric-label">Workflow Gains</div>
      <div class="metric-value">${formatNumber(positiveWorkflowDelta)}</div>
      <p class="metric-note">Net new workflow rows added across the runs shown.</p>
    </article>
  `;
}

function renderRunHistoryInsights() {
  const system =
    state.systems.find((entry) => entry.hospital_system_id === state.runHistoryFilterSystemId) || null;
  const runs = Array.isArray(state.runHistory?.runs) ? state.runHistory.runs : [];

  elements.runHistoryInsights.innerHTML = `
    <article class="focus-card">
      <div class="focus-label">Scope</div>
      <div class="focus-value">${escapeHtml(
        state.runHistoryFilterSystemId && state.runHistoryFilterSystemId !== '__all__'
          ? system?.system_name || 'Selected system'
          : `${STATE_NAMES[state.currentState] || state.currentState} state`,
      )}</div>
      <div class="focus-copy">${formatNumber(runs.length)} recorded runs in the current filter.</div>
    </article>
    <article class="focus-card">
      <div class="focus-label">What Counts As Change</div>
      <div class="focus-copy">Each run stores before and after snapshots for PDFs, workflows, templates, and failure signals.</div>
    </article>
    <article class="focus-card">
      <div class="focus-label">Recorded Here</div>
      <div class="focus-copy">New PDFs, new workflows, template changes, and failure reductions after each targeted pipeline run.</div>
    </article>
  `;
}

function renderRunHistoryList() {
  const runs = Array.isArray(state.runHistory?.runs) ? state.runHistory.runs : [];

  if (!runs.length) {
    elements.runHistoryList.innerHTML = '<div class="empty-state">Run history will appear here after you execute the pipeline.</div>';
    return;
  }

  elements.runHistoryList.innerHTML = runs
    .map((run) => {
      const changedMetrics = Array.isArray(run.change_summary?.metrics) ? run.change_summary.metrics : [];
      const visibleMetrics = changedMetrics.slice(0, 6);

      return `
        <article class="history-card">
          <div class="history-header">
            <div>
              <h3 class="history-title">${escapeHtml(run.system_name || 'System Run')}</h3>
              <p class="history-copy">${escapeHtml(formatDateTime(run.created_at))}</p>
            </div>
            <span class="${statusPillClass(run.status === 'failed' ? 'red' : run.status === 'no_seeds' ? 'yellow' : 'green')}">
              ${escapeHtml(run.status || 'ok')}
            </span>
          </div>
          <div class="history-metrics">
            <article class="detail-item">
              <div class="detail-item-title">Crawled</div>
              <div class="detail-item-copy">${formatNumber(run.crawled || 0)}</div>
            </article>
            <article class="detail-item">
              <div class="detail-item-title">Extracted</div>
              <div class="detail-item-copy">${formatNumber(run.extracted || 0)}</div>
            </article>
            <article class="detail-item">
              <div class="detail-item-title">Failed</div>
              <div class="detail-item-copy">${formatNumber(run.failed || 0)}</div>
            </article>
            <article class="detail-item">
              <div class="detail-item-title">Improvements</div>
              <div class="detail-item-copy">${formatNumber(run.change_summary?.improved_count || 0)}</div>
            </article>
          </div>
          <div class="history-deltas">
            ${
              visibleMetrics.length
                ? visibleMetrics
                    .map(
                      (metric) => `
                        <span class="${deltaPillClass(metric)}">
                          ${escapeHtml(metric.label)} ${escapeHtml(formatSignedDelta(metric.delta))}
                        </span>
                      `,
                    )
                    .join('')
                : '<span class="delta-pill delta-pill-neutral">No tracked metric changes</span>'
            }
          </div>
        </article>
      `;
    })
    .join('');
}

function renderStateView() {
  if (!state.stateSummary) {
    elements.stateSummary.innerHTML = '<div class="empty-state">Open a state from the map to load this view.</div>';
    elements.systemsTable.innerHTML = '<div class="empty-state">Hospital systems appear here after a state is selected.</div>';
    elements.priorityBuckets.innerHTML = '';
    elements.pipelineVisual.innerHTML = '';
    elements.pipelineRunResult.innerHTML = '';
    elements.pipelineInsights.innerHTML = '';
    elements.pipelineResultsSummary.innerHTML = '';
    elements.pipelineResultsList.innerHTML = '';
    elements.runHistorySummary.innerHTML = '';
    elements.runHistoryList.innerHTML = '';
    elements.runHistoryInsights.innerHTML = '';
    elements.pdfEditorMetrics.innerHTML = '';
    elements.pdfEditorPanel.classList.add('hidden');
    updateDashboardChrome();
    return;
  }

  elements.stateSelect.value = state.currentState;
  renderStateSummary();
  renderSystemsTable();
  renderPriorityBuckets();
  renderPipelineSystemSelect();
  renderPipelineRunResult();
  renderPipelineVisual();
  renderPipelineInsights();
  renderPipelineResults();
  populateRunHistorySystemSelect();
  renderRunHistorySummary();
  renderRunHistoryList();
  renderRunHistoryInsights();
  renderPdfEditor();
  const showingPdfEditor = Boolean(state.pdfEditorReview);
  elements.systemsPanel.classList.toggle('hidden', state.currentStateTab !== 'systems' || showingPdfEditor);
  elements.pipelinePanel.classList.toggle('hidden', state.currentStateTab !== 'pipeline' || showingPdfEditor);
  elements.runHistoryPanel.classList.toggle('hidden', state.currentStateTab !== 'history' || showingPdfEditor);
  elements.pdfEditorPanel.classList.toggle('hidden', !showingPdfEditor);
  updateDashboardChrome();
}

async function loadNationalOverview(forceRefresh = false) {
  const query = forceRefresh ? '?force=true' : '';
  state.nationalOverview = await fetchJson(`/internal/states/overview${query}`);
  renderHomeOverviewCards();
  renderHomeStatePreview();
  renderHomeAttentionList();
  renderSidebarStateSummary();
  await renderMap();
}

async function loadStateView(stateCode, options = {}) {
  const normalizedState = String(stateCode || '').toUpperCase();
  if (!normalizedState) return;

  state.currentState = normalizedState;
  state.homePreviewState = normalizedState;
  state.pipelineRunResult = options.keepPipelineResult ? state.pipelineRunResult : null;
  if (!options.keepPdfEditor) {
    resetPdfEditorState();
  }
  populateStateSelect();
  showStateView();

  const [summary, reviewQueue] = await Promise.all([
    fetchJson(`/internal/states/${encodeURIComponent(normalizedState)}/summary`),
    fetchJson(`/internal/states/${encodeURIComponent(normalizedState)}/review-queue`),
  ]);

  state.stateSummary = summary;
  state.systems = Array.isArray(summary.systems) ? summary.systems : [];
  state.reviewQueue = reviewQueue;

  const preservedSystem =
    options.preserveSelectedSystem && state.selectedSystemId
      ? state.systems.find((system) => system.hospital_system_id === state.selectedSystemId)
      : null;
  state.selectedSystemId = preservedSystem?.hospital_system_id || defaultSystemId();
  if (
    !state.runHistoryFilterSystemId ||
    (state.runHistoryFilterSystemId !== '__all__' &&
      !state.systems.find((system) => system.hospital_system_id === state.runHistoryFilterSystemId))
  ) {
    state.runHistoryFilterSystemId = state.selectedSystemId || '__all__';
  }
  await loadSelectedSystemDetail();
  await loadRunHistory();

  syncOverviewForCurrentState();
  renderHomeOverviewCards();
  renderHomeStatePreview();
  updateMapHighlight();
  renderStateView();
  setStateTab(options.stateTab || state.currentStateTab || 'systems');
  if (options.pipelineTab) {
    setPipelineTab(options.pipelineTab);
  }
}

async function runPipelineForSelectedSystem() {
  const system = currentSystem();
  if (!system?.hospital_system_id) {
    throw new Error('Pick a hospital system before running the pipeline.');
  }

  const result = await fetchJson('/internal/crawl/system', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: state.currentState,
      system_id: system.hospital_system_id,
    }),
  });

  state.pipelineRunResult = {
    ...result,
    systemName: system.system_name,
    ranAt: new Date().toISOString(),
  };

  await loadStateView(state.currentState, {
    preserveSelectedSystem: true,
    keepPipelineResult: true,
    stateTab: 'pipeline',
    pipelineTab: 'results',
  });
}

async function loadSelectedSystemDetail() {
  if (!state.selectedSystemId) {
    state.selectedSystemDetail = null;
    return;
  }

  state.selectedSystemDetail = await fetchJson(
    `/internal/hospital-systems/${encodeURIComponent(state.selectedSystemId)}`,
  );
}

async function selectSystem(systemId) {
  const previousSystemId = state.selectedSystemId;
  state.selectedSystemId = systemId || null;
  elements.runPipeline.disabled = !state.selectedSystemId;
  resetPdfEditorState();

  if (!state.runHistoryFilterSystemId || state.runHistoryFilterSystemId === previousSystemId) {
    state.runHistoryFilterSystemId = state.selectedSystemId || '__all__';
  }

  await loadSelectedSystemDetail();
  await loadRunHistory();
  renderSystemsTable();
  renderPriorityBuckets();
  renderPipelineSystemSelect();
  renderPipelineVisual();
  renderPipelineInsights();
  renderPipelineResults();
  populateRunHistorySystemSelect();
  renderRunHistorySummary();
  renderRunHistoryList();
  renderRunHistoryInsights();
  renderPdfEditor();
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  try {
    if (button === elements.sidebarToggle) {
      toggleSidebar();
      return;
    }

    if (button === elements.homeNav) {
      showHomeView();
      return;
    }

    if (button === elements.stateNav) {
      if (state.currentState) {
        showStateView();
      }
      return;
    }

    if (button === elements.sidebarSystemsNav) {
      if (!state.currentState) return;
      showStateView();
      setStateTab('systems');
      return;
    }

    if (button === elements.sidebarPipelineNav) {
      if (!state.currentState) return;
      showStateView();
      setStateTab('pipeline');
      setPipelineTab('flow');
      return;
    }

    if (button === elements.sidebarResultsNav) {
      if (!state.currentState) return;
      showStateView();
      setStateTab('pipeline');
      setPipelineTab('results');
      return;
    }

    if (button === elements.sidebarHistoryNav) {
      if (!state.currentState) return;
      showStateView();
      setStateTab('history');
      return;
    }

    if (button === elements.sidebarEditorNav) {
      if (!state.pdfEditorReview) return;
      showStateView();
      renderStateView();
      return;
    }

    if (button === elements.refreshMap) {
      await loadNationalOverview(true);
      return;
    }

    if (button === elements.backHome) {
      resetPdfEditorState();
      showHomeView();
      return;
    }

    if (button === elements.backToResults) {
      resetPdfEditorState();
      renderStateView();
      setStateTab('pipeline');
      setPipelineTab('results');
      return;
    }

    if (button === elements.startManualMapping) {
      beginManualMapping();
      return;
    }

    if (button === elements.addManualQuestion) {
      addManualTextQuestion(elements.manualQuestionLabel.value);
      elements.manualQuestionLabel.value = '';
      return;
    }

    if (button === elements.mapSelectedQuestion) {
      if (!hasManualOverlayDraft()) {
        throw new Error('Start manual mapping first.');
      }

      if (!currentPdfEditorQuestion()) {
        throw new Error('Select a question before drawing on the PDF.');
      }

      state.pdfEditorDrawMode = !state.pdfEditorDrawMode;
      state.pdfEditorPendingDraw = null;
      state.pdfEditorSaveStatus = null;
      renderPdfEditor();
      updatePdfEditorOverlays();
      return;
    }

    if (button === elements.savePdfDraft) {
      await savePdfEditorDraft({ publish: false });
      return;
    }

    if (button === elements.publishPdfDraft) {
      await savePdfEditorDraft({ publish: true });
      return;
    }

    if (button === elements.refreshState) {
      if (!state.currentState) return;
      await loadStateView(state.currentState, {
        preserveSelectedSystem: true,
        keepPipelineResult: true,
        stateTab: state.currentStateTab,
      });
      return;
    }

    if (button === elements.refreshRunHistory) {
      await loadRunHistory();
      renderRunHistorySummary();
      renderRunHistoryList();
      renderRunHistoryInsights();
      return;
    }

    if (button === elements.systemsTab) {
      setStateTab('systems');
      return;
    }

    if (button === elements.pipelineTab) {
      setStateTab('pipeline');
      return;
    }

    if (button === elements.historyTab) {
      setStateTab('history');
      return;
    }

    if (button === elements.pipelineFlowTab) {
      setPipelineTab('flow');
      return;
    }

    if (button === elements.pipelineResultsTab) {
      setPipelineTab('results');
      return;
    }

    if (button === elements.runPipeline) {
      await runPipelineForSelectedSystem();
      return;
    }

    if (button.dataset.action === 'open-state' && button.dataset.state) {
      await loadStateView(button.dataset.state);
      return;
    }

    if (button.dataset.action === 'use-in-pipeline' && button.dataset.systemId) {
      await selectSystem(button.dataset.systemId);
      setStateTab('pipeline');
      setPipelineTab('flow');
      return;
    }

    if (button.dataset.action === 'open-system-results' && button.dataset.systemId) {
      await selectSystem(button.dataset.systemId);
      setStateTab('pipeline');
      setPipelineTab('results');
      return;
    }

    if (button.dataset.action === 'open-pdf-editor' && button.dataset.sourceDocumentId) {
      await openPdfEditor(button.dataset.sourceDocumentId);
      return;
    }

    if (button.dataset.action === 'select-editor-question' && button.dataset.questionId) {
      state.pdfEditorActiveQuestionId = button.dataset.questionId;
      renderPdfEditorQuestions();
      updatePdfEditorOverlays();
      const activeQuestion = currentPdfEditorQuestion();
      const firstPage = activeQuestion?.page_indexes?.[0];
      const firstRenderedPage = state.pdfEditorRenderedPages.find(
        (page) => page.page_index === firstPage,
      );
      firstRenderedPage?.page_element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  } catch (error) {
    notify(error.message || 'Request failed.', true);
  }
});

elements.sidebarBackdrop?.addEventListener('click', () => {
  closeSidebarIfMobile();
});

elements.stateSelect.addEventListener('change', async () => {
  try {
    await loadStateView(elements.stateSelect.value);
  } catch (error) {
    notify(error.message || 'Failed to load the selected state.', true);
  }
});

elements.systemFilter.addEventListener('input', () => {
  state.systemFilter = elements.systemFilter.value || '';
  renderSystemsTable();
});

elements.systemsTable?.addEventListener('click', (event) => {
  const interactiveTarget = event.target.closest('button, a, input, select, textarea');
  if (interactiveTarget) return;

  const row = event.target.closest('tr[data-system-id]');
  if (!row?.dataset.systemId) return;

  Promise.resolve()
    .then(async () => {
      await selectSystem(row.dataset.systemId);
      setStateTab('pipeline');
      setPipelineTab('flow');
    })
    .catch((error) => {
      notify(error.message || 'Failed to select the hospital system.', true);
    });
});

elements.pipelineSystemSelect.addEventListener('change', () => {
  Promise.resolve()
    .then(async () => selectSystem(elements.pipelineSystemSelect.value || null))
    .catch((error) => {
      notify(error.message || 'Failed to load system results.', true);
    });
});

elements.runHistorySystemSelect.addEventListener('change', () => {
  Promise.resolve()
    .then(async () => {
      state.runHistoryFilterSystemId = elements.runHistorySystemSelect.value || '__all__';
      await loadRunHistory();
      renderRunHistorySummary();
      renderRunHistoryList();
      renderRunHistoryInsights();
    })
    .catch((error) => {
      notify(error.message || 'Failed to load run history.', true);
    });
});

elements.manualQuestionLabel.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  Promise.resolve()
    .then(() => addManualTextQuestion(elements.manualQuestionLabel.value))
    .then(() => {
      elements.manualQuestionLabel.value = '';
    })
    .catch((error) => {
      notify(error.message || 'Failed to add a manual question.', true);
    });
});

elements.pdfEditorPages.addEventListener('pointerdown', (event) => {
  if (!state.pdfEditorDrawMode) return;
  const overlay = event.target.closest('.pdf-overlay');
  if (!overlay) return;
  const renderedPage = renderedPageForOverlay(overlay);
  if (!renderedPage) return;
  const point = overlayPoint(event, overlay);
  state.pdfEditorPendingDraw = {
    page_index: renderedPage.page_index,
    start_x: point.x,
    start_y: point.y,
    current_x: point.x,
    current_y: point.y,
  };
  overlay.setPointerCapture?.(event.pointerId);
  updatePdfEditorOverlays();
});

elements.pdfEditorPages.addEventListener('pointermove', (event) => {
  if (!state.pdfEditorDrawMode || !state.pdfEditorPendingDraw) return;
  const overlay = event.target.closest('.pdf-overlay');
  if (!overlay) return;
  const point = overlayPoint(event, overlay);
  state.pdfEditorPendingDraw.current_x = point.x;
  state.pdfEditorPendingDraw.current_y = point.y;
  updatePdfEditorOverlays();
});

elements.pdfEditorPages.addEventListener('pointerup', (event) => {
  if (!state.pdfEditorDrawMode || !state.pdfEditorPendingDraw) return;
  const overlay = event.target.closest('.pdf-overlay');
  if (!overlay) return;
  const renderedPage = renderedPageForOverlay(overlay);
  if (!renderedPage) return;

  const point = overlayPoint(event, overlay);
  state.pdfEditorPendingDraw.current_x = point.x;
  state.pdfEditorPendingDraw.current_y = point.y;

  const left = Math.min(state.pdfEditorPendingDraw.start_x, state.pdfEditorPendingDraw.current_x);
  const top = Math.min(state.pdfEditorPendingDraw.start_y, state.pdfEditorPendingDraw.current_y);
  const width = Math.abs(state.pdfEditorPendingDraw.current_x - state.pdfEditorPendingDraw.start_x);
  const height = Math.abs(state.pdfEditorPendingDraw.current_y - state.pdfEditorPendingDraw.start_y);

  if (width < 8 || height < 8) {
    state.pdfEditorPendingDraw = null;
    state.pdfEditorDrawMode = false;
    renderPdfEditor();
    updatePdfEditorOverlays();
    return;
  }

  try {
    upsertManualBindingForActiveQuestion(renderedPage, {
      left,
      top,
      width,
      height,
    });
    renderPdfEditor();
  } catch (error) {
    notify(error.message || 'Failed to map the selected question.', true);
  }
});

window.addEventListener('resize', () => {
  syncSidebarFrame();
  if (!state.nationalOverview) return;
  renderMap().catch((error) => {
    notify(error.message || 'Failed to redraw the state map.', true);
  });
  if (state.pdfEditorReview) {
    renderPdfEditorPages().catch((error) => {
      notify(error.message || 'Failed to redraw the PDF editor.', true);
    });
  }
});

DESKTOP_SIDEBAR_MEDIA_QUERY.addEventListener?.('change', () => {
  syncSidebarFrame();
});

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeSidebarIfMobile();
});

populateStateSelect();
syncSidebarFrame();
setNavState();
setStateTab('systems');
renderStateView();

loadNationalOverview().catch((error) => {
  notify(error.message || 'Failed to load the dashboard home map.', true);
});
