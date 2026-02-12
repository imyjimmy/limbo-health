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

// --- Constants ---

const JWT_STORAGE_KEY = 'limbo_jwt';

// --- Context ---

interface AuthContextValue {
  state: AuthState;
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
  });

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
          setState({ status: 'onboarding', jwt: null, pubkey: null });
          return;
        }

        // Key exists — check for stored JWT
        const storedJwt = await SecureStore.getItemAsync(JWT_STORAGE_KEY);
        if (storedJwt && !isJwtExpired(storedJwt)) {
          const pubkey = await keyManager.getMasterPubkey();
          setState({ status: 'authenticated', jwt: storedJwt, pubkey });
          return;
        }

        // JWT missing or expired — silent re-auth
        const privkey = await keyManager.getMasterPrivkey();
        if (!privkey) {
          setState({ status: 'onboarding', jwt: null, pubkey: null });
          return;
        }

        const { jwt, pubkey } = await authenticateNostr(privkey, API_BASE_URL);
        await SecureStore.setItemAsync(JWT_STORAGE_KEY, jwt);
        setState({ status: 'authenticated', jwt, pubkey });
      } catch (err) {
        console.error('Auth startup failed:', err);
        // If re-auth fails (network etc.), mark as expired so UI can retry
        const hasKey = await keyManager.hasStoredKey().catch(() => false);
        setState({
          status: hasKey ? 'expired' : 'onboarding',
          jwt: null,
          pubkey: null,
        });
      }
    })();
  }, [keyManager]);

  // --- Login: store key + authenticate ---

  const login = useCallback(
    async (privkey: Uint8Array) => {
      await keyManager.storeMasterPrivkey(privkey);
      const { jwt, pubkey } = await authenticateNostr(privkey, API_BASE_URL);
      await SecureStore.setItemAsync(JWT_STORAGE_KEY, jwt);
      setState({ status: 'authenticated', jwt, pubkey });
    },
    [keyManager],
  );

  // --- Logout: clear everything ---

  const logout = useCallback(async () => {
    await keyManager.deleteMasterPrivkey();
    await SecureStore.deleteItemAsync(JWT_STORAGE_KEY);
    setState({ status: 'onboarding', jwt: null, pubkey: null });
  }, [keyManager]);

  // --- Refresh: re-authenticate with stored key ---

  const refreshAuth = useCallback(async () => {
    const privkey = await keyManager.getMasterPrivkey();
    if (!privkey) {
      setState({ status: 'onboarding', jwt: null, pubkey: null });
      return;
    }
    const { jwt, pubkey } = await authenticateNostr(privkey, API_BASE_URL);
    await SecureStore.setItemAsync(JWT_STORAGE_KEY, jwt);
    setState({ status: 'authenticated', jwt, pubkey });
  }, [keyManager]);

  // --- Render ---

  const value = useMemo(
    () => ({ state, login, logout, refreshAuth }),
    [state, login, logout, refreshAuth],
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

    // Use TextDecoder on the raw bytes
    const bytes = Uint8Array.from(
      globalThis.atob(payload),
      (c) => c.charCodeAt(0),
    );
    const decoded = new TextDecoder().decode(bytes);
    const { exp } = JSON.parse(decoded);

    if (!exp) return false; // No expiry claim — treat as valid
    return Date.now() >= exp * 1000;
  } catch {
    return true; // If we can't parse it, treat as expired
  }
}