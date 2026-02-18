// providers/AuthProvider.tsx
// Manages authentication state: JWT, pubkey, login/logout.
// Supports two login methods: Nostr (biometric key) and Google (OAuth token).
// Re-authenticates silently when JWT expires.

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { KeyManager } from '../core/crypto/KeyManager';
import { authenticateNostr } from '../core/crypto/nostrAuth';
import { API_BASE_URL, ENDPOINTS } from '../constants/api';
import type { AuthState, AuthStatus, LoginMethod, GoogleProfile } from '../types/auth';
import { decode as base64Decode } from '../core/crypto/base64';

// --- Constants ---

const JWT_STORAGE_KEY = 'limbo_jwt';
const LOGIN_METHOD_KEY = 'limbo_login_method';
const GOOGLE_PROFILE_KEY = 'limbo_google_profile';

// --- Context ---

interface AuthContextValue {
  state: AuthState;
  /** Master privkey held in memory after biometric unlock. Never persisted in plaintext. */
  privkey: Uint8Array | null;
  login: (privkey: Uint8Array) => Promise<void>;
  loginWithGoogle: (accessToken: string) => Promise<void>;
  /** Store a Nostr key for an already-authenticated Google user (for encryption). */
  storeNostrKey: (privkey: Uint8Array) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be inside AuthProvider');
  return ctx;
}

// --- Helper: default empty state ---

function emptyState(status: AuthStatus): AuthState {
  return { status, jwt: null, pubkey: null, metadata: null, loginMethod: null, googleProfile: null };
}

