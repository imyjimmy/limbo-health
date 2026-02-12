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
  encryptLarge,
  decryptLarge,
} from '../crypto/nip44';
import { encode as b64encode, decode as b64decode } from '../crypto/base64';
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
   */
  async readSidecar(path: string): Promise<Uint8Array> {
    const ciphertext = (await this.fs.promises.readFile(path, {
      encoding: 'utf8',
    })) as string;
    const base64 = decryptLarge(ciphertext, this.masterConversationKey);
    return b64decode(base64);
  }

  /**
   * Encrypt and write a sidecar .enc file using the master key.
   * Accepts raw binary data (e.g., compressed JPEG bytes).
   */
  async writeSidecar(path: string, binaryData: Uint8Array): Promise<void> {
    const base64 = b64encode(binaryData);
    const ciphertext = encryptLarge(base64, this.masterConversationKey);
    await this.fs.promises.writeFile(path, ciphertext, { encoding: 'utf8' });
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
   */
  async readSidecarWithKey(
    path: string,
    conversationKey: Uint8Array,
  ): Promise<Uint8Array> {
    const ciphertext = (await this.fs.promises.readFile(path, {
      encoding: 'utf8',
    })) as string;
    const base64 = decryptLarge(ciphertext, conversationKey);
    return b64decode(base64);
  }

  /**
   * Encrypt and write a sidecar .enc file with an explicit conversation key.
   */
  async writeSidecarWithKey(
    path: string,
    binaryData: Uint8Array,
    conversationKey: Uint8Array,
  ): Promise<void> {
    const base64 = b64encode(binaryData);
    const ciphertext = encryptLarge(base64, conversationKey);
    await this.fs.promises.writeFile(path, ciphertext, { encoding: 'utf8' });
  }
}