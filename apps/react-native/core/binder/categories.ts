// core/binder/categories.ts
// Category definitions: slug, label, folder, and template generator.

import type { MedicalDocument } from '../../types/document';
import {
  createVisitNote,
  createConditionOverview,
  createLabResult,
  createMedication,
} from './DocumentModel';

// --- Types ---

export interface Category {
  slug: string;
  label: string;
  folder: string;          // path relative to repo root
  icon: string;            // Tabler icon name (for future UI)
  templateFn?: () => MedicalDocument;
}

// --- Definitions ---

const CATEGORIES: Category[] = [
  {
    slug: 'visits',
    label: 'Visits',
    folder: 'visits',
    icon: 'stethoscope',
    templateFn: () => createVisitNote(),
  },
  {
    slug: 'conditions',
    label: 'Conditions',
    folder: 'conditions',
    icon: 'heartbeat',
    // No single template — conditions use subfolders per condition
  },
  {
    slug: 'labs',
    label: 'Lab Results',
    folder: 'labs',
    icon: 'test-pipe',
    templateFn: () => createLabResult(''),
  },
  {
    slug: 'medications',
    label: 'Medications',
    folder: 'medications',
    icon: 'pill',
    templateFn: () => createMedication(''),
  },
  {
    slug: 'immunizations',
    label: 'Immunizations',
    folder: 'immunizations',
    icon: 'vaccine',
  },
  {
    slug: 'allergies',
    label: 'Allergies',
    folder: 'allergies',
    icon: 'alert-triangle',
  },
  {
    slug: 'procedures',
    label: 'Procedures',
    folder: 'procedures',
    icon: 'cut',
  },
  {
    slug: 'imaging',
    label: 'Imaging',
    folder: 'imaging',
    icon: 'photo-scan',
  },
  {
    slug: 'documents',
    label: 'Documents',
    folder: 'documents',
    icon: 'file-text',
  },
];

// --- Lookup ---

const categoryMap = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function getCategory(slug: string): Category | undefined {
  return categoryMap.get(slug);
}

export function getAllCategories(): Category[] {
  return CATEGORIES;
}

export function getCategoryFolder(slug: string): string {
  const cat = categoryMap.get(slug);
  return cat?.folder ?? slug;
}

/**
 * Generate a template document for a category.
 * Returns undefined if the category has no template (e.g., conditions).
 */
export function getTemplate(slug: string): MedicalDocument | undefined {
  const cat = categoryMap.get(slug);
  return cat?.templateFn?.();
}

/**
 * Infer category from a file path.
 * 'conditions/back-acne/2026-02-13-photo.json' → 'conditions'
 * 'visits/2026-02-13-follow-up.json' → 'visits'
 * 'patient-info.json' → 'patient-info' (root-level, no category)
 */
export function categoryFromPath(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length < 2) return 'root';
  return parts[0];
}