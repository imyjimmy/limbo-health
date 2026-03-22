import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

class FakeClassList {
  private tokens = new Set<string>();
  private owner: FakeElement;

  constructor(owner: FakeElement) {
    this.owner = owner;
  }

  syncFromString(value: string) {
    this.tokens = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  private syncOwner() {
    this.owner._className = Array.from(this.tokens).join(' ');
  }

  add(...tokens: string[]) {
    for (const token of tokens) {
      if (token) this.tokens.add(token);
    }
    this.syncOwner();
  }

  remove(...tokens: string[]) {
    for (const token of tokens) {
      this.tokens.delete(token);
    }
    this.syncOwner();
  }

  toggle(token: string, force?: boolean) {
    if (force === true) {
      this.tokens.add(token);
      this.syncOwner();
      return true;
    }
    if (force === false) {
      this.tokens.delete(token);
      this.syncOwner();
      return false;
    }
    if (this.tokens.has(token)) {
      this.tokens.delete(token);
      this.syncOwner();
      return false;
    }
    this.tokens.add(token);
    this.syncOwner();
    return true;
  }

  contains(token: string) {
    return this.tokens.has(token);
  }
}

class FakeElement {
  selector: string;
  innerHTML = '';
  textContent = '';
  value = '';
  disabled = false;
  checked = false;
  files: unknown[] | null = null;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  clientWidth = 960;
  clientHeight = 720;
  _className = '';
  classList: FakeClassList;
  listeners = new Map<string, Array<(...args: unknown[]) => unknown>>();

  constructor(selector: string) {
    this.selector = selector;
    this.classList = new FakeClassList(this);
  }

  get className() {
    return this._className;
  }

  set className(value: string) {
    this._className = String(value || '');
    this.classList.syncFromString(this._className);
  }

  addEventListener(type: string, handler: (...args: unknown[]) => unknown) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type: string, handler: (...args: unknown[]) => unknown) {
    const handlers = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      handlers.filter((entry) => entry !== handler),
    );
  }

  dispatchEvent(event: { type: string }) {
    const handlers = this.listeners.get(event.type) || [];
    for (const handler of handlers) {
      handler.call(this, event);
    }
    return true;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  closest() {
    return null;
  }

  appendChild(child: unknown) {
    return child;
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = String(value);
  }

  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string) {
    delete this.attributes[name];
  }

  focus() {}

  select() {}

  click() {}

  scrollTo() {}

  scrollIntoView() {}

  setPointerCapture() {}

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
}

