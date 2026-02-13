// core/binder/DocumentModel.ts
// Validation and factory helpers for MedicalDocument.
// The types themselves live in types/document.ts — this module
// provides runtime validation and convenience constructors.

import type { MedicalDocument, DocumentMetadata } from '../../types/document';

// --- Validation ---

export function isValidDocument(obj: unknown): obj is MedicalDocument {
  if (obj === null || typeof obj !== 'object') return false;
  const doc = obj as Record<string, unknown>;

  if (typeof doc.value !== 'string') return false;
  if (!doc.metadata || typeof doc.metadata !== 'object') return false;
  if (!Array.isArray(doc.children)) return false;

  const meta = doc.metadata as Record<string, unknown>;
  if (typeof meta.type !== 'string') return false;
  if (typeof meta.created !== 'string') return false;

  return true;
}

/**
 * Parse and validate a raw object into a MedicalDocument.
 * Throws if validation fails.
 */
export function parseDocument(raw: unknown): MedicalDocument {
  if (!isValidDocument(raw)) {
    throw new Error('Invalid MedicalDocument structure');
  }
  return raw;
}

// --- Factory helpers ---

export function createDocument(
  value: string,
  type: string,
  extra?: Partial<DocumentMetadata>,
): MedicalDocument {
  return {
    value,
    metadata: {
      type,
      created: new Date().toISOString(),
      ...extra,
    },
    children: [],
  };
}

export function createPatientInfo(
  name: string,
  dateOfBirth?: string,
): MedicalDocument {
  const lines = [`# ${name}`];
  if (dateOfBirth) lines.push(`\nDOB: ${dateOfBirth}`);
  lines.push(`\nCreated: ${new Date().toISOString()}`);

  return createDocument(lines.join('\n'), 'patient-info');
}

export function createVisitNote(
  provider?: string,
  npi?: string,
): MedicalDocument {
  const now = new Date().toISOString().slice(0, 10);
  return createDocument(
    `# Visit — ${now}\n\n## Subjective\n\n## Objective\n\n## Assessment\n\n## Plan\n`,
    'visit',
    { provider, npi },
  );
}

export function createConditionOverview(
  conditionSlug: string,
  displayName: string,
): MedicalDocument {
  return createDocument(
    `# ${displayName}\n\nOngoing condition tracking.\n`,
    'condition',
    { condition: conditionSlug },
  );
}

export function createPhotoRef(
  sidecarFilename: string,
  sizeBytes: number,
  conditionSlug?: string,
): MedicalDocument {
  return createDocument(sidecarFilename, 'attachment_ref', {
    format: 'jpeg',
    encoding: 'base64',
    originalSizeBytes: sizeBytes,
    condition: conditionSlug,
  });
}

export function createLabResult(
  labName: string,
): MedicalDocument {
  const now = new Date().toISOString().slice(0, 10);
  return createDocument(
    `# Lab Result — ${now}\n\nLab: ${labName}\n\n## Results\n\n## Notes\n`,
    'lab',
  );
}

export function createMedication(
  medicationName: string,
  dosage?: string,
): MedicalDocument {
  const lines = [`# ${medicationName}`];
  if (dosage) lines.push(`\nDosage: ${dosage}`);
  lines.push(`\nStarted: ${new Date().toISOString().slice(0, 10)}`);

  return createDocument(lines.join('\n'), 'medication');
}

// --- Entry metadata (lightweight, for list views) ---

export interface EntryMetadata {
  path: string;
  type: string;
  created: string;
  condition?: string;
}

/**
 * Extract lightweight metadata from a document without keeping the full value in memory.
 */
export function extractEntryMetadata(
  path: string,
  doc: MedicalDocument,
): EntryMetadata {
  return {
    path,
    type: doc.metadata.type,
    created: doc.metadata.created,
    condition: doc.metadata.condition,
  };
}