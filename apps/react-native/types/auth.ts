// types/auth.ts
// Authentication state types.

export type AuthStatus =
  | 'loading'       // Checking stored credentials on startup
  | 'onboarding'    // No key stored — show welcome/import/generate
  | 'authenticated' // JWT valid, key available
  | 'expired';      // JWT expired, needs silent re-auth

export interface AuthState {
  status: AuthStatus;
  jwt: string | null;
  pubkey: string | null;
}