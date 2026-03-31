import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { launchPersistentContext } from 'cloakbrowser';
import {
  buildPublicWizardSession,
  buildWizardInteractionId,
  cleanWizardText,
  normalizeSupportedWizardLaunchUrl,
  stripDecorativeWizardText,
} from './wizardSessionUtils.js';

const SESSION_TTL_MS = 15 * 60 * 1000;
const FRAME_URL_HINT = 'healthrecordwizard.com/wizard.html';
const FRAME_WAIT_TIMEOUT_MS = 30 * 1000;
const SNAPSHOT_WAIT_TIMEOUT_MS = 8 * 1000;
const SNAPSHOT_POLL_INTERVAL_MS = 250;
const DEFAULT_TIMEZONE = 'America/Chicago';
const DEFAULT_LOCALE = 'en-US';

const sessions = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sessionNotFoundError() {
  const error = new Error('Wizard session not found.');
  error.statusCode = 404;
  return error;
}

function invalidWizardResponseError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw sessionNotFoundError();
  }

  return session;
}

function getSnapshotSignature(snapshot) {
  if (!snapshot) return 'missing';

  return JSON.stringify({
    kind: snapshot.kind,
    slideName: snapshot.slideName,
    prompt: snapshot.prompt,
    options:
      snapshot.options?.map((option) => ({
        id: option.id,
        selected: Boolean(option.selected),
        disabled: Boolean(option.disabled),
      })) || [],
    actions:
      snapshot.actions?.map((action) => ({
        id: action.id,
        disabled: Boolean(action.disabled),
      })) || [],
    fields:
      snapshot.fields?.map((field) => ({
        id: field.id,
        value: field.value ?? '',
      })) || [],
    manualRequiredReason: snapshot.manualRequiredReason || null,
    isComplete: Boolean(snapshot.isComplete),
  });
}

function rescheduleSessionExpiry(session) {
  if (session.expiryTimer) {
    clearTimeout(session.expiryTimer);
  }

  session.expiryTimer = setTimeout(() => {
    closeWizardSession(session.id).catch((error) => {
      console.error('Failed to close expired wizard session:', {
        sessionId: session.id,
        error,
      });
    });
  }, SESSION_TTL_MS);

  session.expiryTimer.unref?.();
}

function getCurrentWizardFrame(page) {
  return page
    .frames()
    .find((candidate) => candidate.url().includes(FRAME_URL_HINT)) || null;
}

async function waitForWizardFrame(page) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < FRAME_WAIT_TIMEOUT_MS) {
    const frame = getCurrentWizardFrame(page);
    if (frame) {
      return frame;
    }

    await sleep(SNAPSHOT_POLL_INTERVAL_MS);
  }

  throw new Error('Timed out while waiting for the hosted Datavant wizard frame to load.');
}

