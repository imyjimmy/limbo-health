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
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { KeyManager } from '../core/crypto/KeyManager';
import { authenticateNostr, signChallenge } from '../core/crypto/nostrAuth';
import { API_BASE_URL, ENDPOINTS } from '../constants/api';
import type { AuthState, AuthStatus, LoginMethod, GoogleProfile, NostrMetadata, OAuthConnection } from '../types/auth';
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
  /** True if a Nostr key already exists in local secure storage. */
  hasStoredNostrKey: boolean;
  login: (privkey: Uint8Array) => Promise<void>;
  loginWithGoogle: (accessToken: string) => Promise<void>;
  /** Authenticate using an already stored Nostr key (biometric-gated read). */
  loginWithStoredNostr: () => Promise<void>;
  /** Store a Nostr key for an already-authenticated Google user (for encryption). */
  storeNostrKey: (privkey: Uint8Array) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  updateMetadata: (partial: Partial<NostrMetadata>) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be inside AuthProvider');
  return ctx;
}

// --- Helper: default empty state ---

function emptyState(status: AuthStatus): AuthState {
  return { status, jwt: null, pubkey: null, metadata: null, loginMethod: null, googleProfile: null, connections: [] };
}

interface ProfileSnapshot {
  connections: OAuthConnection[];
  nostrPubkey: string | null;
  firstName: string | null;
  lastName: string | null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function splitDisplayName(name?: string): { firstName: string | null; lastName: string | null } {
  const cleaned = asNonEmptyString(name);
  if (!cleaned) return { firstName: null, lastName: null };

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function buildMetadataWithNames(
  existing: NostrMetadata | null,
  firstName: string | null,
  lastName: string | null,
): NostrMetadata | null {
  if (!firstName && !lastName) return existing;

  const metadata: NostrMetadata = { ...(existing ?? {}) };
  if (firstName) metadata.first_name = firstName;
  if (lastName) metadata.last_name = lastName;

  if (!metadata.display_name && !metadata.name) {
    const fullName = [metadata.first_name, metadata.last_name].filter(Boolean).join(' ').trim();
    if (fullName) metadata.name = fullName;
  }

  return metadata;
}

function applyProfileSnapshot(prev: AuthState, profile: ProfileSnapshot): AuthState {
  const metadata = buildMetadataWithNames(prev.metadata, profile.firstName, profile.lastName);

  return {
    ...prev,
    connections: profile.connections,
    pubkey: profile.nostrPubkey || prev.pubkey,
    metadata,
  };
}

/** Best-effort fetch of profile data from /api/auth/me. Returns empty payload on failure. */
async function fetchProfile(jwt: string): Promise<ProfileSnapshot> {
  try {
    const resp = await fetch(ENDPOINTS.me, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!resp.ok) return { connections: [], nostrPubkey: null, firstName: null, lastName: null };
    const data = await resp.json();
    const firstName = asNonEmptyString(data?.user?.firstName);
    const lastName = asNonEmptyString(data?.user?.lastName);
    return {
      connections: Array.isArray(data.connections) ? data.connections : [],
      nostrPubkey: typeof data?.user?.nostrPubkey === 'string' ? data.user.nostrPubkey : null,
      firstName,
      lastName,
    };
  } catch {
    return { connections: [], nostrPubkey: null, firstName: null, lastName: null };
  }
}

// --- Provider ---

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(emptyState('loading'));
  const [privkeyRef, setPrivkeyRef] = useState<Uint8Array | null>(null);
  const [hasStoredNostrKey, setHasStoredNostrKey] = useState(false);

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
          const hasNostrKey = await keyManager.hasStoredKey();
          setHasStoredNostrKey(hasNostrKey);

          if (storedJwt && !isJwtExpired(storedJwt)) {
            // Check if user also has a Nostr key stored (added after Google login)
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
              connections: [],
            });
            fetchProfile(storedJwt).then(profile => setState(prev => applyProfileSnapshot(prev, profile)));
          } else {
            // JWT expired — need to re-login with Google (no refresh token in v1)
            setState({ ...emptyState('expired'), loginMethod: 'google', googleProfile });
          }
          return;
        }

        // --- Nostr startup path: only auto-login if last session was Nostr ---
        if (loginMethod !== 'nostr') {
          setState(emptyState('onboarding'));
          return;
        }

        const hasKey = await keyManager.hasStoredKey();
        setHasStoredNostrKey(hasKey);
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
          setState({ status: 'authenticated', jwt: storedJwt, pubkey, metadata, loginMethod: 'nostr', googleProfile: null, connections: [] });
          fetchProfile(storedJwt).then(profile => setState(prev => applyProfileSnapshot(prev, profile)));
          return;
        }

        // JWT missing or expired — silent re-auth (no additional biometric)
        const auth = await authenticateNostr(privkey, API_BASE_URL);
        await SecureStore.setItemAsync(JWT_STORAGE_KEY, auth.jwt);
        if (auth.metadata) await SecureStore.setItemAsync('limbo_metadata', JSON.stringify(auth.metadata));
        setState({ status: 'authenticated', jwt: auth.jwt, pubkey: auth.pubkey, metadata: auth.metadata, loginMethod: 'nostr', googleProfile: null, connections: [] });
        fetchProfile(auth.jwt).then(profile => setState(prev => applyProfileSnapshot(prev, profile)));
      } catch (err) {
        console.error('Auth startup failed:', err);
        const hasKey = await keyManager.hasStoredKey().catch(() => false);
        const loginMethod = await SecureStore.getItemAsync(LOGIN_METHOD_KEY) as LoginMethod | null;
        setHasStoredNostrKey(hasKey);
        setState({
          status: hasKey ? 'expired' : 'onboarding',
          jwt: null,
          pubkey: null,
          metadata: null,
          loginMethod,
          googleProfile: null,
          connections: [],
        });
      }
    })();
  }, [keyManager]);

  // --- Post-login biometric unlock for Google users with existing local key ---
  // Face ID can't trigger during the Google OAuth callback (browser still dismissing).
  // This effect fires after state is set and the app is foregrounded.

  useEffect(() => {
    if (state.status !== 'authenticated' || state.loginMethod !== 'google' || privkeyRef) return;

    (async () => {
      const hasKey = await keyManager.hasStoredKey();
      if (!hasKey) return;

      try {
        const pk = await keyManager.getMasterPrivkey();
        if (!pk) return;

        setPrivkeyRef(pk);
        const pubkey = KeyManager.pubkeyFromPrivkey(pk);
        setState(prev => ({ ...prev, pubkey }));

        // Link the Nostr key to the Google account on the backend (merges accounts + repos)
        if (state.jwt) {
          const signedEvent = signChallenge(pk, `link-nostr:${Date.now()}`);
          const resp = await fetch(ENDPOINTS.linkNostr, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${state.jwt}`,
            },
            body: JSON.stringify({ signedEvent }),
          });
          const data = await resp.json();
          if (resp.ok && data.token) {
            await SecureStore.setItemAsync(JWT_STORAGE_KEY, data.token);
            setState(prev => ({ ...prev, jwt: data.token, pubkey }));
          }
        }
      } catch (err) {
        console.warn('Post-login biometric unlock / link-nostr failed:', err);
      }
    })();
  }, [state.status, state.loginMethod, privkeyRef, keyManager]);

  // --- Login with Nostr key: store key + authenticate ---

  const completeNostrLogin = useCallback(
    async (privkey: Uint8Array) => {
      setPrivkeyRef(privkey);
      const { jwt, pubkey, metadata } = await authenticateNostr(privkey, API_BASE_URL);
      await SecureStore.setItemAsync(JWT_STORAGE_KEY, jwt);
      await SecureStore.setItemAsync(LOGIN_METHOD_KEY, 'nostr');
      if (metadata) await SecureStore.setItemAsync('limbo_metadata', JSON.stringify(metadata));
      setHasStoredNostrKey(true);
      setState({ status: 'authenticated', jwt, pubkey, metadata, loginMethod: 'nostr', googleProfile: null, connections: [] });
      fetchProfile(jwt).then(profile => setState(prev => applyProfileSnapshot(prev, profile)));
    },
    [],
  );

  const login = useCallback(
    async (privkey: Uint8Array) => {
      await keyManager.storeMasterPrivkey(privkey);
      await completeNostrLogin(privkey);
    },
    [completeNostrLogin, keyManager],
  );

  const loginWithStoredNostr = useCallback(async () => {
    const privkey = await keyManager.getMasterPrivkey();
    if (!privkey) {
      throw new Error('No stored Nostr key found on this device');
    }
    // Avoid re-writing the same key with requireAuthentication,
    // which can trigger a second biometric prompt.
    await completeNostrLogin(privkey);
  }, [completeNostrLogin, keyManager]);

  // --- Login with Google: exchange access token for Limbo JWT ---

  const loginWithGoogle = useCallback(
    async (accessToken: string) => {
      const resp = await fetch(ENDPOINTS.googleToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, userType: 'patient' }),
      });
      const data = await resp.json();
      if (data.status !== 'OK') throw new Error(data.reason || 'Google login failed');

      const googleProfile: GoogleProfile = {
        email: data.user.email,
        name: data.user.name,
        picture: data.user.picture,
        googleId: data.user.googleId,
      };
      const { firstName, lastName } = splitDisplayName(googleProfile.name);
      const seededMetadata = buildMetadataWithNames(null, firstName, lastName);

      await SecureStore.setItemAsync(JWT_STORAGE_KEY, data.token);
      await SecureStore.setItemAsync(LOGIN_METHOD_KEY, 'google');
      await SecureStore.setItemAsync(GOOGLE_PROFILE_KEY, JSON.stringify(googleProfile));
      if (seededMetadata) {
        await SecureStore.setItemAsync('limbo_metadata', JSON.stringify(seededMetadata));
      }

      // Auto-generate a Nostr keypair only on truly first Google login
      // (no key on backend AND no local key). If backend already has a pubkey
      // but local Keychain is empty (e.g. after logout), the user must re-import.
      let pubkey: string | null = data.nostrPubkey || null;
      const hasLocalKey = await keyManager.hasStoredKey();

      if (!hasLocalKey && !data.nostrPubkey) {
        const privkey = secp256k1.utils.randomSecretKey();
        await keyManager.storeMasterPrivkey(privkey);
        setPrivkeyRef(privkey);
        pubkey = KeyManager.pubkeyFromPrivkey(privkey);

        // Link the new key to the Google account on the backend
        try {
          const signedEvent = signChallenge(privkey, `link-nostr:${Date.now()}`);
          await fetch(ENDPOINTS.linkNostr, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${data.token}`,
            },
            body: JSON.stringify({ signedEvent }),
          });
        } catch (err) {
          console.warn('Failed to link auto-generated key to backend:', err);
        }
      }

      setState({
        status: 'authenticated',
        jwt: data.token,
        pubkey,
        metadata: seededMetadata,
        loginMethod: 'google',
        googleProfile,
        connections: [],
      });
      fetchProfile(data.token).then(profile => setState(prev => applyProfileSnapshot(prev, profile)));
    },
    [keyManager],
  );

  // --- Store Nostr key for Google user (for encryption) ---

  const storeNostrKey = useCallback(
    async (privkey: Uint8Array) => {
      const pubkey = KeyManager.pubkeyFromPrivkey(privkey);

      // If Google-authenticated, link Nostr key on the backend (merges accounts)
      if (state.loginMethod === 'google' && state.jwt) {
        const signedEvent = signChallenge(privkey, `link-nostr:${Date.now()}`);
        const resp = await fetch(ENDPOINTS.linkNostr, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${state.jwt}`,
          },
          body: JSON.stringify({ signedEvent }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.reason || 'Failed to link Nostr key');

        // Save fresh JWT that now includes pubkey claim
        if (data.token) {
          await SecureStore.setItemAsync(JWT_STORAGE_KEY, data.token);
          setState(prev => ({ ...prev, jwt: data.token, pubkey }));
        }
      }

      // Store key locally regardless
      await keyManager.storeMasterPrivkey(privkey);
      setPrivkeyRef(privkey);
      setHasStoredNostrKey(true);

      setState(prev => ({
        ...prev,
        pubkey,
      }));
    },
    [keyManager, state.loginMethod, state.jwt],
  );

  // --- Logout: clear session but keep encryption key in Keychain ---

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(JWT_STORAGE_KEY);
    await SecureStore.deleteItemAsync('limbo_metadata');
    await SecureStore.deleteItemAsync(LOGIN_METHOD_KEY);
    await SecureStore.deleteItemAsync(GOOGLE_PROFILE_KEY);
    setPrivkeyRef(null);
    setState(emptyState('onboarding'));
  }, []);

  // --- Update metadata (display name, etc.) ---

  const updateMetadata = useCallback(async (partial: Partial<NostrMetadata>) => {
    const current = state.metadata || {};
    const updated = { ...current, ...partial };
    // If name was cleared to empty string, remove the key so fallbacks work
    if ('name' in partial && !partial.name) {
      delete updated.name;
    }
    await SecureStore.setItemAsync('limbo_metadata', JSON.stringify(updated));
    setState(prev => ({ ...prev, metadata: updated }));
  }, [state.metadata]);

  // --- Delete account: backend + local cleanup ---

  const deleteAccount = useCallback(async () => {
    if (!state.jwt) throw new Error('Not authenticated');

    const resp = await fetch(ENDPOINTS.deleteAccount, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${state.jwt}` },
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.reason || 'Failed to delete account');
    }

    // Backend succeeded — safe to clean up locally
    try {
      await keyManager.deleteMasterPrivkey();
    } catch (err) {
      console.warn('Failed to delete master privkey from Keychain:', err);
    }

    await SecureStore.deleteItemAsync(JWT_STORAGE_KEY);
    await SecureStore.deleteItemAsync('limbo_metadata');
    await SecureStore.deleteItemAsync(LOGIN_METHOD_KEY);
    await SecureStore.deleteItemAsync(GOOGLE_PROFILE_KEY);
    setHasStoredNostrKey(false);

    setPrivkeyRef(null);
    setState(emptyState('onboarding'));
  }, [state.jwt, keyManager]);

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
    setState({ status: 'authenticated', jwt, pubkey, metadata, loginMethod: 'nostr', googleProfile: null, connections: [] });
    fetchProfile(jwt).then(profile => setState(prev => applyProfileSnapshot(prev, profile)));
  }, [keyManager, privkeyRef, state.loginMethod]);

  // --- Render ---

  const value = useMemo(
    () => ({
      state,
      privkey: privkeyRef,
      hasStoredNostrKey,
      login,
      loginWithGoogle,
      loginWithStoredNostr,
      storeNostrKey,
      logout,
      refreshAuth,
      updateMetadata,
      deleteAccount,
    }),
    [state, privkeyRef, hasStoredNostrKey, login, loginWithGoogle, loginWithStoredNostr, storeNostrKey, logout, refreshAuth, updateMetadata, deleteAccount],
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
