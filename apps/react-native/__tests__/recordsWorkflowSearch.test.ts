import { describe, expect, it } from 'vitest';
import {
  HOSPITAL_SYSTEM_SEARCH_DEBOUNCE_MS,
  normalizeHospitalSystemSearchQuery,
} from '../core/recordsWorkflow/search';

describe('records workflow search helpers', () => {
  it('normalizes hospital search queries by trimming and collapsing whitespace', () => {
    expect(normalizeHospitalSystemSearchQuery('  multi   care  ')).toBe('multi care');
    expect(normalizeHospitalSystemSearchQuery('Mass   General   Brigham')).toBe(
      'Mass General Brigham',
    );
  });

  it('uses a user-friendly debounce interval', () => {
    expect(HOSPITAL_SYSTEM_SEARCH_DEBOUNCE_MS).toBe(250);
  });
});
