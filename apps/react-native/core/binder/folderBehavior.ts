// core/binder/folderBehavior.ts
// Keyword-based folder behavior inference.
// Maps folder names to contextualAdd configs via token matching.
// Single source of truth for what behavior a folder name implies.

import type { FolderMeta } from './DirectoryReader';

export interface BehaviorRule {
  id: string;
  /** Lowercase keywords. Matched against tokens in the normalized leaf folder name. */
  keywords: string[];
  contextualAdd: NonNullable<FolderMeta['contextualAdd']>;
}

export const BEHAVIOR_RULES: BehaviorRule[] = [
  {
    id: 'medication',
    keywords: ['medication', 'medications', 'meds'],
    contextualAdd: {
      label: 'Add Medication',
      categoryType: 'medication',
      editor: 'MedicationForm',
      renderer: 'MedicationSummary',
      icon: 'medication',
    },
  },
  {
    id: 'billing-insurance',
    keywords: ['billing', 'insurance'],
    contextualAdd: {
      label: 'Add Billing & Insurance',
      categoryType: 'billing-insurance',
      editor: 'note',
      renderer: 'note',
      icon: 'billing-insurance',
    },
  },
];

/**
 * Infer contextualAdd behavior from a folder name.
 * Normalizes the name into lowercase tokens and checks for exact keyword matches.
 * Returns the first matching rule, or null.
 */
export function inferBehavior(folderName: string): BehaviorRule | null {
  const normalized = folderName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  const tokens = normalized.split(/\s+/).filter(Boolean);

  for (const rule of BEHAVIOR_RULES) {
    if (tokens.some((token) => rule.keywords.includes(token))) {
      return rule;
    }
  }

  return null;
}