function createConsoleHarness() {
  const elementMap = new Map<string, FakeElement>();
  const getElement = (selector: string) => {
    if (!elementMap.has(selector)) {
      elementMap.set(selector, new FakeElement(selector));
    }
    return elementMap.get(selector) as FakeElement;
  };

  const document = {
    querySelector: (selector: string) => getElement(selector),
    createElement: (tagName: string) => new FakeElement(tagName),
    addEventListener: () => {},
    body: new FakeElement('body'),
  };

  const windowObject = {
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (callback: () => void) => {
      callback();
      return 1;
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
    alert: () => {},
    scrollTo: () => {},
  };

  const fetch = vi.fn(async () => {
    throw new Error('fetch disabled in console unit tests');
  });

  const sandbox: Record<string, unknown> = {
    console,
    document,
    window: windowObject,
    fetch,
    CSS: {
      escape: (value: unknown) => String(value ?? ''),
    },
    d3: {},
    topojson: {},
    URLSearchParams,
    FileReader: class {
      result = '';
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;

      readAsDataURL(file: { base64?: string }) {
        this.result = `data:application/pdf;base64,${file?.base64 || 'TEST'}`;
        this.onload?.();
      }
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;
  sandbox.self = sandbox.window;

  const consolePath = path.resolve(
    '/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/src/internal-console/console.js',
  );
  const source =
    fs.readFileSync(consolePath, 'utf8') +
    `
globalThis.__consoleTest = {
  state,
  elements,
  runHistorySummaryScopeRuns,
  deriveRunHistorySummaryMetrics,
  manualPdfUploadNotesForSourceView,
  renderRunHistorySummary,
  renderSystemActionButtonGroup,
  promptManualPdfUploadForSystem
};
`;

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: consolePath });

  return {
    api: sandbox.__consoleTest as {
      state: Record<string, unknown>;
      elements: Record<string, FakeElement>;
      runHistorySummaryScopeRuns: (runs: unknown[]) => unknown[];
      deriveRunHistorySummaryMetrics: (runs: unknown[]) => Record<string, unknown>;
      manualPdfUploadNotesForSourceView: (sourceView?: string) => string;
      renderRunHistorySummary: () => void;
      renderSystemActionButtonGroup: (system: Record<string, unknown>) => string;
      promptManualPdfUploadForSystem: (options: Record<string, unknown>) => void;
    },
    fetch,
    getElement,
  };
}

describe('internal console helpers', () => {
  it('summarizes visible full-pipeline runs for PDFs and question outputs', () => {
    const { api } = createConsoleHarness();

    const runs = [
      {
        status: 'ok',
        extracted: 2,
        change_summary: {
          metrics: [
            { key: 'pdf_source_documents', delta: 3 },
            { key: 'workflows', delta: 4 },
          ],
        },
        crawl_summary: {
          stage_label: 'Full Pipeline',
          question_stage: { stage_status: 'ok' },
        },
      },
      {
        status: 'no_pdfs',
        extracted: 0,
        change_summary: {
          metrics: [
            { key: 'pdf_source_documents', delta: 1 },
            { key: 'workflows', delta: 2 },
          ],
        },
        crawl_summary: {
          stage_label: 'Full Pipeline',
          question_stage: { stage_status: 'no_pdfs' },
        },
      },
      {
        status: 'ok',
        extracted: 9,
        change_summary: {
          metrics: [
            { key: 'pdf_source_documents', delta: 7 },
            { key: 'workflows', delta: 8 },
          ],
        },
        crawl_summary: {
          stage_label: 'Seed Scope Stage',
        },
      },
    ];

    const metrics = api.deriveRunHistorySummaryMetrics(runs);

    expect(metrics.summaryRuns).toHaveLength(2);
    expect(metrics.positivePdfDelta).toBe(4);
    expect(metrics.positiveWorkflowDelta).toBe(6);
    expect(metrics.questionOutputs).toBe(2);
    expect(metrics.systemsWithQuestionOutput).toBe(1);
    expect(metrics.noPdfOutcomes).toBe(1);
    expect(metrics.scopeLabel).toBe('2 full-pipeline runs shown');
  });

  it('renders question-output cards in run history summary', () => {
    const { api } = createConsoleHarness();

    api.state.runHistory = {
      runs: [
        {
          created_at: '2026-03-22T02:12:46.206Z',
          system_name: 'Wentworth-Douglass Hospital',
          status: 'no_pdfs',
          extracted: 0,
          change_summary: { metrics: [] },
          crawl_summary: {
            stage_label: 'Full Pipeline',
            question_stage: { stage_status: 'no_pdfs' },
          },
        },
        {
          created_at: '2026-03-22T02:12:38.012Z',
          system_name: 'St. Joseph Hospital',
          status: 'ok',
          extracted: 1,
          change_summary: {
            metrics: [
              { key: 'pdf_source_documents', delta: 2 },
              { key: 'workflows', delta: 1 },
            ],
          },
          crawl_summary: {
            stage_label: 'Full Pipeline',
            question_stage: { stage_status: 'ok' },
          },
        },
      ],
    };

    api.renderRunHistorySummary();

    expect(api.elements.runHistorySummary.innerHTML).toContain('Question Outputs');
    expect(api.elements.runHistorySummary.innerHTML).toContain('Systems With Questions');
    expect(api.elements.runHistorySummary.innerHTML).toContain('No PDF Outcomes');
    expect(api.elements.runHistorySummary.innerHTML).toContain('2 visible runs shown');
  });

  it('keeps Upload PDF hidden behind the Systems action chevron until expanded', () => {
    const { api } = createConsoleHarness();
    const system = {
      hospital_system_id: 'system-1',
      system_name: 'Concord Hospital',
      state: 'NH',
    };

    api.state.systemActionMenuKey = null;
    const closedMarkup = api.renderSystemActionButtonGroup(system);
    expect(closedMarkup).toContain('Pipeline');
    expect(closedMarkup).not.toContain('Upload PDF');

    api.state.systemActionMenuKey = 'system-1';
    const openMarkup = api.renderSystemActionButtonGroup(system);
    expect(openMarkup).toContain('Upload PDF');
  });

  it('tracks whether a manual PDF upload started from Pipeline or Systems', () => {
    const { api } = createConsoleHarness();

    api.state.currentState = 'NH';
    api.state.systems = [
      {
        hospital_system_id: 'system-1',
        system_name: 'Concord Hospital',
        state: 'NH',
      },
    ];

    api.promptManualPdfUploadForSystem({
      systemId: 'system-1',
      sourceView: 'pipeline',
    });
    expect(api.state.systemPdfUploadTarget).toMatchObject({
      systemId: 'system-1',
      sourceView: 'pipeline',
    });
    expect(api.manualPdfUploadNotesForSourceView('pipeline')).toBe('Uploaded from Pipeline view');
    expect(api.manualPdfUploadNotesForSourceView('systems')).toBe('Uploaded from Systems view');
  });
});