// --- Provider ---

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(emptyState('loading'));
  const [privkeyRef, setPrivkeyRef] = useState<Uint8Array | null>(null);

  const keyManager = useMemo(
    () => new KeyManager(SecureStore),
    [],
  );

  // --- Startup: check for stored credentials ---

  useEffect(() => {
    (async () => {
      try {
        const loginMethod = await SecureStore.getItemAsync(LOGIN_METHOD_KEY) as LoginMethod | null;

        if (loginMethod === 'google') {
          // --- Google startup path ---
          const storedJwt = await SecureStore.getItemAsync(JWT_STORAGE_KEY);
          const cachedProfile = await SecureStore.getItemAsync(GOOGLE_PROFILE_KEY);
          const googleProfile: GoogleProfile | null = cachedProfile ? JSON.parse(cachedProfile) : null;

          if (storedJwt && !isJwtExpired(storedJwt)) {
            // Check if user also has a Nostr key stored (added after Google login)
            const hasNostrKey = await keyManager.hasStoredKey();
            let pubkey: string | null = null;
            if (hasNostrKey) {
              const privkey = await keyManager.getMasterPrivkey();
              if (privkey) {
                setPrivkeyRef(privkey);
                pubkey = KeyManager.pubkeyFromPrivkey(privkey);
              }
            }

            const cachedMeta = await SecureStore.getItemAsync('limbo_metadata');
            const metadata = cachedMeta ? JSON.parse(cachedMeta) : null;
            setState({
              status: 'authenticated',
              jwt: storedJwt,
              pubkey,
              metadata,
              loginMethod: 'google',
              googleProfile,
            });
          } else {
            // JWT expired — need to re-login with Google (no refresh token in v1)
            setState({ ...emptyState('expired'), loginMethod: 'google', googleProfile });
          }
          return;
        }

        // --- Nostr startup path (existing flow) ---
        const hasKey = await keyManager.hasStoredKey();
        if (!hasKey) {
          setState(emptyState('onboarding'));
          return;
        }

        // Key exists — single biometric unlock to get privkey
        const privkey = await keyManager.getMasterPrivkey();
        if (!privkey) {
          setState(emptyState('onboarding'));
          return;
        }
        setPrivkeyRef(privkey);
        const pubkey = KeyManager.pubkeyFromPrivkey(privkey);

        // Check for stored JWT
        const storedJwt = await SecureStore.getItemAsync(JWT_STORAGE_KEY);
        if (storedJwt && !isJwtExpired(storedJwt)) {
          const cachedMeta = await SecureStore.getItemAsync('limbo_metadata');
          const metadata = cachedMeta ? JSON.parse(cachedMeta) : null;
          setState({ status: 'authenticated', jwt: storedJwt, pubkey, metadata, loginMethod: 'nostr', googleProfile: null });
          return;
        }

        // JWT missing or expired — silent re-auth (no additional biometric)
        const auth = await authenticateNostr(privkey, API_BASE_URL);
        await SecureStore.setItemAsync(JWT_STORAGE_KEY, auth.jwt);
        if (auth.metadata) await SecureStore.setItemAsync('limbo_metadata', JSON.stringify(auth.metadata));
        setState({ status: 'authenticated', jwt: auth.jwt, pubkey: auth.pubkey, metadata: auth.metadata, loginMethod: 'nostr', googleProfile: null });
      } catch (err) {
        console.error('Auth startup failed:', err);
        const hasKey = await keyManager.hasStoredKey().catch(() => false);
        const loginMethod = await SecureStore.getItemAsync(LOGIN_METHOD_KEY) as LoginMethod | null;
        setState({
          status: hasKey ? 'expired' : 'onboarding',
          jwt: null,
          pubkey: null,
          metadata: null,
          loginMethod,
          googleProfile: null,
        });
      }
    })();
  }, [keyManager]);

  // --- Login with Nostr key: store key + authenticate ---

  const login = useCallback(
    async (privkey: Uint8Array) => {
      await keyManager.storeMasterPrivkey(privkey);
      setPrivkeyRef(privkey);
      const { jwt, pubkey, metadata } = await authenticateNostr(privkey, API_BASE_URL);
      await SecureStore.setItemAsync(JWT_STORAGE_KEY, jwt);
      await SecureStore.setItemAsync(LOGIN_METHOD_KEY, 'nostr');
      if (metadata) await SecureStore.setItemAsync('limbo_metadata', JSON.stringify(metadata));
      setState({ status: 'authenticated', jwt, pubkey, metadata, loginMethod: 'nostr', googleProfile: null });
    },
    [keyManager],
  );

  // --- Login with Google: exchange access token for Limbo JWT ---

  const loginWithGoogle = useCallback(
    async (accessToken: string) => {
      const resp = await fetch(ENDPOINTS.googleToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      });
      const data = await resp.json();
      if (data.status !== 'OK') throw new Error(data.reason || 'Google login failed');

      const googleProfile: GoogleProfile = {
        email: data.user.email,
        name: data.user.name,
        picture: data.user.picture,
        googleId: data.user.googleId,
      };

      await SecureStore.setItemAsync(JWT_STORAGE_KEY, data.token);
      await SecureStore.setItemAsync(LOGIN_METHOD_KEY, 'google');
      await SecureStore.setItemAsync(GOOGLE_PROFILE_KEY, JSON.stringify(googleProfile));

      setState({
        status: 'authenticated',
        jwt: data.token,
        pubkey: null,
        metadata: null,
        loginMethod: 'google',
        googleProfile,
      });
    },
    [],
  );

  // --- Store Nostr key for Google user (for encryption) ---

  const storeNostrKey = useCallback(
    async (privkey: Uint8Array) => {
      await keyManager.storeMasterPrivkey(privkey);
      setPrivkeyRef(privkey);
      const pubkey = KeyManager.pubkeyFromPrivkey(privkey);

      setState(prev => ({
        ...prev,
        pubkey,
      }));
    },
    [keyManager],
  );

  // --- Logout: clear everything ---

  const logout = useCallback(async () => {
    await keyManager.deleteMasterPrivkey();
    await SecureStore.deleteItemAsync(JWT_STORAGE_KEY);
    await SecureStore.deleteItemAsync('limbo_metadata');
    await SecureStore.deleteItemAsync(LOGIN_METHOD_KEY);
    await SecureStore.deleteItemAsync(GOOGLE_PROFILE_KEY);
    setPrivkeyRef(null);
    setState(emptyState('onboarding'));
  }, [keyManager]);

  // --- Refresh: re-authenticate with stored key ---

  const refreshAuth = useCallback(async () => {
    if (state.loginMethod === 'google') {
      // Google users can't silently re-auth without refresh token — mark expired
      setState(prev => ({ ...prev, status: 'expired' }));
      return;
    }

    // Nostr path: prefer in-memory privkey; only hit Keychain (biometric) if not cached
    let privkey = privkeyRef;
    if (!privkey) {
      privkey = await keyManager.getMasterPrivkey();
      if (!privkey) {
        setState(emptyState('onboarding'));
        return;
      }
      setPrivkeyRef(privkey);
    }
    const { jwt, pubkey, metadata } = await authenticateNostr(privkey, API_BASE_URL);
    await SecureStore.setItemAsync(JWT_STORAGE_KEY, jwt);
    if (metadata) await SecureStore.setItemAsync('limbo_metadata', JSON.stringify(metadata));
    setState({ status: 'authenticated', jwt, pubkey, metadata, loginMethod: 'nostr', googleProfile: null });
  }, [keyManager, privkeyRef, state.loginMethod]);

  // --- Render ---

  const value = useMemo(
    () => ({ state, privkey: privkeyRef, login, loginWithGoogle, storeNostrKey, logout, refreshAuth }),
    [state, privkeyRef, login, loginWithGoogle, storeNostrKey, logout, refreshAuth],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// --- JWT expiry check ---

function isJwtExpired(jwt: string): boolean {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return true;

    // Decode payload (base64url → JSON)
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';

    // Decode base64 using Hermes-safe decoder
    const bytes = base64Decode(payload);
    const decoded = new TextDecoder().decode(bytes);
    const { exp } = JSON.parse(decoded);

    if (!exp) return false; // No expiry claim — treat as valid
    return Date.now() >= exp * 1000;
  } catch {
    return true; // If we can't parse it, treat as expired
  }
}
