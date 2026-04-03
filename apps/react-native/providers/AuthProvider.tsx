// providers/AuthProvider.tsx
// Manages authentication state: JWT, pubkey, login/logout.
// Supports Nostr (biometric key) and OAuth providers (Google / Apple).
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
import type { AppleLoginPayload } from '../core/auth/appleAuth';
import type {
  AuthState,
  AuthStatus,
  LoginMethod,
  NostrMetadata,
  OAuthConnection,
  OAuthProfile,
  OAuthProvider,
} from '../types/auth';
import { decode as base64Decode } from '../core/crypto/base64';
import {
  clearLocalOnboardingComplete,
  markLocalOnboardingComplete,
  readLocalOnboardingComplete,
} from '../core/onboarding/storage';

// --- Constants ---

const JWT_STORAGE_KEY = 'limbo_jwt';
const LOGIN_METHOD_KEY = 'limbo_login_method';
const OAUTH_PROFILE_STORAGE_KEY = 'limbo_oauth_profile_v1';
const LEGACY_GOOGLE_PROFILE_KEY = 'limbo_google_profile';
const METADATA_STORAGE_KEY = 'limbo_metadata';
const STARTUP_SECURE_STORE_DELAY_MS = 350;
const BIO_PROFILE_STORAGE_KEY_PREFIX = 'limbo_bio_profile_v1';
const LAST_BINDER_KEY = 'limbo_last_binder';
const BINDER_TEXTURES_KEY = 'limbo_binder_card_textures_v1';
const DEV_RESET_MARKER_KEY = 'limbo_dev_reset_consumed_v1';
const DEV_RESET_LOCAL_STATE_TOKEN =
  __DEV__ && typeof process.env.EXPO_PUBLIC_RESET_LOCAL_STATE === 'string'
    ? process.env.EXPO_PUBLIC_RESET_LOCAL_STATE.trim()
    : '';

// --- Context ---

interface AuthContextValue {
  state: AuthState;
  needsOnboarding: boolean;
  /** Master privkey held in memory after biometric unlock. Never persisted in plaintext. */
  privkey: Uint8Array | null;
  /** True if a Nostr key already exists in local secure storage. */
  hasStoredNostrKey: boolean;
  login: (privkey: Uint8Array) => Promise<void>;
  loginWithGoogle: (accessToken: string) => Promise<void>;
  loginWithApple: (payload: AppleLoginPayload) => Promise<void>;
  /** Authenticate using an already stored Nostr key (biometric-gated read). */
  loginWithStoredNostr: () => Promise<void>;
  /** Store a Nostr key for an already-authenticated OAuth user (for encryption). */
  storeNostrKey: (privkey: Uint8Array) => Promise<void>;
  logout: () => Promise<void>;
  resetLocalAppState: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
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
  return { status, jwt: null, pubkey: null, metadata: null, loginMethod: null, oauthProfile: null, connections: [] };
}

