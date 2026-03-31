import type {
  PortalCredentialRecord,
  PortalFamilyId,
  PortalNavigationAction,
} from '../../types/portal';

export interface PortalAdapter {
  id: PortalFamilyId;
  displayName: string;
  hostnamePatterns: RegExp[];
  namePatterns: RegExp[];
  usernameHint: string;
  launch: {
    selectors: string[];
    labelIncludes: string[];
    hrefIncludes: string[];
    safeAutoLaunch: boolean;
  };
  login: {
    usernameSelectors: string[];
    passwordSelectors: string[];
    submitSelectors: string[];
    safeAutoSubmit: boolean;
  };
  actions: Record<
    PortalNavigationAction,
    {
      selectors: string[];
      labelIncludes: string[];
      hrefIncludes: string[];
    }
  >;
}

const ACTIONS: PortalAdapter['actions'] = {
  openMessages: {
    selectors: [
      'a[href*="message"]',
      'a[href*="inbox"]',
      'button[aria-label*="message" i]',
      'button[aria-label*="inbox" i]',
    ],
    labelIncludes: ['messages', 'inbox'],
    hrefIncludes: ['/message', '/messages', '/inbox'],
  },
  openLabs: {
    selectors: [
      'a[href*="lab"]',
      'a[href*="result"]',
      'button[aria-label*="lab" i]',
      'button[aria-label*="result" i]',
    ],
    labelIncludes: ['labs', 'lab results', 'test results', 'results'],
    hrefIncludes: ['/lab', '/labs', '/result', '/results'],
  },
  openAppointments: {
    selectors: [
      'a[href*="appointment"]',
      'a[href*="visit"]',
      'button[aria-label*="appointment" i]',
      'button[aria-label*="visit" i]',
    ],
    labelIncludes: ['appointments', 'visits', 'schedule'],
    hrefIncludes: ['/appointment', '/appointments', '/visit', '/visits'],
  },
  openVisitSummaries: {
    selectors: [
      'a[href*="summary"]',
      'a[href*="document"]',
      'a[href*="after-visit"]',
      'button[aria-label*="summary" i]',
      'button[aria-label*="document" i]',
    ],
    labelIncludes: ['visit summary', 'after visit', 'documents', 'notes'],
    hrefIncludes: ['/summary', '/summaries', '/document', '/documents', '/after-visit'],
  },
};

const GENERIC_LAUNCH: PortalAdapter['launch'] = {
  selectors: [],
  labelIncludes: ['sign in', 'log in', 'login'],
  hrefIncludes: ['/login', '/signin', '/sign-in'],
  safeAutoLaunch: false,
};

