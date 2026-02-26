// core/binder/DocumentModel.ts
// Validation and factory helpers for MedicalDocument.
// The types themselves live in types/document.ts — this module
// provides runtime validation and convenience constructors.

import type { MedicalDocument, DocumentMetadata } from '../../types/document';
import { parseMarkdownFrontMatter } from '../markdown/frontmatter';
import { parseMedicationEntry } from '../markdown/medicationEntry';

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
  if (meta.displayOrder !== undefined && typeof meta.displayOrder !== 'number') return false;
  if (doc.renderer !== undefined && typeof doc.renderer !== 'string') return false;
  if (doc.editor !== undefined && typeof doc.editor !== 'string') return false;

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
): MedicalDocument {
  return createDocument(sidecarFilename, 'attachment_ref', {
    format: 'jpeg',
    encoding: 'base64',
    originalSizeBytes: sizeBytes,
  });
}

export function createAudioRef(
  sidecarFilename: string,
  sizeBytes: number,
  durationMs: number,
): MedicalDocument {
  return createDocument(sidecarFilename, 'attachment_ref', {
    format: 'm4a',
    encoding: 'binary',
    originalSizeBytes: sizeBytes,
    durationMs,
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
  displayOrder?: number;
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
    displayOrder: doc.metadata.displayOrder,
    condition: doc.metadata.condition,
  };
}

// --- Title extraction ---

/**
 * Extract a human-readable title from the markdown value field.
 * Looks for the first H1 heading. Falls back to first line, then type.
 */
export function extractTitle(doc: MedicalDocument): string {
  const parsed = parseMarkdownFrontMatter(doc.value);
  const val = parsed.body;
  // Match first # heading
  const h1Match = val.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  // Fallback: first non-empty line
  const firstLine = val.split('\n').find((l) => l.trim().length > 0);
  if (firstLine) return firstLine.trim().slice(0, 60);
  // Last resort
  return doc.metadata.type ?? 'Untitled';
}

// --- Entry preview (extended metadata for list views) ---

/**
 * Extended metadata for list views -- includes title, provider, tags.
 */
export interface EntryPreview extends EntryMetadata {
  title: string;
  provider?: string;
  tags?: string[];
  format?: string;
  hasChildren: boolean;
  renderer?: string;
  medicationName?: string;
  medicationDosage?: string;
  medicationFrequency?: string;
}

export function extractEntryPreview(
  path: string,
  doc: MedicalDocument,
): EntryPreview {
  const medication = parseMedicationEntry(doc.value);
  const isMedicationEntry =
    doc.renderer === 'medication' ||
    (doc.metadata.type === 'medication' && medication.isMedicationEntry);

  return {
    ...extractEntryMetadata(path, doc),
    title: extractTitle(doc),
    provider: doc.metadata.provider,
    tags: doc.metadata.tags,
    format: doc.metadata.format,
    hasChildren: doc.children.length > 0,
    renderer: doc.renderer,
    medicationName: isMedicationEntry ? (medication.fields?.name ?? undefined) : undefined,
    medicationDosage: isMedicationEntry ? (medication.fields?.dosage ?? undefined) : undefined,
    medicationFrequency: isMedicationEntry ? (medication.fields?.frequency ?? undefined) : undefined,
  };
}
