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
  icon: string;            // Tabler icon name (for future custom icon picker)
  emoji: string;           // Emoji displayed in folder rows
  color: string;           // Tint color for folder icon background
  templateFn?: () => MedicalDocument;
}

// --- Definitions ---

const CATEGORIES: Category[] = [
  {
    slug: 'visits',
    label: 'Visits',
    folder: 'visits',
    icon: 'stethoscope',
    emoji: '🩺',
    color: '#4A90D9',
    templateFn: () => createVisitNote(),
  },
  {
    slug: 'conditions',
    label: 'Conditions',
    folder: 'conditions',
    icon: 'heartbeat',
    emoji: '❤️‍🩹',
    color: '#E74C3C',
    // No single template — conditions use subfolders per condition
  },
  {
    slug: 'labs',
    label: 'Lab Results',
    folder: 'labs',
    icon: 'test-pipe',
    emoji: '🧪',
    color: '#27AE60',
    templateFn: () => createLabResult(''),
  },
  {
    slug: 'medications',
    label: 'Medications',
    folder: 'medications',
    icon: 'pill',
    emoji: '💊',
    color: '#8E44AD',
    templateFn: () => createMedication(''),
  },
  {
    slug: 'immunizations',
    label: 'Immunizations',
    folder: 'immunizations',
    icon: 'vaccine',
    emoji: '💉',
    color: '#16A085',
  },
  {
    slug: 'allergies',
    label: 'Allergies',
    folder: 'allergies',
    icon: 'alert-triangle',
    emoji: '⚠️',
    color: '#E67E22',
  },
  {
    slug: 'procedures',
    label: 'Procedures',
    folder: 'procedures',
    icon: 'cut',
    emoji: '🔬',
    color: '#7F8C8D',
  },
  {
    slug: 'imaging',
    label: 'Imaging',
    folder: 'imaging',
    icon: 'photo-scan',
    emoji: '📷',
    color: '#5B6ABF',
  },
  {
    slug: 'documents',
    label: 'Documents',
    folder: 'documents',
    icon: 'file-text',
    emoji: '📄',
    color: '#566573',
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