const ADAPTERS: Record<PortalFamilyId, PortalAdapter> = {
  ascension: {
    id: 'ascension',
    displayName: 'Ascension',
    hostnamePatterns: [/ascension/i, /iqhealth/i],
    namePatterns: [/ascension/i],
    usernameHint: 'Email address',
    launch: {
      selectors: [
        'a[href*="id.ascension.org"]',
        'a[href*="/one"]',
        'a[href*="iqhealth.com"]',
        'button[aria-label*="sign in" i]',
        'button[aria-label*="log in" i]',
        'a[aria-label*="sign in" i]',
        'a[aria-label*="log in" i]',
      ],
      labelIncludes: [
        'sign in',
        'log in',
        'login',
        'ascension one',
        'my account',
        'hospital portal',
      ],
      hrefIncludes: ['id.ascension.org', '/one', 'iqhealth.com'],
      safeAutoLaunch: true,
    },
    login: {
      usernameSelectors: [
        'input[type="email"]',
        'input[name*="email" i]',
        'input[name*="user" i]',
        'input[name*="sign" i]',
        'input[name*="login" i]',
      ],
      passwordSelectors: ['input[name*="password" i]', 'input[type="password"]'],
      submitSelectors: [
        'button[type="submit"]',
        'input[type="submit"]',
        'button[aria-label*="sign in" i]',
        'button[aria-label*="log in" i]',
      ],
      safeAutoSubmit: true,
    },
    actions: ACTIONS,
  },
  mychart: {
    id: 'mychart',
    displayName: 'MyChart',
    hostnamePatterns: [/mychart/i, /epic/i],
    namePatterns: [/mychart/i],
    usernameHint: 'Email or username',
    launch: GENERIC_LAUNCH,
    login: {
      usernameSelectors: [
        'input#UserID',
        'input#username',
        'input[name="UserID"]',
        'input[name="username"]',
        'input[name="Login"]',
        'input[name="j_username"]',
      ],
      passwordSelectors: [
        'input#Password',
        'input[name="Password"]',
        'input[name="password"]',
        'input[type="password"]',
      ],
      submitSelectors: [
        'button[type="submit"]',
        'input[type="submit"]',
        'button[id*="SignIn" i]',
        'button[name*="SignIn" i]',
      ],
      safeAutoSubmit: true,
    },
    actions: ACTIONS,
  },
  athena: {
    id: 'athena',
    displayName: 'athenahealth',
    hostnamePatterns: [/athena/i],
    namePatterns: [/athena/i],
    usernameHint: 'Email or username',
    launch: GENERIC_LAUNCH,
    login: {
      usernameSelectors: [
        'input[name="email"]',
        'input[name="username"]',
        'input[type="email"]',
      ],
      passwordSelectors: ['input[name="password"]', 'input[type="password"]'],
      submitSelectors: ['button[type="submit"]', 'input[type="submit"]'],
      safeAutoSubmit: true,
    },
    actions: ACTIONS,
  },
  nextgen: {
    id: 'nextgen',
    displayName: 'NextGen',
    hostnamePatterns: [/nextmd/i, /nextgen/i],
    namePatterns: [/nextgen/i, /nextmd/i],
    usernameHint: 'Username or email',
    launch: GENERIC_LAUNCH,
    login: {
      usernameSelectors: ['input[name="username"]', 'input[type="email"]', 'input[type="text"]'],
      passwordSelectors: ['input[name="password"]', 'input[type="password"]'],
      submitSelectors: ['button[type="submit"]', 'input[type="submit"]'],
      safeAutoSubmit: true,
    },
    actions: ACTIONS,
  },
  eclinicalworks: {
    id: 'eclinicalworks',
    displayName: 'eClinicalWorks',
    hostnamePatterns: [/healow/i, /eclinicalworks/i],
    namePatterns: [/healow/i, /eclinicalworks/i],
    usernameHint: 'Username or email',
    launch: GENERIC_LAUNCH,
    login: {
      usernameSelectors: ['input[name="username"]', 'input[type="email"]', 'input[type="text"]'],
      passwordSelectors: ['input[name="password"]', 'input[type="password"]'],
      submitSelectors: ['button[type="submit"]', 'input[type="submit"]'],
      safeAutoSubmit: true,
    },
    actions: ACTIONS,
  },
  generic: {
    id: 'generic',
    displayName: 'Portal',
    hostnamePatterns: [],
    namePatterns: [],
    usernameHint: 'Username, email, or member ID',
    launch: GENERIC_LAUNCH,
    login: {
      usernameSelectors: [
        'input[type="email"]',
        'input[name*="email" i]',
        'input[name*="user" i]',
        'input[name*="login" i]',
        'input[type="text"]',
      ],
      passwordSelectors: ['input[type="password"]'],
      submitSelectors: ['button[type="submit"]', 'input[type="submit"]', 'button'],
      safeAutoSubmit: false,
    },
    actions: ACTIONS,
  },
};

function safeSerialize<T>(value: T): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function detectPortalFamily(input: {
  url: string | null | undefined;
  portalName?: string | null;
  healthSystemName?: string | null;
}): PortalFamilyId {
  const candidate = `${input.url || ''} ${input.portalName || ''} ${input.healthSystemName || ''}`;

  for (const adapter of Object.values(ADAPTERS)) {
    if (adapter.id === 'generic') {
      continue;
    }

    const matchesHost = adapter.hostnamePatterns.some((pattern) => pattern.test(candidate));
    const matchesName = adapter.namePatterns.some((pattern) => pattern.test(candidate));

    if (matchesHost || matchesName) {
      return adapter.id;
    }
  }

  return 'generic';
}

export function getPortalAdapter(family: PortalFamilyId): PortalAdapter {
  return ADAPTERS[family] ?? ADAPTERS.generic;
}

export function buildCredentialFillScript(
  adapter: PortalAdapter,
  credential: PortalCredentialRecord,
  options?: { autoSubmit?: boolean },
): string {
  const payload = safeSerialize({
    credential,
    usernameSelectors: adapter.login.usernameSelectors,
    passwordSelectors: adapter.login.passwordSelectors,
    submitSelectors: adapter.login.submitSelectors,
    autoSubmit: Boolean(options?.autoSubmit),
  });

  return `
    (function () {
      var payload = ${payload};
      var result = { filled: false, submitted: false };
      var post = function (type, message) {
        if (!window.ReactNativeWebView) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: type,
          payload: message
        }));
      };
      var isVisible = function (element) {
        if (!element) return false;
        var style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };
      var queryVisible = function (selectors) {
        for (var i = 0; i < selectors.length; i += 1) {
          var element = document.querySelector(selectors[i]);
          if (element && isVisible(element)) {
            return element;
          }
        }
        return null;
      };
      var findFallbackUsername = function () {
        var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
        for (var i = 0; i < inputs.length; i += 1) {
          var input = inputs[i];
          var type = (input.getAttribute('type') || '').toLowerCase();
          if (!isVisible(input)) continue;
          if (type === 'hidden' || type === 'search' || type === 'password') continue;
          return input;
        }
        return null;
      };
      var setInputValue = function (element, value) {
        if (!element) return;
        var prototype = Object.getPrototypeOf(element);
        var descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(element, value);
        } else {
          element.value = value;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
      };

      var usernameInput = queryVisible(payload.usernameSelectors) || findFallbackUsername();
      var passwordInput = queryVisible(payload.passwordSelectors);

      if (usernameInput) {
        setInputValue(usernameInput, payload.credential.username);
        result.filled = true;
      }

      if (passwordInput) {
        setInputValue(passwordInput, payload.credential.password);
        result.filled = true;
      }

      if (payload.autoSubmit && result.filled) {
        var submitButton = queryVisible(payload.submitSelectors);
        if (submitButton && typeof submitButton.click === 'function') {
          submitButton.click();
          result.submitted = true;
        }
      }

      post('portal.fillResult', result);
      if (window.__limboCollectPortalSnapshot) {
        window.__limboCollectPortalSnapshot();
      }
      return true;
    })();
    true;
  `;
}

