// types/auth.ts
// Authentication state types.

export type AuthStatus =
  | 'loading'       // Checking stored credentials on startup
  | 'onboarding'    // No key stored — show welcome/import/generate
  | 'authenticated' // JWT valid, key available
  | 'expired';      // JWT expired, needs silent re-auth

export type LoginMethod = 'nostr' | 'google';

export interface NostrMetadata {
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  [key: string]: any;  // relay may return extra fields
}

export interface GoogleProfile {
  email: string;
  name?: string;
  picture?: string;
  googleId: string;
}

export interface OAuthConnection {
  provider: string;       // 'google', 'github', etc.
  email: string | null;
  providerId: string;
}

export interface AuthState {
  status: AuthStatus;
  jwt: string | null;
  pubkey: string | null;           // null for Google-only users without Nostr key
  metadata: NostrMetadata | null;
  loginMethod: LoginMethod | null;
  googleProfile: GoogleProfile | null;
  connections: OAuthConnection[];  // populated by GET /api/auth/me after login
}