function extractWizardStateInBrowser() {
  const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const cleanLabel = (value) =>
    normalizeText(value)
      .replace(/\bdone\b$/i, '')
      .replace(/\s+\u00d7$/, '')
      .trim();
  const isVisible = (element) => {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const toVisibleText = (element) => cleanLabel(element?.textContent || '');
  const buildLabelSlug = (kind, index, label) => {
    const safeLabel = normalizeText(label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);

    return `${kind}:${index}:${safeLabel || 'item'}`;
  };
  const removeDecorativeNodes = (element) => {
    const clone = element.cloneNode(true);
    clone
      .querySelectorAll(
        '.ico, .info, .info-detail, .sr-only, svg, img, script, style, .ui-buttons, .ui-dialog-header',
      )
      .forEach((node) => node.remove());
    return cleanLabel(clone.textContent || '');
  };
  const resolveContextRoot = () => {
    const dialogs = Array.from(document.querySelectorAll('.ui-dialog'))
      .filter(isVisible)
      .sort((left, right) => {
        const leftZ = Number.parseInt(window.getComputedStyle(left).zIndex || '0', 10);
        const rightZ = Number.parseInt(window.getComputedStyle(right).zIndex || '0', 10);
        return rightZ - leftZ;
      });

    const activeDialog = dialogs.find(
      (dialog) =>
        dialog.classList.contains('ui-dialog-alternate') &&
        dialog.querySelector('.ui-dialog-content')?.id !== 'sbr-survey',
    );
    if (activeDialog) {
      return {
        kind: 'dialog',
        root: activeDialog,
        slideName: activeDialog.querySelector('.ui-dialog-content')?.id || null,
      };
    }

    const activeSlide = Array.from(document.querySelectorAll('li.survey-slide'))
      .filter(isVisible)
      .find((slide) => slide.classList.contains('active'));

    if (activeSlide) {
      return {
        kind: 'slide',
        root: activeSlide,
        slideName: activeSlide.getAttribute('slide-name'),
      };
    }

    const firstVisibleSlide = Array.from(document.querySelectorAll('li.survey-slide')).find(isVisible);
    if (firstVisibleSlide) {
      return {
        kind: 'slide',
        root: firstVisibleSlide,
        slideName: firstVisibleSlide.getAttribute('slide-name'),
      };
    }

    return null;
  };
  const extractNotes = (root) => {
    const noteSelectors = [
      'p',
      '.helper',
      '.additional-note',
      '.additional-info',
      '.condensed',
      '.name-disclosure',
      '.alternate-note',
      'ul li',
    ];
    const seen = new Set();

    return noteSelectors
      .flatMap((selector) => Array.from(root.querySelectorAll(selector)))
      .filter((element) => isVisible(element) && !element.closest('.toggle-selection, .ui-buttons'))
      .map((element) => removeDecorativeNodes(element))
      .filter((value) => {
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
      });
  };
  const extractOptions = (root) =>
    Array.from(root.querySelectorAll('.toggle-selection li'))
      .filter(isVisible)
      .map((element, index) => {
        const label = removeDecorativeNodes(element);
        return {
          id: buildLabelSlug('option', index, label),
          label,
          kind:
            element.getAttribute('role') === 'checkbox' ||
            element.classList.contains('consent-check')
              ? 'checkbox'
              : 'radio',
          selected:
            element.classList.contains('selected') || element.getAttribute('aria-checked') === 'true',
          disabled: element.classList.contains('btn-disabled'),
          meta: {
            kind: 'option',
            index,
            toggleField: element.getAttribute('toggle-field') || null,
            toggleValue: element.getAttribute('toggle-value') || null,
            label,
          },
        };
      })
      .filter((option) => option.label);
  const extractFields = (root) =>
    Array.from(root.querySelectorAll('input, textarea, select'))
      .filter((element) => {
        if (!isVisible(element)) return false;
        if ((element.getAttribute('type') || '').toLowerCase() === 'hidden') return false;
        return !element.disabled;
      })
      .map((element, index) => {
        const inputType = (element.getAttribute('type') || element.tagName.toLowerCase()).toLowerCase();
        const selectOptions =
          element.tagName === 'SELECT'
            ? Array.from(element.querySelectorAll('option')).map((option) => ({
                value: option.value,
                label: normalizeText(option.textContent || option.value || ''),
              }))
            : [];
        const label =
          cleanLabel(
            document.querySelector(`label[for="${CSS.escape(element.id || '')}"]`)?.textContent ||
              element.getAttribute('aria-label') ||
              element.getAttribute('title') ||
              element.getAttribute('placeholder') ||
              element.getAttribute('name'),
          ) || `Field ${index + 1}`;

        let type = 'text';
        if (element.tagName === 'TEXTAREA') {
          type = 'textarea';
        } else if (element.tagName === 'SELECT') {
          type = 'select';
        } else if (inputType === 'tel') {
          type = 'phone';
        } else if (inputType === 'email') {
          type = 'email';
        } else if (inputType === 'file') {
          type = 'file';
        } else if (inputType === 'checkbox') {
          type = 'checkbox';
        }

        return {
          id: buildLabelSlug('field', index, label),
          label,
          name: element.getAttribute('name') || null,
          type,
          required:
            element.required ||
            element.getAttribute('aria-required') === 'true' ||
            element.closest('[required-field="yes"]') !== null,
          placeholder: element.getAttribute('placeholder') || null,
          value:
            type === 'checkbox'
              ? element.checked
                ? 'true'
                : 'false'
              : element.value || '',
          supported: type !== 'file',
          options: selectOptions,
          meta: {
            kind: 'field',
            index,
            inputId: element.id || null,
            name: element.getAttribute('name') || null,
            type,
          },
        };
      });
  const extractActions = (root) =>
    Array.from(root.querySelectorAll('.ui-buttons button, .ui-buttons a, button[action], a[action]'))
      .filter((element) => isVisible(element))
      .map((element, index) => {
        const label = cleanLabel(element.textContent || '');
        const style = element.classList.contains('btn-primary') ? 'primary' : 'secondary';
        return {
          id: buildLabelSlug('action', index, label),
          label,
          disabled:
            element.disabled ||
            element.classList.contains('btn-disabled') ||
            element.getAttribute('aria-disabled') === 'true',
          style,
          meta: {
            kind: 'action',
            index,
            actionAttr: element.getAttribute('action') || null,
            gotoSlide: element.getAttribute('goto-slide') || null,
            label,
          },
        };
      })
      .filter((action) => action.label);

  const context = resolveContextRoot();
  if (!context) {
    return null;
  }

  const prompt = cleanLabel(
    context.root.querySelector('h1, h2, [id*="heading" i]')?.textContent || '',
  );
  const notes = extractNotes(context.root);
  const options = extractOptions(context.root);
  const fields = extractFields(context.root);
  const actions = extractActions(context.root);
  const primaryAction =
    actions.find((action) => action.style === 'primary') || actions.find((action) => !action.disabled);

  let manualRequiredReason = null;
  if (fields.some((field) => field.type === 'file')) {
    manualRequiredReason = 'This step needs a file upload, which is not bridged into the native flow yet.';
  } else if (
    context.root.querySelector('#camera, video, canvas') &&
    isVisible(context.root.querySelector('#camera, video, canvas'))
  ) {
    manualRequiredReason =
      'This step needs live camera or ID capture, so it still needs a manual browser handoff.';
  }

  return {
    kind: context.kind,
    slideName: context.slideName,
    prompt,
    notes,
    options,
    fields,
    actions,
    primaryActionId: primaryAction?.id || null,
    manualRequiredReason,
    isComplete:
      context.root.classList.contains('request-complete') ||
      ['request-complete', 'feedback', 'feedback-complete'].includes(context.slideName || ''),
  };
}

function setFieldValuesInBrowser({ fields, fieldValues }) {
  const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const isVisible = (element) => {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const resolveContextRoot = () => {
    const dialogs = Array.from(document.querySelectorAll('.ui-dialog'))
      .filter(isVisible)
      .sort((left, right) => {
        const leftZ = Number.parseInt(window.getComputedStyle(left).zIndex || '0', 10);
        const rightZ = Number.parseInt(window.getComputedStyle(right).zIndex || '0', 10);
        return rightZ - leftZ;
      });

    return (
      dialogs.find(
        (dialog) =>
          dialog.classList.contains('ui-dialog-alternate') &&
          dialog.querySelector('.ui-dialog-content')?.id !== 'sbr-survey',
      ) ||
      Array.from(document.querySelectorAll('li.survey-slide'))
        .filter(isVisible)
        .find((slide) => slide.classList.contains('active')) ||
      null
    );
  };
  const setValue = (element, value) => {
    if (!element) return;

    if ((element.tagName || '').toLowerCase() === 'select') {
      const wantedValue = normalizeText(value);
      const wantedOption = Array.from(element.querySelectorAll('option')).find((option) => {
        return option.value === value || normalizeText(option.textContent || '') === wantedValue;
      });
      element.value = wantedOption?.value || value;
    } else if ((element.getAttribute('type') || '').toLowerCase() === 'checkbox') {
      element.checked = value === true || value === 'true' || value === 1 || value === '1';
    } else {
      const prototype = Object.getPrototypeOf(element);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      if (descriptor?.set) {
        descriptor.set.call(element, value);
      } else {
        element.value = value;
      }
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  };

  const root = resolveContextRoot();
  if (!root) return { updatedFieldIds: [] };

  const updatedFieldIds = [];
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(fieldValues, field.id)) continue;
    const descriptor = field.meta || {};
    const candidates = Array.from(root.querySelectorAll('input, textarea, select')).filter(isVisible);
    const element =
      candidates.find((candidate) => descriptor.inputId && candidate.id === descriptor.inputId) ||
      candidates.find(
        (candidate) => descriptor.name && candidate.getAttribute('name') === descriptor.name,
      ) ||
      candidates[descriptor.index] ||
      null;

    if (!element) continue;

    setValue(element, fieldValues[field.id]);
    updatedFieldIds.push(field.id);
  }

  return { updatedFieldIds };
}

function triggerWizardInteractionInBrowser(descriptor) {
  const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const cleanLabel = (value) =>
    normalizeText(value)
      .replace(/\bdone\b$/i, '')
      .replace(/\s+\u00d7$/, '')
      .trim();
  const isVisible = (element) => {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const resolveContextRoot = () => {
    const dialogs = Array.from(document.querySelectorAll('.ui-dialog'))
      .filter(isVisible)
      .sort((left, right) => {
        const leftZ = Number.parseInt(window.getComputedStyle(left).zIndex || '0', 10);
        const rightZ = Number.parseInt(window.getComputedStyle(right).zIndex || '0', 10);
        return rightZ - leftZ;
      });

    return (
      dialogs.find(
        (dialog) =>
          dialog.classList.contains('ui-dialog-alternate') &&
          dialog.querySelector('.ui-dialog-content')?.id !== 'sbr-survey',
      ) ||
      Array.from(document.querySelectorAll('li.survey-slide'))
        .filter(isVisible)
        .find((slide) => slide.classList.contains('active')) ||
      null
    );
  };
  const clickElement = (element) => {
    if (!element) return false;
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    if (typeof element.click === 'function') {
      element.click();
    } else {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    return true;
  };

  const root = resolveContextRoot();
  if (!root) return { clicked: false };

  if (descriptor.kind === 'option') {
    const candidates = Array.from(root.querySelectorAll('.toggle-selection li')).filter(isVisible);
    const match =
      candidates.find(
        (candidate) =>
          descriptor.toggleField &&
          candidate.getAttribute('toggle-field') === descriptor.toggleField &&
          candidate.getAttribute('toggle-value') === descriptor.toggleValue,
      ) ||
      candidates.find((candidate) => cleanLabel(candidate.textContent || '') === descriptor.label) ||
      candidates[descriptor.index] ||
      null;

    return { clicked: clickElement(match) };
  }

  const actionCandidates = Array.from(
    root.querySelectorAll('.ui-buttons button, .ui-buttons a, button[action], a[action]'),
  ).filter(isVisible);
  const match =
    actionCandidates.find(
      (candidate) =>
        descriptor.actionAttr && candidate.getAttribute('action') === descriptor.actionAttr,
    ) ||
    actionCandidates.find(
      (candidate) =>
        descriptor.gotoSlide && candidate.getAttribute('goto-slide') === descriptor.gotoSlide,
    ) ||
    actionCandidates.find((candidate) => cleanLabel(candidate.textContent || '') === descriptor.label) ||
    actionCandidates[descriptor.index] ||
    null;

  return { clicked: clickElement(match) };
}

async function captureWizardSnapshot(session) {
  const frame = await waitForWizardFrame(session.page);
  const startedAt = Date.now();

  while (Date.now() - startedAt < SNAPSHOT_WAIT_TIMEOUT_MS) {
    const snapshot = await frame.evaluate(extractWizardStateInBrowser);
    if (snapshot?.prompt || snapshot?.options?.length || snapshot?.fields?.length || snapshot?.actions?.length) {
      return snapshot;
    }

    await sleep(SNAPSHOT_POLL_INTERVAL_MS);
  }

  throw new Error('Unable to detect the current hosted wizard step.');
}

async function refreshWizardSession(session) {
  session.lastSnapshot = await captureWizardSnapshot(session);
  session.updatedAt = new Date().toISOString();
  rescheduleSessionExpiry(session);
  return buildPublicWizardSession(session);
}

async function waitForNextSnapshot(session, previousSignature) {
  const startedAt = Date.now();
  let latestSnapshot = null;
  let settledSignature = null;
  let settledCount = 0;

  await sleep(400);

  while (Date.now() - startedAt < SNAPSHOT_WAIT_TIMEOUT_MS) {
    latestSnapshot = await captureWizardSnapshot(session);
    const nextSignature = getSnapshotSignature(latestSnapshot);

    if (nextSignature === previousSignature) {
      settledSignature = null;
      settledCount = 0;
      await sleep(SNAPSHOT_POLL_INTERVAL_MS);
      continue;
    }

    if (nextSignature === settledSignature) {
      settledCount += 1;
    } else {
      settledSignature = nextSignature;
      settledCount = 1;
    }

    if (settledCount >= 2) {
      break;
    }

    await sleep(SNAPSHOT_POLL_INTERVAL_MS);
  }

  session.lastSnapshot = latestSnapshot;
  session.updatedAt = new Date().toISOString();
  rescheduleSessionExpiry(session);
  return buildPublicWizardSession(session);
}

export async function createWizardSession({ launchUrl }) {
  const normalizedLaunchUrl = normalizeSupportedWizardLaunchUrl(launchUrl);
  const id = randomUUID();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'limbo-wizard-'));

  let context = null;
  try {
    context = await launchPersistentContext({
      userDataDir,
      headless: true,
      timezone: DEFAULT_TIMEZONE,
      locale: DEFAULT_LOCALE,
    });

    const page = context.pages()[0] || (await context.newPage());
    await page.goto(normalizedLaunchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: FRAME_WAIT_TIMEOUT_MS,
    });

    await waitForWizardFrame(page);

    const session = {
      id,
      launchUrl: normalizedLaunchUrl,
      resolvedWizardUrl: getCurrentWizardFrame(page)?.url() || null,
      context,
      page,
      userDataDir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSnapshot: null,
      expiryTimer: null,
    };

    sessions.set(id, session);
    const publicSession = await refreshWizardSession(session);
    session.resolvedWizardUrl = getCurrentWizardFrame(page)?.url() || session.resolvedWizardUrl;
    return publicSession;
  } catch (error) {
    if (context) {
      await context.close().catch(() => undefined);
    }
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function getWizardSessionState(sessionId) {
  const session = getSession(sessionId);
  session.resolvedWizardUrl = getCurrentWizardFrame(session.page)?.url() || session.resolvedWizardUrl;
  return refreshWizardSession(session);
}

export async function respondToWizardSession(sessionId, payload) {
  const session = getSession(sessionId);
  if (!session.lastSnapshot) {
    await refreshWizardSession(session);
  }

  const previousSignature = getSnapshotSignature(session.lastSnapshot);
  const snapshot = session.lastSnapshot;
  const frame = await waitForWizardFrame(session.page);
  const fieldValues =
    payload?.field_values && typeof payload.field_values === 'object' ? payload.field_values : {};

  if (Object.keys(fieldValues).length > 0 && Array.isArray(snapshot.fields) && snapshot.fields.length > 0) {
    await frame.evaluate(setFieldValuesInBrowser, {
      fields: snapshot.fields,
      fieldValues,
    });
  }

  if (payload?.option_id) {
    const option = snapshot.options?.find((candidate) => candidate.id === payload.option_id);
    if (!option?.meta) {
      throw invalidWizardResponseError('That wizard option is no longer available on the current step.');
    }

    const result = await frame.evaluate(triggerWizardInteractionInBrowser, option.meta);
    if (!result?.clicked) {
      throw invalidWizardResponseError('Unable to select that wizard option on the hosted page.');
    }
  }

  if (payload?.action_id) {
    const action = snapshot.actions?.find((candidate) => candidate.id === payload.action_id);
    if (!action?.meta) {
      throw invalidWizardResponseError('That wizard action is no longer available on the current step.');
    }

    const result = await frame.evaluate(triggerWizardInteractionInBrowser, action.meta);
    if (!result?.clicked) {
      throw invalidWizardResponseError('Unable to trigger that wizard action on the hosted page.');
    }
  }

  if (!payload?.option_id && !payload?.action_id && Object.keys(fieldValues).length === 0) {
    throw invalidWizardResponseError(
      'Wizard responses must include an option, an action, or one or more field values.',
    );
  }

  session.resolvedWizardUrl = getCurrentWizardFrame(session.page)?.url() || session.resolvedWizardUrl;
  return waitForNextSnapshot(session, previousSignature);
}

export async function closeWizardSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  sessions.delete(sessionId);
  if (session.expiryTimer) {
    clearTimeout(session.expiryTimer);
  }

  await session.context?.close().catch(() => undefined);
  await fs.rm(session.userDataDir, { recursive: true, force: true }).catch(() => undefined);
  return true;
}

export function getSupportedWizardLaunchUrls() {
  return [normalizeSupportedWizardLaunchUrl('https://www.swellbox.com/ascension-texas-seton-wizard.html')];
}

export function getWizardLaunchUrlForSystem(systemName) {
  if (cleanWizardText(systemName).toLowerCase() === 'ascension seton') {
    return normalizeSupportedWizardLaunchUrl('https://www.swellbox.com/ascension-texas-seton-wizard.html');
  }

  return null;
}

export const __testing = {
  extractWizardStateInBrowser,
  setFieldValuesInBrowser,
  triggerWizardInteractionInBrowser,
  getSnapshotSignature,
  buildWizardInteractionId,
  stripDecorativeWizardText,
};
