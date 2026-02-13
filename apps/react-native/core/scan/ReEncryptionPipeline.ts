// core/scan/ReEncryptionPipeline.ts
// Walks a binder's working tree, decrypts every file with the master key,
// re-encrypts with an ephemeral key, writes to a staging directory.
// Plaintext exists only transiently in memory — one file at a time.

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
  const sourceIO = new EncryptedIO(sourceFS, masterConversationKey);
  const stagingIO = new EncryptedIO(stagingFS, ephemeralConversationKey);

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
      // Sidecar: decrypt binary with master key, re-encrypt with ephemeral key
      const binary = await sourceIO.readSidecar('/' + filePath);
      await stagingIO.writeSidecar('/' + filePath, binary);
      totalBytes += binary.length;
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