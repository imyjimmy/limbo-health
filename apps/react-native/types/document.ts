// types/document.ts
// Core medical document types used throughout the app.

export interface DocumentMetadata {
  type: string;
  created: string;           // ISO 8601
  updated?: string;          // ISO 8601
  provider?: string;
  npi?: string;
  tags?: string[];
  format?: string;           // 'jpeg' | 'png' | 'pdf' | 'mp3' etc.
  encoding?: string;         // 'base64'
  originalSizeBytes?: number;
  durationMs?: number;
  condition?: string;        // condition slug for photo entries
}

export interface MedicalDocument {
  value: string;
  metadata: DocumentMetadata;
  children: MedicalDocument[];
}

/**
 * **The data flow through EncryptedIO:**

Write document:  MedicalDocument → JSON.stringify → nip44.encrypt → ciphertext string → disk
Read document:   disk → ciphertext string → nip44.decrypt → JSON.parse → MedicalDocument

Write sidecar:   JPEG bytes → base64.encode → nip44.encryptLarge → ciphertext string → disk
Read sidecar:    disk → ciphertext string → nip44.decryptLarge → base64.decode → JPEG bytes
 */

