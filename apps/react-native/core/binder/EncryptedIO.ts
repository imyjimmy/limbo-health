// core/binder/EncryptedIO.ts
// The ONLY code path that reads or writes medical data files.
// Guarantees: plaintext never hits disk. All files are NIP-44 ciphertext.
//
// Two modes:
//   - Master key ops (most common): bound at construction via conversation key
//   - Explicit key ops (WithKey variants): used by scan re-encryption pipeline

import {
  encrypt,
  decrypt,
  decryptLarge,
} from '../crypto/nip44';
import { encode as b64encode, decode as b64decode } from '../crypto/base64';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import {
  generateDEK,
  encryptWithDEK,
  decryptWithDEK,
  serializeDEKFile,
  parseDEKFile,
} from '../crypto/dek';
import type { MedicalDocument } from '../../types/document';

// --- FS interface (subset of fsAdapter) ---

export interface EncryptedFS {
  promises: {
    readFile(
      path: string,
      options?: { encoding?: string },
    ): Promise<string | Uint8Array>;
    writeFile(
      path: string,
      data: string | Uint8Array,
      options?: { encoding?: string },
    ): Promise<void>;
  };
}

// --- EncryptedIO ---

export class EncryptedIO {
  private fs: EncryptedFS;
  private masterConversationKey: Uint8Array;

  constructor(fs: EncryptedFS, masterConversationKey: Uint8Array) {
    this.fs = fs;
    this.masterConversationKey = masterConversationKey;
  }

  // --- Master key operations ---

  /**
   * Read and decrypt a .json medical document using the master key.
   */
  async readDocument(path: string): Promise<MedicalDocument> {
    const ciphertext = (await this.fs.promises.readFile(path, {
      encoding: 'utf8',
    })) as string;
    const plaintext = decrypt(ciphertext, this.masterConversationKey);
    return JSON.parse(plaintext) as MedicalDocument;
  }

  /**
   * Encrypt and write a .json medical document using the master key.
   */
  async writeDocument(path: string, doc: MedicalDocument): Promise<void> {
    const plaintext = JSON.stringify(doc);
    const ciphertext = encrypt(plaintext, this.masterConversationKey);
    await this.fs.promises.writeFile(path, ciphertext, { encoding: 'utf8' });
  }

  /**
   * Read and decrypt a sidecar .enc file using the master key.
   * Returns the original binary data (e.g., JPEG bytes).
   * Handles both DEK format (version 0x02) and legacy direct-NIP-44 format.
   */
  async readSidecar(path: string): Promise<Uint8Array> {
    return this.readSidecarWithKey(path, this.masterConversationKey);
  }

  /**
   * Encrypt and write a sidecar .enc file using the master key.
   * Uses two-layer DEK encryption: bulk content encrypted with a random DEK
   * via ChaCha20-Poly1305, DEK wrapped with NIP-44 using the conversation key.
   */
  async writeSidecar(path: string, binaryData: Uint8Array): Promise<void> {
    await this.writeSidecarWithKey(path, binaryData, this.masterConversationKey);
  }

  // --- Explicit key operations (scan re-encryption pipeline) ---

  /**
   * Read and decrypt a .json document with an explicit conversation key.
   */
  async readDocumentWithKey(
    path: string,
    conversationKey: Uint8Array,
  ): Promise<MedicalDocument> {
    const ciphertext = (await this.fs.promises.readFile(path, {
      encoding: 'utf8',
    })) as string;
    const plaintext = decrypt(ciphertext, conversationKey);
    return JSON.parse(plaintext) as MedicalDocument;
  }

  /**
   * Encrypt and write a .json document with an explicit conversation key.
   */
  async writeDocumentWithKey(
    path: string,
    doc: MedicalDocument,
    conversationKey: Uint8Array,
  ): Promise<void> {
    const plaintext = JSON.stringify(doc);
    const ciphertext = encrypt(plaintext, conversationKey);
    await this.fs.promises.writeFile(path, ciphertext, { encoding: 'utf8' });
  }

