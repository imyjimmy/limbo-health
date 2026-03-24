import type {
  PortalBridgeMessage,
  PortalHumanRequiredReason,
  PortalNavigationAction,
  PortalPageSnapshot,
  PortalSessionState,
} from '../../types/portal';

const AUTHENTICATED_HINTS = [
  'sign out',
  'log out',
  'logout',
  'messages',
  'inbox',
  'appointments',
  'test results',
  'lab results',
  'after visit',
  'medications',
];

const REGISTRATION_HINTS = [
  'sign up',
  'signup',
  'register',
  'create account',
  'activate account',
  'activation code',
];

const UNSUPPORTED_HINTS = ['page not found', 'temporarily unavailable', 'access denied'];

export function buildPortalBridgeScript(): string {
  return `
    (function () {
      if (window.__limboPortalBridgeInstalled) {
        if (window.__limboCollectPortalSnapshot) {
          window.__limboCollectPortalSnapshot();
        }
        return true;
      }

      window.__limboPortalBridgeInstalled = true;

      var MAX_TEXT = 1800;
      var scheduleHandle = null;

      var normalizeText = function (value) {
        return String(value || '').replace(/\\s+/g, ' ').trim();
      };

      var truncate = function (value) {
        var normalized = normalizeText(value);
        return normalized.length > MAX_TEXT ? normalized.slice(0, MAX_TEXT) : normalized;
      };

      var post = function (message) {
        if (!window.ReactNativeWebView) return;
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      };

      var collectTargets = function () {
        var items = [];
        var nodes = Array.prototype.slice.call(
          document.querySelectorAll('a, button, [role="button"]')
        ).slice(0, 24);

        nodes.forEach(function (node) {
          var label = truncate(node.innerText || node.textContent || '');
          if (!label) return;
          items.push({
            label: label,
            href: node.getAttribute('href')
          });
        });

        return items;
      };

      var detectOtpField = function () {
        var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
        return inputs.some(function (input) {
          var autocomplete = (input.getAttribute('autocomplete') || '').toLowerCase();
          var name = (input.getAttribute('name') || '').toLowerCase();
          var inputId = (input.getAttribute('id') || '').toLowerCase();
          var type = (input.getAttribute('type') || '').toLowerCase();
          return (
            autocomplete === 'one-time-code' ||
            /otp|code|token|verification/.test(name) ||
            /otp|code|token|verification/.test(inputId) ||
            type === 'tel'
          );
        });
      };

      window.__limboCollectPortalSnapshot = function () {
        var bodyText = document.body ? document.body.innerText || '' : '';
        var lowerText = bodyText.toLowerCase();
        var snapshot = {
          url: String(window.location.href || ''),
          title: truncate(document.title || ''),
          textSnippet: truncate(bodyText),
          hasPasswordField: !!document.querySelector('input[type="password"]'),
          hasEmailField: !!document.querySelector('input[type="email"], input[name*="email" i]'),
          hasTextField: !!document.querySelector('input[type="text"], textarea'),
          hasOtpField: detectOtpField(),
          hasCaptchaHint:
            lowerText.indexOf('captcha') !== -1 ||
            lowerText.indexOf('i am not a robot') !== -1 ||
            !!document.querySelector('iframe[src*="captcha"]'),
          hasPasskeyHint:
            lowerText.indexOf('passkey') !== -1 ||
            lowerText.indexOf('security key') !== -1 ||
            lowerText.indexOf('webauthn') !== -1,
          hasLogoutHint:
            lowerText.indexOf('sign out') !== -1 ||
            lowerText.indexOf('log out') !== -1 ||
            lowerText.indexOf('logout') !== -1,
          hasConsentHint:
            lowerText.indexOf('terms and conditions') !== -1 ||
            lowerText.indexOf('i agree') !== -1 ||
            lowerText.indexOf('consent') !== -1,
          interactiveTargets: collectTargets(),
          lastObservedAt: new Date().toISOString()
        };

        post({
          type: 'portal.pageSnapshot',
          payload: snapshot
        });
      };

      var scheduleCollect = function () {
        if (scheduleHandle) {
          clearTimeout(scheduleHandle);
        }
        scheduleHandle = setTimeout(function () {
          if (window.__limboCollectPortalSnapshot) {
            window.__limboCollectPortalSnapshot();
          }
        }, 180);
      };

      document.addEventListener('click', scheduleCollect, true);
      document.addEventListener('submit', scheduleCollect, true);
      window.addEventListener('load', scheduleCollect);
      window.addEventListener('pageshow', scheduleCollect);
      window.addEventListener('popstate', scheduleCollect);

      var observer = new MutationObserver(scheduleCollect);
      if (document.documentElement) {
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true
        });
      }

      if (window.history && window.history.pushState) {
        var originalPushState = window.history.pushState.bind(window.history);
        window.history.pushState = function () {
          var result = originalPushState.apply(window.history, arguments);
          scheduleCollect();
          return result;
        };
      }

      if (window.history && window.history.replaceState) {
        var originalReplaceState = window.history.replaceState.bind(window.history);
        window.history.replaceState = function () {
          var result = originalReplaceState.apply(window.history, arguments);
          scheduleCollect();
          return result;
        };
      }

      scheduleCollect();
      return true;
    })();
    true;
  `;
}

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function resolveHumanRequiredReason(snapshot: PortalPageSnapshot, text: string): PortalHumanRequiredReason {
  if (snapshot.hasCaptchaHint) {
    return 'captcha';
  }

  if (snapshot.hasPasskeyHint) {
    return 'passkey';
  }

  if (snapshot.hasOtpField || text.includes('verification code') || text.includes('two-factor')) {
    return 'otp';
  }

  if (snapshot.hasConsentHint) {
    return 'consent';
  }

  if (text.includes('security question') || text.includes('verify your identity')) {
    return 'security_check';
  }

  return null;
}

export function derivePortalSessionState(input: {
  portalProfileId: string | null;
  snapshot: PortalPageSnapshot;
  lastAdapterAction?: string | null;
}): PortalSessionState {
  const text = `${input.snapshot.title} ${input.snapshot.textSnippet} ${input.snapshot.interactiveTargets
    .map((target) => `${target.label} ${target.href || ''}`)
    .join(' ')}`.toLowerCase();

  const humanRequiredReason = resolveHumanRequiredReason(input.snapshot, text);
  let phase: PortalSessionState['phase'] = 'loading';

  if (humanRequiredReason) {
    phase = 'challenge';
  } else if (input.snapshot.hasPasswordField) {
    phase = containsAny(text, REGISTRATION_HINTS) ? 'registration' : 'login';
  } else if (input.snapshot.hasLogoutHint || containsAny(text, AUTHENTICATED_HINTS)) {
    phase = 'authenticated';
  } else if (containsAny(text, UNSUPPORTED_HINTS)) {
    phase = 'unsupported';
  }

  const suggestedActions: PortalNavigationAction[] =
    phase === 'authenticated'
      ? ['openMessages', 'openLabs', 'openAppointments', 'openVisitSummaries']
      : [];

  return {
    portalProfileId: input.portalProfileId,
    phase,
    currentUrl: input.snapshot.url,
    pageTitle: input.snapshot.title,
    isHumanRequired: phase === 'challenge',
    humanRequiredReason,
    lastAdapterAction: input.lastAdapterAction ?? null,
    lastActivityAt: input.snapshot.lastObservedAt,
    suggestedActions,
  };
}

export function parsePortalBridgeMessage(raw: string): PortalBridgeMessage | null {
  try {
    const parsed = JSON.parse(raw) as PortalBridgeMessage;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}
