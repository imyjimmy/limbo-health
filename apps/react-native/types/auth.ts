// types/auth.ts
// Authentication state types.

export type AuthStatus =
  | 'loading'       // Checking stored credentials on startup
  | 'onboarding'    // No key stored — show welcome/import/generate
  | 'authenticated' // JWT valid, key available
  | 'expired';      // JWT expired, needs silent re-auth

export interface NostrMetadata {
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  [key: string]: any;  // relay may return extra fields
}

export interface AuthState {
  status: AuthStatus;
  jwt: string | null;
  pubkey: string | null;
  metadata: NostrMetadata | null;
}