  /**
   * Read and decrypt a sidecar .enc file with an explicit conversation key.
   * Handles both DEK format (version 0x02) and legacy direct-NIP-44 format.
   */
  async readSidecarWithKey(
    path: string,
    conversationKey: Uint8Array,
  ): Promise<Uint8Array> {
    // Read as raw bytes so we can inspect the version byte
    const fileData = (await this.fs.promises.readFile(path)) as Uint8Array;

    const parsed = parseDEKFile(fileData);

    if (parsed === null) {
      // Legacy format: file is a UTF-8 NIP-44 ciphertext string
      const content = new TextDecoder().decode(fileData);
      const base64 = decryptLarge(content, conversationKey);
      return b64decode(base64);
    }

    // DEK format: unwrap DEK, then decrypt bulk content
    const { wrappedDek, nonce, ciphertext } = parsed;
    const dek = hexToBytes(decrypt(wrappedDek, conversationKey));
    const plaintext = decryptWithDEK(ciphertext, nonce, dek);
    const base64String = new TextDecoder().decode(plaintext);
    return b64decode(base64String);
  }

  /**
   * Encrypt and write a sidecar .enc file with an explicit conversation key.
   * Uses two-layer DEK encryption: bulk content encrypted with a random DEK
   * via ChaCha20-Poly1305, DEK wrapped with NIP-44 using the conversation key.
   */
  async writeSidecarWithKey(
    path: string,
    binaryData: Uint8Array,
    conversationKey: Uint8Array,
  ): Promise<void> {
    // 1. Base64-encode the binary data
    const base64String = b64encode(binaryData);
    const plaintext = new TextEncoder().encode(base64String);

    // 2. Generate a random DEK and encrypt bulk content with it
    const dek = generateDEK();
    const { nonce, ciphertext } = encryptWithDEK(plaintext, dek);

    // 3. Wrap the DEK with NIP-44 using the conversation key
    //    DEK is hex-encoded so NIP-44 receives a valid string (arbitrary bytes aren't valid UTF-8)
    const wrappedDek = encrypt(bytesToHex(dek), conversationKey);

    // 4. Serialize and write as raw bytes
    const fileData = serializeDEKFile(wrappedDek, nonce, ciphertext);
    await this.fs.promises.writeFile(path, fileData);
  }

  /**
   * Re-wrap a sidecar's DEK from one conversation key to another.
   * The bulk ciphertext is copied as-is -- no photo data is decrypted.
   * Used by ReEncryptionPipeline for fast share-with-doctor.
   *
   * @param destFS - Optional destination FS adapter. When the source and destination
   *                 live on different FS roots (e.g., binder vs staging directory),
   *                 pass the destination adapter here. Defaults to this.fs.
   *
   * For legacy files (pre-DEK format), falls back to full decrypt/re-encrypt.
   */
  async rewrapSidecar(
    sourcePath: string,
    destPath: string,
    sourceKey: Uint8Array,
    destKey: Uint8Array,
    destFS?: EncryptedFS,
  ): Promise<void> {
    const outFS = destFS ?? this.fs;
    const fileData = (await this.fs.promises.readFile(sourcePath)) as Uint8Array;

    const parsed = parseDEKFile(fileData);

    if (parsed === null) {
      // Legacy file: must do full decrypt/re-encrypt
      const binaryData = await this.readSidecarWithKey(sourcePath, sourceKey);

      // Write via destFS — same DEK write logic as writeSidecarWithKey
      const base64String = b64encode(binaryData);
      const plaintext = new TextEncoder().encode(base64String);
      const dek = generateDEK();
      const { nonce, ciphertext } = encryptWithDEK(plaintext, dek);
      const wrappedDek = encrypt(bytesToHex(dek), destKey);
      const newFileData = serializeDEKFile(wrappedDek, nonce, ciphertext);
      await outFS.promises.writeFile(destPath, newFileData);
      return;
    }

    const { wrappedDek, nonce, ciphertext } = parsed;

    // Unwrap DEK with source key, re-wrap with dest key
    // The DEK string is hex-encoded, flows through NIP-44 cleanly
    const dekHex = decrypt(wrappedDek, sourceKey);
    const newWrappedDek = encrypt(dekHex, destKey);

    // Rebuild file with new header, same bulk ciphertext
    const newFileData = serializeDEKFile(newWrappedDek, nonce, ciphertext);
    await outFS.promises.writeFile(destPath, newFileData);
  }
}