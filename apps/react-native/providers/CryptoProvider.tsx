// providers/CryptoProvider.tsx
// Provides encryption/decryption bound to the master key.
// Activates only after AuthProvider confirms authentication.
// Manages biometric-gated key access and EncryptedIO instance.

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
} from 'react';
import { KeyManager } from '../core/crypto/KeyManager';
import { EncryptedIO } from '../core/binder/EncryptedIO';
import { createFSAdapter } from '../core/git/fsAdapter';
import { clearAll as clearBinderCache } from '../core/binder/BinderCache';
import { useAuthContext } from './AuthProvider';

// --- Context ---

interface CryptoContextValue {
  ready: boolean;
  masterPubkey: string | null;
  createEncryptedIO: (repoDir: string) => EncryptedIO;
  masterConversationKey: Uint8Array | null;
}

const CryptoContext = createContext<CryptoContextValue | null>(null);

export function useCryptoContext(): CryptoContextValue {
  const ctx = useContext(CryptoContext);
  if (!ctx) throw new Error('useCryptoContext must be inside CryptoProvider');
  return ctx;
}

// --- Provider ---

export function CryptoProvider({ children }: { children: React.ReactNode }) {
  const { state: authState, privkey } = useAuthContext();
  const [masterConversationKey, setMasterConversationKey] =
    useState<Uint8Array | null>(null);
  const [masterPubkey, setMasterPubkey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // --- Activate when authenticated + privkey available (no Keychain read) ---

  useEffect(() => {
    if (authState.status !== 'authenticated' || !privkey) {
      setReady(false);
      setMasterConversationKey(null);
      setMasterPubkey(null);
      clearBinderCache();
      return;
    }

    try {
      const pubkey = KeyManager.pubkeyFromPrivkey(privkey);

      // Encrypt-to-self: conversation key with own pubkey
      const convKey = KeyManager.computeConversationKey(privkey, pubkey);

      setMasterPubkey(pubkey);
      setMasterConversationKey(convKey);
      setReady(true);
    } catch (err) {
      console.error('CryptoProvider init failed:', err);
      setReady(false);
    }
  }, [authState.status, privkey]);

  // --- Factory: creates EncryptedIO bound to a specific binder ---

  const createEncryptedIO = useMemo(() => {
    return (repoDir: string): EncryptedIO => {
      if (!masterConversationKey) {
        throw new Error('CryptoProvider not ready — no conversation key');
      }
      const fs = createFSAdapter(repoDir);
      return new EncryptedIO(fs, masterConversationKey, repoDir);
    };
  }, [masterConversationKey]);

  // --- Render ---

  const value = useMemo(
    () => ({ ready, masterPubkey, createEncryptedIO, masterConversationKey }),
    [ready, masterPubkey, createEncryptedIO, masterConversationKey],
  );

  return (
    <CryptoContext.Provider value={value}>
      {children}
    </CryptoContext.Provider>
  );
}