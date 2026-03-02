// components/registry/componentRegistry.ts
// Central lookup for document renderers and editors.
// The string stored in a document's `renderer` / `editor` field maps
// directly to a key in these records — grep the key, find the component.

import type { ComponentType, MutableRefObject } from 'react';
import type { MedicalDocument } from '../../types/document';
import type { PendingSidecar } from '../editor/AttachmentList';

// Lazy imports to avoid circular deps / heavy upfront bundle cost
// are not needed here — the registry is only imported where it's used.
import { MedicationSummary } from '../renderers/MedicationSummary';
import { MedicationForm } from '../editors/MedicationForm';

// --- Renderer: read-only display + optional inline editing ---

export interface RendererProps {
  doc: MedicalDocument;
  editing?: boolean;
  onSave?: (updatedDoc: MedicalDocument) => Promise<void>;
  onCancelEdit?: () => void;
  /** Called when the user taps a field in view mode — parent should set editing=true. */
  onRequestEdit?: () => void;
  saving?: boolean;
  /** Parent writes a ref; renderer fills it with its save handler so the header can trigger save. */
  saveRef?: MutableRefObject<(() => void) | null>;
}

// --- Editor: full-screen creation / editing form ---

export interface EditorProps {
  mode: 'create' | 'edit';
  doc?: MedicalDocument;
  dirPath: string;
  categoryType: string;
  onSave: (doc: MedicalDocument, sidecars: PendingSidecar[]) => Promise<void>;
  onCancel: () => void;
}

// --- Registry maps ---

export const RENDERERS: Record<string, ComponentType<RendererProps>> = {
  MedicationSummary,
};

export const EDITORS: Record<string, ComponentType<EditorProps>> = {
  MedicationForm,
};

// Backwards compat: old docs on disk still have renderer:'medication'
const LEGACY_RENDERER_ALIASES: Record<string, string> = {
  medication: 'MedicationSummary',
};

const LEGACY_EDITOR_ALIASES: Record<string, string> = {
  medication: 'MedicationForm',
};

// --- Lookup helpers ---

export function getRenderer(name?: string): ComponentType<RendererProps> | undefined {
  if (!name) return undefined;
  return RENDERERS[name] ?? RENDERERS[LEGACY_RENDERER_ALIASES[name]];
}

export function getEditor(name?: string): ComponentType<EditorProps> | undefined {
  if (!name) return undefined;
  return EDITORS[name] ?? EDITORS[LEGACY_EDITOR_ALIASES[name]];
}

export function hasEditor(name?: string): boolean {
  return !!getEditor(name);
}
