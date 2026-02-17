// hooks/useShareSession.ts
// Orchestrates the full share-with-doctor lifecycle:
// re-encrypt → create session → show QR → push staging in background → revoke on cancel.
//
// The QR is shown optimistically after re-encrypt + session creation (~350ms).
// The staging repo push (~1.2s) runs in the background while the doctor scans.

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
  | 'creating-session'
  | 'showing-qr'
  | 'error';

export type PushStatus = 'pushing' | 'done' | 'slow' | 'failed';

export interface ShareState {
  phase: SharePhase;
  progress?: ReEncryptionProgress;
  qrPayload?: ScanQRPayload;
  pushStatus?: PushStatus;
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
  const pushPromiseRef = useRef<Promise<void> | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startShare = useCallback(async () => {
    if (!masterConversationKey || !jwt) {
      setState({ phase: 'error', error: 'Not authenticated' });
      return;
    }

    try {
      const t0 = Date.now();

      // Step 1: Re-encrypt binder with ephemeral key
      setState({ phase: 're-encrypting' });

      const reEncryptResult = await reEncryptBinder(
        binderRepoDir,
        masterConversationKey,
        (progress) => {
          setState({ phase: 're-encrypting', progress });
        },
      );
      console.log(`[Share] Re-encrypt: ${Date.now() - t0}ms`);

      stagingDirRef.current = reEncryptResult.stagingDir;

      // Extract repoId from stagingDir: 'staging/scan-abc123' → 'scan-abc123'
      const parts = reEncryptResult.stagingDir.split('/');
      const repoId = parts[parts.length - 1];

      // Step 2: Create scan session (lightweight API call, ~100ms)
      const t1 = Date.now();
      setState({ phase: 'creating-session' });

      const qrPayload = await createScanSession(
        repoId,
        reEncryptResult.ephemeralPrivkey,
        jwt,
      );
      console.log(`[Share] Create session: ${Date.now() - t1}ms`);
      console.log(`[Share] QR ready: ${Date.now() - t0}ms (${reEncryptResult.fileCount} files)`);

      sessionTokenRef.current = qrPayload.sessionToken;

      // Step 3: Show QR immediately, kick off background push
      setState({ phase: 'showing-qr', qrPayload, pushStatus: 'pushing' });
      startBackgroundPush(reEncryptResult.stagingDir, t0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setState({ phase: 'error', error: msg });
    }
  }, [binderRepoDir, masterConversationKey, jwt]);

  const startBackgroundPush = useCallback((stagingDir: string, t0: number) => {
    setState((prev) =>
      prev.phase === 'showing-qr' ? { ...prev, pushStatus: 'pushing' } : prev,
    );

    // Mark as slow if push takes longer than 5 seconds
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => {
      setState((prev) =>
        prev.phase === 'showing-qr' && prev.pushStatus === 'pushing'
          ? { ...prev, pushStatus: 'slow' }
          : prev,
      );
    }, 5000);

    const t2 = Date.now();
    pushPromiseRef.current = pushStagingRepo(
      stagingDir,
      { type: 'jwt', token: jwt! },
    ).then(() => {
      console.log(`[Share] Push staging: ${Date.now() - t2}ms`);
      console.log(`[Share] Total: ${Date.now() - t0}ms`);
      pushPromiseRef.current = null;
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setState((prev) =>
        prev.phase === 'showing-qr' ? { ...prev, pushStatus: 'done' } : prev,
      );
    }).catch((err) => {
      console.error(`[Share] Push staging failed:`, err);
      pushPromiseRef.current = null;
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setState((prev) =>
        prev.phase === 'showing-qr' ? { ...prev, pushStatus: 'failed' } : prev,
      );
    });
  }, [jwt]);

  const retryPush = useCallback(() => {
    if (!stagingDirRef.current) return;
    startBackgroundPush(stagingDirRef.current, Date.now());
  }, [startBackgroundPush]);

  const cancel = useCallback(async () => {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }

    // Wait for any in-flight push to finish before cleanup
    if (pushPromiseRef.current) {
      await pushPromiseRef.current.catch(() => {});
    }

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

  return { state, startShare, retryPush, cancel };
}