// providers/AuthProvider.tsx
// Manages authentication state: JWT, pubkey, login/logout.
// Reads JWT from expo-secure-store on startup.
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
import { API_BASE_URL } from '../constants/api';
import type { AuthState, AuthStatus } from '../types/auth';
import { decode as base64Decode } from '../core/crypto/base64';

// --- Constants ---

const JWT_STORAGE_KEY = 'limbo_jwt';

// --- Context ---

interface AuthContextValue {
  state: AuthState;
  /** Master privkey held in memory after biometric unlock. Never persisted in plaintext. */
  privkey: Uint8Array | null;
  login: (privkey: Uint8Array) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be inside AuthProvider');
  return ctx;
}

// --- Provider ---

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    jwt: null,
    pubkey: null,
    metadata: null,
  });
  const [privkeyRef, setPrivkeyRef] = useState<Uint8Array | null>(null);

  const keyManager = useMemo(
    () => new KeyManager(SecureStore),
    [],
  );

  // --- Startup: check for stored credentials ---

  useEffect(() => {
    (async () => {
      try {
        const hasKey = await keyManager.hasStoredKey();
        if (!hasKey) {
          setState({ status: 'onboarding', jwt: null, pubkey: null, metadata: null });
          return;
        }

        // Key exists — single biometric unlock to get privkey
        const privkey = await keyManager.getMasterPrivkey();
        if (!privkey) {
          setState({ status: 'onboarding', jwt: null, pubkey: null, metadata: null });
          return;
        }
        setPrivkeyRef(privkey);
        const pubkey = KeyManager.pubkeyFromPrivkey(privkey);

        // Check for stored JWT
        const storedJwt = await SecureStore.getItemAsync(JWT_STORAGE_KEY);
        if (storedJwt && !isJwtExpired(storedJwt)) {
          const cachedMeta = await SecureStore.getItemAsync('limbo_metadata');
          const metadata = cachedMeta ? JSON.parse(cachedMeta) : null;
          setState({ status: 'authenticated', jwt: storedJwt, pubkey, metadata });
          return;
        }

        // JWT missing or expired — silent re-auth (no additional biometric)
        const auth = await authenticateNostr(privkey, API_BASE_URL);
        await SecureStore.setItemAsync(JWT_STORAGE_KEY, auth.jwt);
        if (auth.metadata) await SecureStore.setItemAsync('limbo_metadata', JSON.stringify(auth.metadata));
        setState({ status: 'authenticated', jwt: auth.jwt, pubkey: auth.pubkey, metadata: auth.metadata });
      } catch (err) {
        console.error('Auth startup failed:', err);
        // If re-auth fails (network etc.), mark as expired so UI can retry
        const hasKey = await keyManager.hasStoredKey().catch(() => false);
        setState({
          status: hasKey ? 'expired' : 'onboarding',
          jwt: null,
          pubkey: null,
          metadata: null
        });
      }
    })();
  }, [keyManager]);

  // --- Login: store key + authenticate ---

  const login = useCallback(
    async (privkey: Uint8Array) => {
      await keyManager.storeMasterPrivkey(privkey);
      setPrivkeyRef(privkey);
      const { jwt, pubkey, metadata } = await authenticateNostr(privkey, API_BASE_URL);
      await SecureStore.setItemAsync(JWT_STORAGE_KEY, jwt);
      if (metadata) await SecureStore.setItemAsync('limbo_metadata', JSON.stringify(metadata));
      setState({ status: 'authenticated', jwt, pubkey, metadata });
    },
    [keyManager],
  );

  // --- Logout: clear everything ---

  const logout = useCallback(async () => {
    await keyManager.deleteMasterPrivkey();
    await SecureStore.deleteItemAsync(JWT_STORAGE_KEY);
    await SecureStore.deleteItemAsync('limbo_metadata');
    setPrivkeyRef(null);
    setState({ status: 'onboarding', jwt: null, pubkey: null, metadata: null });
  }, [keyManager]);

  // --- Refresh: re-authenticate with stored key ---

  const refreshAuth = useCallback(async () => {
    // Prefer in-memory privkey; only hit Keychain (biometric) if not cached
    let privkey = privkeyRef;
    if (!privkey) {
      privkey = await keyManager.getMasterPrivkey();
      if (!privkey) {
        setState({ status: 'onboarding', jwt: null, pubkey: null, metadata: null });
        return;
      }
      setPrivkeyRef(privkey);
    }
    const { jwt, pubkey, metadata } = await authenticateNostr(privkey, API_BASE_URL);
    await SecureStore.setItemAsync(JWT_STORAGE_KEY, jwt);
    if (metadata) await SecureStore.setItemAsync('limbo_metadata', JSON.stringify(metadata));
    setState({ status: 'authenticated', jwt, pubkey, metadata });
  }, [keyManager, privkeyRef]);

  // --- Render ---

  const value = useMemo(
    () => ({ state, privkey: privkeyRef, login, logout, refreshAuth }),
    [state, privkeyRef, login, logout, refreshAuth],
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