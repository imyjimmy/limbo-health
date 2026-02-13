// hooks/useShareSession.ts
// Orchestrates the full share-with-doctor lifecycle:
// re-encrypt → push staging repo → create session → show QR → revoke on cancel.

import { useState, useCallback, useRef } from 'react';
import {
  reEncryptBinder,
  cleanupStaging,
} from '../core/scan/ReEncryptionPipeline';
import { pushStagingRepo } from '../core/scan/StagingRepo';
import {
  createScanSession,
  revokeScanSession,
} from '../core/scan/ScanSession';
import type { ScanQRPayload } from '../core/scan/ScanSession';
import type { ReEncryptionProgress } from '../core/scan/ReEncryptionPipeline';

// --- Types ---

export type SharePhase =
  | 'idle'
  | 're-encrypting'
  | 'pushing-staging'
  | 'creating-session'
  | 'showing-qr'
  | 'error';

export interface ShareState {
  phase: SharePhase;
  progress?: ReEncryptionProgress;
  qrPayload?: ScanQRPayload;
  error?: string;
}

// --- Hook ---

export function useShareSession(
  binderRepoDir: string,
  masterConversationKey: Uint8Array | null,
  jwt: string | null,
) {
  const [state, setState] = useState<ShareState>({ phase: 'idle' });
  const stagingDirRef = useRef<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);

  const startShare = useCallback(async () => {
    if (!masterConversationKey || !jwt) {
      setState({ phase: 'error', error: 'Not authenticated' });
      return;
    }

    try {
      // Step 1: Re-encrypt binder with ephemeral key
      setState({ phase: 're-encrypting' });

      const reEncryptResult = await reEncryptBinder(
        binderRepoDir,
        masterConversationKey,
        (progress) => {
          setState({ phase: 're-encrypting', progress });
        },
      );

      stagingDirRef.current = reEncryptResult.stagingDir;

      // Step 2: Push staging repo to server
      setState({ phase: 'pushing-staging' });

      const { repoId } = await pushStagingRepo(
        reEncryptResult.stagingDir,
        { type: 'jwt', token: jwt },
      );

      // Step 3: Create scan session and get QR payload
      setState({ phase: 'creating-session' });

      const qrPayload = await createScanSession(
        repoId,
        reEncryptResult.ephemeralPrivkey,
        jwt,
      );

      sessionTokenRef.current = qrPayload.sessionToken;

      // Step 4: Show QR
      setState({ phase: 'showing-qr', qrPayload });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setState({ phase: 'error', error: msg });
    }
  }, [binderRepoDir, masterConversationKey, jwt]);

  const cancel = useCallback(async () => {
    // Revoke session if one exists
    if (sessionTokenRef.current && jwt) {
      await revokeScanSession(sessionTokenRef.current, jwt).catch(() => {});
      sessionTokenRef.current = null;
    }

    // Clean up local staging directory
    if (stagingDirRef.current) {
      await cleanupStaging(stagingDirRef.current).catch(() => {});
      stagingDirRef.current = null;
    }

    setState({ phase: 'idle' });
  }, [jwt]);

  return { state, startShare, cancel };
}