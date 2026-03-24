import { describe, expect, it } from 'vitest';
import type { PortalPageSnapshot } from '../types/portal';
import { derivePortalSessionState } from '../core/portal/session';

function makeSnapshot(overrides: Partial<PortalPageSnapshot>): PortalPageSnapshot {
  return {
    url: 'https://portal.example.org/login',
    title: 'Portal Login',
    textSnippet: 'Sign in to continue to your portal.',
    hasPasswordField: false,
    hasEmailField: false,
    hasTextField: false,
    hasOtpField: false,
    hasCaptchaHint: false,
    hasPasskeyHint: false,
    hasLogoutHint: false,
    hasConsentHint: false,
    interactiveTargets: [],
    lastObservedAt: '2026-03-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('portal session state derivation', () => {
  it('detects login pages from a password field', () => {
    const state = derivePortalSessionState({
      portalProfileId: 'portal-1',
      snapshot: makeSnapshot({
        hasPasswordField: true,
        hasTextField: true,
      }),
    });

    expect(state.phase).toBe('login');
    expect(state.isHumanRequired).toBe(false);
  });

  it('detects registration pages when sign-up language is visible', () => {
    const state = derivePortalSessionState({
      portalProfileId: 'portal-1',
      snapshot: makeSnapshot({
        hasPasswordField: true,
        textSnippet: 'Create account to activate your portal access.',
      }),
    });

    expect(state.phase).toBe('registration');
  });

  it('detects challenge steps and explains why they paused', () => {
    const state = derivePortalSessionState({
      portalProfileId: 'portal-1',
      snapshot: makeSnapshot({
        title: 'Enter verification code',
        textSnippet: 'We sent a verification code to your phone.',
        hasOtpField: true,
      }),
    });

    expect(state.phase).toBe('challenge');
    expect(state.humanRequiredReason).toBe('otp');
    expect(state.isHumanRequired).toBe(true);
  });

  it('detects authenticated sessions from post-login cues', () => {
    const state = derivePortalSessionState({
      portalProfileId: 'portal-1',
      snapshot: makeSnapshot({
        url: 'https://portal.example.org/home',
        title: 'Messages',
        textSnippet: 'Inbox, lab results, medications, and appointments.',
        hasLogoutHint: true,
      }),
    });

    expect(state.phase).toBe('authenticated');
    expect(state.suggestedActions).toContain('openMessages');
    expect(state.suggestedActions).toContain('openLabs');
  });
});
