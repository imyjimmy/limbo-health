// __tests__/helpers/testData.ts
// Factory functions for reproducible test MedicalDocuments.

import type { MedicalDocument } from '../../types/document';

export function makeDocument(overrides?: {
  value?: string;
  type?: string;
  created?: string;
  children?: MedicalDocument[];
  provider?: string;
  condition?: string;
  tags?: string[];
}): MedicalDocument {
  return {
    value: overrides?.value ?? '# Test Note\n\nSome content here.',
    metadata: {
      type: overrides?.type ?? 'visit',
      created: overrides?.created ?? '2026-01-15T10:00:00.000Z',
      ...(overrides?.provider ? { provider: overrides.provider } : {}),
      ...(overrides?.condition ? { condition: overrides.condition } : {}),
      ...(overrides?.tags ? { tags: overrides.tags } : {}),
    },
    children: overrides?.children ?? [],
  };
}