interface ProfileSnapshot {
  connections: OAuthConnection[];
  nostrPubkey: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface OAuthTokenExchangeResponse {
  status: string;
  reason?: string;
  token: string;
  nostrPubkey?: string | null;
  user?: {
    provider?: string | null;
    providerUserId?: string | null;
    email?: string | null;
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    picture?: string | null;
  };
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isOAuthProvider(value: unknown): value is OAuthProvider {
  return value === 'google' || value === 'apple';
}

function isOAuthLoginMethod(value: unknown): value is OAuthProvider {
  return isOAuthProvider(value);
}

function buildOAuthOwnerKey(
  provider: string | null | undefined,
  kind: 'id' | 'email',
  value: string | null | undefined,
): string | null {
  const normalizedProvider = asNonEmptyString(provider)?.toLowerCase();
  const normalizedValue = asNonEmptyString(value);

  if (!normalizedProvider || !normalizedValue) return null;
  return `${normalizedProvider}-${kind}:${normalizedValue}`;
}

function normalizeOAuthProfile(
  value: Record<string, unknown> | null,
  fallbackProvider: OAuthProvider | null = null,
): OAuthProfile | null {
  if (!value) return null;

  const provider = (asNonEmptyString(value.provider)?.toLowerCase() ?? fallbackProvider) as
    | OAuthProvider
    | null;
  const providerUserId =
    asNonEmptyString(value.providerUserId) ?? asNonEmptyString(value.googleId);

  if (!provider || !isOAuthProvider(provider) || !providerUserId) {
    return null;
  }

  return {
    provider,
    providerUserId,
    email: asNonEmptyString(value.email),
    name: asNonEmptyString(value.name) ?? undefined,
    picture: asNonEmptyString(value.picture) ?? undefined,
  };
}

async function readStoredOAuthProfile(
  expectedProvider: OAuthProvider | null = null,
): Promise<OAuthProfile | null> {
  const storedOauthProfile = parseJsonSafe<Record<string, unknown>>(
    await secureStoreGetSafe(OAUTH_PROFILE_STORAGE_KEY),
    OAUTH_PROFILE_STORAGE_KEY,
  );
  const normalizedOauthProfile = normalizeOAuthProfile(storedOauthProfile, expectedProvider);
  if (normalizedOauthProfile) {
    return normalizedOauthProfile;
  }

  const legacyGoogleProfile = parseJsonSafe<Record<string, unknown>>(
    await secureStoreGetSafe(LEGACY_GOOGLE_PROFILE_KEY),
    LEGACY_GOOGLE_PROFILE_KEY,
  );
  return normalizeOAuthProfile(legacyGoogleProfile, 'google');
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function secureStoreGetSafe(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (err) {
    console.warn(`[AuthProvider] SecureStore get failed for "${key}"`, err);
    return null;
  }
}

async function secureStoreSetSafe(key: string, value: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(key, value);
    return true;
  } catch (err) {
    console.warn(`[AuthProvider] SecureStore set failed for "${key}"`, err);
    return false;
  }
}

async function secureStoreDeleteSafe(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (err) {
    console.warn(`[AuthProvider] SecureStore delete failed for "${key}"`, err);
  }
}

function parseJsonSafe<T>(raw: string | null, label: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[AuthProvider] Failed to parse "${label}" JSON`, err);
    return null;
  }
}

function parseJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;

    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';

    const bytes = base64Decode(payload);
    const decoded = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(decoded) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function bioStorageKeyForOwner(ownerKey: string): string {
  const encodedOwner = encodeURIComponent(ownerKey).replace(/%/g, '_');
  return `${BIO_PROFILE_STORAGE_KEY_PREFIX}.${encodedOwner}`;
}

function addBioStorageKeyCandidate(candidateKeys: Set<string>, ownerKey: string | null): void {
  if (!ownerKey) return;
  candidateKeys.add(bioStorageKeyForOwner(ownerKey));
}

interface ClearLocalAppStateOptions {
  keyManager: KeyManager;
  currentState?: AuthState | null;
  devResetToken?: string;
}

async function clearLocalAppStateStorage({
  keyManager,
  currentState,
  devResetToken,
}: ClearLocalAppStateOptions): Promise<void> {
  const storedJwt = await secureStoreGetSafe(JWT_STORAGE_KEY);
  const oauthProfile = await readStoredOAuthProfile();
  const jwtPayload = storedJwt ? parseJwtPayload(storedJwt) : null;
  const candidateBioKeys = new Set<string>();
  const stateOauthProfile = currentState?.oauthProfile ?? null;
  const storedPubkey = asNonEmptyString(jwtPayload?.pubkey);

  addBioStorageKeyCandidate(
    candidateBioKeys,
    currentState?.pubkey ? `nostr:${currentState.pubkey}` : null,
  );
  addBioStorageKeyCandidate(
    candidateBioKeys,
    buildOAuthOwnerKey(stateOauthProfile?.provider, 'id', stateOauthProfile?.providerUserId),
  );
  addBioStorageKeyCandidate(
    candidateBioKeys,
    buildOAuthOwnerKey(stateOauthProfile?.provider, 'email', stateOauthProfile?.email),
  );
  addBioStorageKeyCandidate(
    candidateBioKeys,
    storedPubkey ? `nostr:${storedPubkey}` : null,
  );
  addBioStorageKeyCandidate(
    candidateBioKeys,
    buildOAuthOwnerKey(oauthProfile?.provider, 'id', oauthProfile?.providerUserId),
  );
  addBioStorageKeyCandidate(
    candidateBioKeys,
    buildOAuthOwnerKey(oauthProfile?.provider, 'email', oauthProfile?.email),
  );

  await Promise.all([
    secureStoreDeleteSafe(JWT_STORAGE_KEY),
    secureStoreDeleteSafe(METADATA_STORAGE_KEY),
    secureStoreDeleteSafe(LOGIN_METHOD_KEY),
    secureStoreDeleteSafe(OAUTH_PROFILE_STORAGE_KEY),
    secureStoreDeleteSafe(LEGACY_GOOGLE_PROFILE_KEY),
    secureStoreDeleteSafe(LAST_BINDER_KEY),
    secureStoreDeleteSafe(BINDER_TEXTURES_KEY),
    ...Array.from(candidateBioKeys, key => secureStoreDeleteSafe(key)),
  ]);

  try {
    await keyManager.deleteMasterPrivkey();
  } catch (err) {
    console.warn('[AuthProvider] Failed to delete stored Nostr key during local reset', err);
  }

  await clearLocalOnboardingComplete();

  if (devResetToken) {
    await secureStoreSetSafe(DEV_RESET_MARKER_KEY, devResetToken);
  }
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
  const [needsOnboarding, setNeedsOnboarding] = useState(true);
  const [privkeyRef, setPrivkeyRef] = useState<Uint8Array | null>(null);
  const [hasStoredNostrKey, setHasStoredNostrKey] = useState(false);

  const keyManager = useMemo(
    () => new KeyManager(SecureStore),
    [],
  );

  // --- Startup: check for stored credentials ---

  useEffect(() => {
    let cancelled = false;

    const setStateSafe = (next: AuthState): void => {
      if (!cancelled) setState(next);
    };

    const setPrivkeySafe = (next: Uint8Array | null): void => {
      if (!cancelled) setPrivkeyRef(next);
    };

    const setHasStoredNostrKeySafe = (next: boolean): void => {
      if (!cancelled) setHasStoredNostrKey(next);
    };

    const setNeedsOnboardingSafe = (next: boolean): void => {
      if (!cancelled) setNeedsOnboarding(next);
    };

    const hasStoredKeySafe = async (): Promise<boolean> => {
      try {
        return await keyManager.hasStoredKey();
      } catch (err) {
        console.warn('[AuthProvider] hasStoredKey failed during startup', err);
        return false;
      }
    };

    const getMasterPrivkeySafe = async (): Promise<Uint8Array | null> => {
      try {
        return await keyManager.getMasterPrivkey();
      } catch (err) {
        console.warn('[AuthProvider] getMasterPrivkey failed during startup', err);
        return null;
      }
    };

    const maybeResetLocalStateForDevelopment = async (): Promise<boolean> => {
      if (!DEV_RESET_LOCAL_STATE_TOKEN) return false;

      const consumedToken = await secureStoreGetSafe(DEV_RESET_MARKER_KEY);
      if (consumedToken === DEV_RESET_LOCAL_STATE_TOKEN) return false;

      await clearLocalAppStateStorage({
        keyManager,
        devResetToken: DEV_RESET_LOCAL_STATE_TOKEN,
      });
      return true;
    };

    (async () => {
      let startupLoginMethod: LoginMethod | null = null;

      try {
        // Delay first SecureStore access slightly to avoid launch-window crashes
        // seen on specific iOS patch builds with TurboModule startup pressure.
        await sleep(STARTUP_SECURE_STORE_DELAY_MS);
        if (cancelled) return;

        const resetRan = await maybeResetLocalStateForDevelopment();
        if (resetRan) {
          setPrivkeySafe(null);
          setHasStoredNostrKeySafe(false);
          setNeedsOnboardingSafe(true);
          setStateSafe(emptyState('onboarding'));
          return;
        }

        const onboardingComplete = await readLocalOnboardingComplete();
        setNeedsOnboardingSafe(!onboardingComplete);

        const storedLoginMethod = await secureStoreGetSafe(LOGIN_METHOD_KEY);
        startupLoginMethod = storedLoginMethod === 'nostr' || isOAuthLoginMethod(storedLoginMethod)
          ? storedLoginMethod
          : null;

        if (isOAuthLoginMethod(startupLoginMethod)) {
          // --- OAuth startup path ---
          const storedJwt = await secureStoreGetSafe(JWT_STORAGE_KEY);
          const oauthProfile = await readStoredOAuthProfile(startupLoginMethod);
          const hasNostrKey = await hasStoredKeySafe();
          setHasStoredNostrKeySafe(hasNostrKey);

          if (storedJwt && !isJwtExpired(storedJwt)) {
            // Check if user also has a Nostr key stored (added after OAuth login)
            let pubkey: string | null = null;
            if (hasNostrKey) {
              const privkey = await getMasterPrivkeySafe();
              if (privkey) {
                setPrivkeySafe(privkey);
                pubkey = KeyManager.pubkeyFromPrivkey(privkey);
              }
            }

            const cachedMeta = await secureStoreGetSafe(METADATA_STORAGE_KEY);
            const metadata = parseJsonSafe<NostrMetadata>(cachedMeta, METADATA_STORAGE_KEY);
            setStateSafe({
              status: 'authenticated',
              jwt: storedJwt,
              pubkey,
              metadata,
              loginMethod: startupLoginMethod,
              oauthProfile,
              connections: [],
            });
            fetchProfile(storedJwt).then((profile) => {
              if (cancelled) return;
              setState(prev => applyProfileSnapshot(prev, profile));
            });
          } else {
            // JWT expired — OAuth users need to re-auth interactively in v1.
            setStateSafe({ ...emptyState('expired'), loginMethod: startupLoginMethod, oauthProfile });
          }
          return;
        }

        // --- Nostr startup path: only auto-login if last session was Nostr ---
        if (startupLoginMethod !== 'nostr') {
          setHasStoredNostrKeySafe(false);
          setStateSafe(emptyState('onboarding'));
          return;
        }

        const hasKey = await hasStoredKeySafe();
        setHasStoredNostrKeySafe(hasKey);
        if (!hasKey) {
          setStateSafe(emptyState('onboarding'));
          return;
        }

        // Key exists — single biometric unlock to get privkey
        const privkey = await getMasterPrivkeySafe();
        if (!privkey) {
          setStateSafe(emptyState('onboarding'));
          return;
        }
        setPrivkeySafe(privkey);
        const pubkey = KeyManager.pubkeyFromPrivkey(privkey);

        // Check for stored JWT
        const storedJwt = await secureStoreGetSafe(JWT_STORAGE_KEY);
        if (storedJwt && !isJwtExpired(storedJwt)) {
          const cachedMeta = await secureStoreGetSafe(METADATA_STORAGE_KEY);
          const metadata = parseJsonSafe<NostrMetadata>(cachedMeta, METADATA_STORAGE_KEY);
          setStateSafe({ status: 'authenticated', jwt: storedJwt, pubkey, metadata, loginMethod: 'nostr', oauthProfile: null, connections: [] });
          fetchProfile(storedJwt).then((profile) => {
            if (cancelled) return;
            setState(prev => applyProfileSnapshot(prev, profile));
          });
          return;
        }

        // JWT missing or expired — silent re-auth (no additional biometric)
        const auth = await authenticateNostr(privkey, API_BASE_URL);
        await secureStoreSetSafe(JWT_STORAGE_KEY, auth.jwt);
        if (auth.metadata) await secureStoreSetSafe(METADATA_STORAGE_KEY, JSON.stringify(auth.metadata));
        setStateSafe({ status: 'authenticated', jwt: auth.jwt, pubkey: auth.pubkey, metadata: auth.metadata, loginMethod: 'nostr', oauthProfile: null, connections: [] });
        fetchProfile(auth.jwt).then((profile) => {
          if (cancelled) return;
          setState(prev => applyProfileSnapshot(prev, profile));
        });
      } catch (err) {
        console.error('Auth startup failed:', err);
        setHasStoredNostrKeySafe(false);
        setNeedsOnboardingSafe(true);
        if (isOAuthLoginMethod(startupLoginMethod)) {
          setStateSafe({ ...emptyState('expired'), loginMethod: startupLoginMethod });
          return;
        }
        setStateSafe(emptyState('onboarding'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [keyManager]);

  // --- Post-login biometric unlock for OAuth users with an existing local key ---
  // Face ID can't trigger while the system auth sheet/browser is still dismissing.
  // This effect fires after state is set and the app is foregrounded.

  useEffect(() => {
    if (state.status !== 'authenticated' || state.loginMethod === 'nostr' || !state.loginMethod || privkeyRef) return;

    (async () => {
      const hasKey = await keyManager.hasStoredKey();
      if (!hasKey) return;
      setHasStoredNostrKey(true);

      try {
        const pk = await keyManager.getMasterPrivkey();
        if (!pk) return;

        setPrivkeyRef(pk);
        const pubkey = KeyManager.pubkeyFromPrivkey(pk);
        setState(prev => ({ ...prev, pubkey }));

        // Link the Nostr key to the OAuth account on the backend (merges accounts + repos)
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
            fetchProfile(data.token).then(profile => {
              setState(prev => applyProfileSnapshot(prev, profile));
            });
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
      if (metadata) await SecureStore.setItemAsync(METADATA_STORAGE_KEY, JSON.stringify(metadata));
      setHasStoredNostrKey(true);
      setState({ status: 'authenticated', jwt, pubkey, metadata, loginMethod: 'nostr', oauthProfile: null, connections: [] });
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

  // --- Login with OAuth: exchange provider token for Limbo JWT ---

  const loginWithOAuth = useCallback(
    async (
      endpoint: string,
      provider: OAuthProvider,
      body: Record<string, unknown>,
      fallbackPicture?: string | null,
    ) => {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await resp.json()) as OAuthTokenExchangeResponse;
      if (data.status !== 'OK' || !data.user) {
        throw new Error(data.reason || `${provider} login failed`);
      }

      const oauthProfile: OAuthProfile = {
        provider,
        providerUserId:
          asNonEmptyString(data.user.providerUserId) ??
          (() => {
            throw new Error(`Missing ${provider} user identifier`);
          })(),
        email: asNonEmptyString(data.user.email),
        name: asNonEmptyString(data.user.name) ?? undefined,
        picture:
          asNonEmptyString(data.user.picture) ??
          asNonEmptyString(fallbackPicture) ??
          undefined,
      };
      const returnedFirstName = asNonEmptyString(data.user.firstName);
      const returnedLastName = asNonEmptyString(data.user.lastName);
      const splitName = splitDisplayName(oauthProfile.name);
      const firstName = returnedFirstName ?? splitName.firstName;
      const lastName = returnedLastName ?? splitName.lastName;
      const seededMetadata = buildMetadataWithNames(null, firstName, lastName);

      await SecureStore.setItemAsync(JWT_STORAGE_KEY, data.token);
      await SecureStore.setItemAsync(LOGIN_METHOD_KEY, provider);
      await SecureStore.setItemAsync(OAUTH_PROFILE_STORAGE_KEY, JSON.stringify(oauthProfile));
      await secureStoreDeleteSafe(LEGACY_GOOGLE_PROFILE_KEY);
      if (seededMetadata) {
        await SecureStore.setItemAsync(METADATA_STORAGE_KEY, JSON.stringify(seededMetadata));
      }

      // Auto-generate a Nostr keypair only on truly first OAuth login
      // (no key on backend AND no local key). If backend already has a pubkey
      // but local Keychain is empty (e.g. after logout), the user must re-import.
      let pubkey: string | null = data.nostrPubkey || null;
      const hasLocalKey = await keyManager.hasStoredKey();
      setHasStoredNostrKey(hasLocalKey);

      if (!hasLocalKey && !data.nostrPubkey) {
        const privkey = secp256k1.utils.randomSecretKey();
        await keyManager.storeMasterPrivkey(privkey);
        setPrivkeyRef(privkey);
        setHasStoredNostrKey(true);
        pubkey = KeyManager.pubkeyFromPrivkey(privkey);

        // Link the new key to the OAuth account on the backend.
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
        loginMethod: provider,
        oauthProfile,
        connections: [],
      });
      fetchProfile(data.token).then(profile => setState(prev => applyProfileSnapshot(prev, profile)));
    },
    [keyManager],
  );

  const loginWithGoogle = useCallback(
    async (accessToken: string) => {
      await loginWithOAuth(
        ENDPOINTS.googleToken,
        'google',
        { accessToken, userType: 'patient' },
      );
    },
    [loginWithOAuth],
  );

  const loginWithApple = useCallback(
    async (payload: AppleLoginPayload) => {
      await loginWithOAuth(
        ENDPOINTS.appleToken,
        'apple',
        { ...payload, userType: 'patient' },
      );
    },
    [loginWithOAuth],
  );

  // --- Store Nostr key for OAuth users (for encryption) ---

  const storeNostrKey = useCallback(
    async (privkey: Uint8Array) => {
      const pubkey = KeyManager.pubkeyFromPrivkey(privkey);

      // If OAuth-authenticated, link Nostr key on the backend (merges accounts)
      if (state.loginMethod && state.loginMethod !== 'nostr' && state.jwt) {
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
          fetchProfile(data.token).then(profile => {
            setState(prev => applyProfileSnapshot(prev, profile));
          });
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
    await SecureStore.deleteItemAsync(METADATA_STORAGE_KEY);
    await SecureStore.deleteItemAsync(LOGIN_METHOD_KEY);
    await SecureStore.deleteItemAsync(OAUTH_PROFILE_STORAGE_KEY);
    await SecureStore.deleteItemAsync(LEGACY_GOOGLE_PROFILE_KEY);
    setPrivkeyRef(null);
    setState(emptyState('onboarding'));
  }, []);

  const resetLocalAppState = useCallback(async () => {
    await clearLocalAppStateStorage({
      keyManager,
      currentState: state,
    });
    setHasStoredNostrKey(false);
    setNeedsOnboarding(true);
    setPrivkeyRef(null);
    setState(emptyState('onboarding'));
  }, [keyManager, state]);

  const completeOnboarding = useCallback(async () => {
    await markLocalOnboardingComplete();
    setNeedsOnboarding(false);
  }, []);

  // --- Update metadata (display name, etc.) ---

  const updateMetadata = useCallback(async (partial: Partial<NostrMetadata>) => {
    const current = state.metadata || {};
    const updated = { ...current, ...partial };
    // If name was cleared to empty string, remove the key so fallbacks work
    if ('name' in partial && !partial.name) {
      delete updated.name;
    }
    await SecureStore.setItemAsync(METADATA_STORAGE_KEY, JSON.stringify(updated));
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
    await clearLocalAppStateStorage({
      keyManager,
      currentState: state,
    });
    setHasStoredNostrKey(false);
    setNeedsOnboarding(true);
    setPrivkeyRef(null);
    setState(emptyState('onboarding'));
  }, [state.jwt, keyManager]);

  // --- Refresh: re-authenticate with stored key ---

  const refreshAuth = useCallback(async () => {
    if (state.loginMethod && state.loginMethod !== 'nostr') {
      // OAuth users can't silently re-auth in v1 — mark expired.
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
    if (metadata) await SecureStore.setItemAsync(METADATA_STORAGE_KEY, JSON.stringify(metadata));
    setState({ status: 'authenticated', jwt, pubkey, metadata, loginMethod: 'nostr', oauthProfile: null, connections: [] });
    fetchProfile(jwt).then(profile => setState(prev => applyProfileSnapshot(prev, profile)));
  }, [keyManager, privkeyRef, state.loginMethod]);

  // --- Render ---

  const value = useMemo(
    () => ({
      state,
      needsOnboarding,
      privkey: privkeyRef,
      hasStoredNostrKey,
      login,
      loginWithGoogle,
      loginWithApple,
      loginWithStoredNostr,
      storeNostrKey,
      logout,
      resetLocalAppState,
      completeOnboarding,
      refreshAuth,
      updateMetadata,
      deleteAccount,
    }),
    [state, needsOnboarding, privkeyRef, hasStoredNostrKey, login, loginWithGoogle, loginWithApple, loginWithStoredNostr, storeNostrKey, logout, resetLocalAppState, completeOnboarding, refreshAuth, updateMetadata, deleteAccount],
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
