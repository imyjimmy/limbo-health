import { describe, expect, it } from 'vitest';

import {
  formatBinderFallbackName,
  resolveBinderDisplayName,
} from '../../../core/binder/binderDisplayName';

describe('binderDisplayName', () => {
  it('prefers the locally learned binder name over cached or remote values', () => {
    expect(
      resolveBinderDisplayName({
        repoId: 'binder-171713411120',
        remoteName: 'binder-171713411120',
        cachedName: 'Medical Binder 1120',
        localName: 'Jimmy Medical Binder',
      }),
    ).toBe('Jimmy Medical Binder');
  });

  it('uses a cached binder name when the remote repo list only returns the repo id', () => {
    expect(
      resolveBinderDisplayName({
        repoId: 'binder-171713411120',
        remoteName: 'binder-171713411120',
        cachedName: 'My Records',
      }),
    ).toBe('My Records');
  });

  it('formats a friendly fallback when only a raw binder id is available', () => {
    expect(formatBinderFallbackName('binder-171713411120')).toBe('Medical Binder 1120');
  });
});
