import { describe, expect, it } from 'vitest';

const { normalizeUserRepositories } = require('../repoListing');

describe('normalizeUserRepositories', () => {
  it('preserves camelCase auth-api repository fields', () => {
    const repos = normalizeUserRepositories([
      {
        repoId: 'binder-123',
        description: 'Primary binder',
        repoType: 'medical-history',
        createdAt: '2026-03-23T00:00:00.000Z',
        access: 'admin',
      },
    ]);

    expect(repos).toEqual([
      {
        id: 'binder-123',
        name: 'binder-123',
        description: 'Primary binder',
        type: 'medical-history',
        created: '2026-03-23T00:00:00.000Z',
        access: 'admin',
      },
    ]);
  });

  it('accepts lowercase Postgres row aliases and skips malformed records', () => {
    const repos = normalizeUserRepositories([
      {
        repoid: 'binder-456',
        description: 'Migrated binder',
        repotype: 'medical-history',
        createdat: '2026-02-22T04:36:51.000Z',
        access: 'admin',
      },
      {
        description: 'missing id should be ignored',
      },
    ]);

    expect(repos).toEqual([
      {
        id: 'binder-456',
        name: 'binder-456',
        description: 'Migrated binder',
        type: 'medical-history',
        created: '2026-02-22T04:36:51.000Z',
        access: 'admin',
      },
    ]);
  });
});