export function buildPortalCommandScript(
  adapter: PortalAdapter,
  action: PortalNavigationAction,
): string {
  const config = adapter.actions[action];
  const payload = safeSerialize({
    action,
    selectors: config.selectors,
    labelIncludes: config.labelIncludes,
    hrefIncludes: config.hrefIncludes,
  });

  return `
    (function () {
      var payload = ${payload};
      var matched = false;
      var post = function () {
        if (!window.ReactNativeWebView) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'portal.commandResult',
          payload: {
            action: payload.action,
            matched: matched
          }
        }));
      };
      var labelMatches = function (value) {
        if (!value) return false;
        var normalized = value.toLowerCase();
        return payload.labelIncludes.some(function (token) {
          return normalized.indexOf(token) !== -1;
        });
      };
      var hrefMatches = function (href) {
        if (!href) return false;
        return payload.hrefIncludes.some(function (token) {
          return href.toLowerCase().indexOf(token) !== -1;
        });
      };
      var clickIfPossible = function (element) {
        if (element && typeof element.click === 'function') {
          element.click();
          matched = true;
          return true;
        }
        return false;
      };

      for (var i = 0; i < payload.selectors.length; i += 1) {
        var direct = document.querySelector(payload.selectors[i]);
        if (clickIfPossible(direct)) {
          post();
          return true;
        }
      }

      var targets = Array.prototype.slice.call(
        document.querySelectorAll('a, button, [role="button"]')
      );
      for (var index = 0; index < targets.length; index += 1) {
        var element = targets[index];
        var label = (element.innerText || element.textContent || '').trim();
        var href = element.getAttribute('href');
        if (labelMatches(label) || hrefMatches(href)) {
          if (clickIfPossible(element)) {
            post();
            return true;
          }
        }
      }

      post();
      return true;
    })();
    true;
  `;
}

export function buildPortalLaunchScript(adapter: PortalAdapter): string {
  const payload = safeSerialize({
    selectors: adapter.launch.selectors,
    labelIncludes: adapter.launch.labelIncludes,
    hrefIncludes: adapter.launch.hrefIncludes,
  });

  return `
    (function () {
      var payload = ${payload};
      var matched = false;
      var post = function () {
        if (!window.ReactNativeWebView) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'portal.launchResult',
          payload: {
            matched: matched
          }
        }));
      };
      var hasCredentialFields =
        !!document.querySelector('input[type="password"]') ||
        !!document.querySelector('input[type="email"], input[name*="email" i], input[name*="user" i]');
      if (hasCredentialFields) {
        post();
        return true;
      }
      var labelMatches = function (value) {
        if (!value) return false;
        var normalized = value.toLowerCase();
        return payload.labelIncludes.some(function (token) {
          return normalized.indexOf(token) !== -1;
        });
      };
      var hrefMatches = function (href) {
        if (!href) return false;
        return payload.hrefIncludes.some(function (token) {
          return href.toLowerCase().indexOf(token) !== -1;
        });
      };
      var clickIfPossible = function (element) {
        if (element && typeof element.click === 'function') {
          element.click();
          matched = true;
          return true;
        }
        return false;
      };

      for (var i = 0; i < payload.selectors.length; i += 1) {
        var direct = document.querySelector(payload.selectors[i]);
        if (clickIfPossible(direct)) {
          post();
          return true;
        }
      }

      var targets = Array.prototype.slice.call(
        document.querySelectorAll('a, button, [role="button"]')
      );
      for (var index = 0; index < targets.length; index += 1) {
        var element = targets[index];
        var label = (element.innerText || element.textContent || '').trim();
        var href = element.getAttribute('href');
        if (labelMatches(label) || hrefMatches(href)) {
          if (clickIfPossible(element)) {
            post();
            return true;
          }
        }
      }

      post();
      return true;
    })();
    true;
  `;
}
