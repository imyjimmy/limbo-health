// core/scan/ReEncryptionPipeline.ts
// Walks a binder's working tree and re-keys every file for an ephemeral session.
//
// .enc sidecars (photos): DEK re-wrap only — the bulk ciphertext is copied as-is,
//   only the small wrapped DEK header is re-encrypted. No photo data is decrypted.
// .json documents (metadata): full decrypt with master key, re-encrypt with
//   ephemeral key (these are tiny, so full re-encryption is fine).

import { GitEngine } from '../git/GitEngine';
import { EncryptedIO } from '../binder/EncryptedIO';
import { createFSAdapter } from '../git/fsAdapter';
import { KeyManager } from '../crypto/KeyManager';
import RNFS from 'react-native-fs';

// --- Types ---

export interface ReEncryptionResult {
  stagingDir: string;           // repoDir for the staging copy (e.g. 'staging/scan-abc123')
  fileCount: number;
  totalBytes: number;
  ephemeralPrivkey: Uint8Array;
  ephemeralPubkey: string;
  ephemeralConversationKey: Uint8Array;
}

export interface ReEncryptionProgress {
  currentFile: string;
  filesProcessed: number;
  totalFiles: number;
}

// --- Pipeline ---

const STAGING_ROOT = `${RNFS.DocumentDirectoryPath}/staging`;

export async function reEncryptBinder(
  binderRepoDir: string,
  masterConversationKey: Uint8Array,
  onProgress?: (progress: ReEncryptionProgress) => void,
): Promise<ReEncryptionResult> {
  // Generate ephemeral keypair
  const { privkey: ephemeralPrivkey, pubkey: ephemeralPubkey } =
    KeyManager.generateEphemeralKeypair();

  // Derive ephemeral conversation key (encrypt-to-self with ephemeral key)
  const ephemeralConversationKey = KeyManager.computeConversationKey(
    ephemeralPrivkey,
    ephemeralPubkey,
  );

  // Create staging directory
  const stagingId = `scan-${Date.now().toString(16)}`;
  const stagingRepoDir = `staging/${stagingId}`;
  const stagingFullPath = `${STAGING_ROOT}/${stagingId}`;
  await RNFS.mkdir(stagingFullPath);

  // Set up IO for both source (master key) and destination (ephemeral key)
  const sourceFS = createFSAdapter(binderRepoDir);
  const stagingFS = createFSAdapter(stagingRepoDir);
  const sourceIO = new EncryptedIO(sourceFS, masterConversationKey, binderRepoDir);
  const stagingIO = new EncryptedIO(stagingFS, ephemeralConversationKey, stagingRepoDir);

  // List all tracked files in the binder
  const allFiles = await GitEngine.listFiles(binderRepoDir);

  let fileCount = 0;
  let totalBytes = 0;

  for (const filePath of allFiles) {
    // Skip hidden files
    if (filePath.startsWith('.')) continue;

    onProgress?.({
      currentFile: filePath,
      filesProcessed: fileCount,
      totalFiles: allFiles.length,
    });

    // Ensure parent directories exist in staging
    const parts = filePath.split('/');
    if (parts.length > 1) {
      const parentDir = parts.slice(0, -1).join('/');
      await RNFS.mkdir(`${stagingFullPath}/${parentDir}`);
    }

    if (filePath.endsWith('.enc')) {
      // Sidecar: re-wrap the DEK from master key to ephemeral key.
      // Bulk ciphertext is copied as-is — no photo data is decrypted.
      // For legacy files, rewrapSidecar falls back to full decrypt/re-encrypt.
      await sourceIO.rewrapSidecar(
        '/' + filePath,
        '/' + filePath,
        masterConversationKey,
        ephemeralConversationKey,
        stagingFS,
      );
    } else if (filePath.endsWith('.json')) {
      // Document: decrypt JSON with master key, re-encrypt with ephemeral key
      const doc = await sourceIO.readDocument('/' + filePath);
      await stagingIO.writeDocument('/' + filePath, doc);
      totalBytes += JSON.stringify(doc).length;
    }

    fileCount++;
  }

  return {
    stagingDir: stagingRepoDir,
    fileCount,
    totalBytes,
    ephemeralPrivkey,
    ephemeralPubkey,
    ephemeralConversationKey,
  };
}

/**
 * Clean up a staging directory after session is done.
 */
export async function cleanupStaging(stagingRepoDir: string): Promise<void> {
  const fullPath = `${RNFS.DocumentDirectoryPath}/${stagingRepoDir}`;
  const exists = await RNFS.exists(fullPath);
  if (exists) {
    await RNFS.unlink(fullPath);
  }
}