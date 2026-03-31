export type PortalFamilyId =
  | 'ascension'
  | 'mychart'
  | 'athena'
  | 'nextgen'
  | 'eclinicalworks'
  | 'generic';

export type PortalWorkspaceKind = 'patient_portal' | 'records_request_portal';

export type PortalProfileStatus = 'active' | 'needs_attention' | 'unsupported';

export type PortalSessionPhase =
  | 'loading'
  | 'login'
  | 'registration'
  | 'challenge'
  | 'authenticated'
  | 'unsupported';

export type PortalHumanRequiredReason =
  | 'captcha'
  | 'otp'
  | 'passkey'
  | 'consent'
  | 'security_check'
  | 'manual_review'
  | null;

export type PortalNavigationAction =
  | 'openMessages'
  | 'openLabs'
  | 'openAppointments'
  | 'openVisitSummaries';

export interface PortalProfile {
  id: string;
  kind: PortalWorkspaceKind;
  healthSystemId: string;
  healthSystemName: string;
  portalFamily: PortalFamilyId;
  displayName: string;
  portalName: string | null;
  portalScope: string;
  baseUrl: string;
  launchUrl: string;
  loginUrl: string;
  registrationUrl: string | null;
  usernameHint: string;
  credentialKey: string;
  sessionResumeUrl: string | null;
  sessionResumeCapturedAt: string | null;
  lastSuccessfulLoginAt: string | null;
  lastVerifiedAt: string | null;
  status: PortalProfileStatus;
}

export interface PortalCredentialRecord {
  username: string;
  password: string;
  notes: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  lastVerifiedAt: string | null;
}

export interface PortalInteractiveTarget {
  label: string;
  href: string | null;
}

export interface PortalPageSnapshot {
  url: string;
  title: string;
  textSnippet: string;
  hasPasswordField: boolean;
  hasEmailField: boolean;
  hasTextField: boolean;
  hasOtpField: boolean;
  hasCaptchaHint: boolean;
  hasPasskeyHint: boolean;
  hasLogoutHint: boolean;
  hasConsentHint: boolean;
  interactiveTargets: PortalInteractiveTarget[];
  lastObservedAt: string;
}

export interface PortalSessionState {
  portalProfileId: string | null;
  phase: PortalSessionPhase;
  currentUrl: string;
  pageTitle: string;
  isHumanRequired: boolean;
  humanRequiredReason: PortalHumanRequiredReason;
  lastAdapterAction: string | null;
  lastActivityAt: string | null;
  suggestedActions: PortalNavigationAction[];
}

export type PortalBridgeMessage =
  | {
      type: 'portal.pageSnapshot';
      payload: PortalPageSnapshot;
    }
  | {
      type: 'portal.launchResult';
      payload: {
        matched: boolean;
      };
    }
  | {
      type: 'portal.fillResult';
      payload: {
        filled: boolean;
        submitted: boolean;
      };
    }
  | {
      type: 'portal.commandResult';
      payload: {
        action: PortalNavigationAction;
        matched: boolean;
      };
    };
