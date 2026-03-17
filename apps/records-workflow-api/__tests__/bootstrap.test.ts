import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../src/services/seedService.js', () => ({
  reseedFromFile: vi.fn(),
}));

import { ensureDatabaseReady } from '../src/bootstrap.js';
import { query } from '../src/db.js';
import { reseedFromFile } from '../src/services/seedService.js';

describe('records-workflow bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies schema and seeds baseline hospital data when the database is empty', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });
    vi.mocked(reseedFromFile).mockResolvedValue({
      systems: 25,
      facilities: 25,
      seeds: 25,
    });

    await expect(ensureDatabaseReady()).resolves.toEqual({
      didSeed: true,
      hospitalSystemCount: 25,
      summary: {
        systems: 25,
        facilities: 25,
        seeds: 25,
      },
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(reseedFromFile).toHaveBeenCalledTimes(1);
  });

  it('skips reseeding when hospital systems already exist', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 35 }] });

    await expect(ensureDatabaseReady()).resolves.toEqual({
      didSeed: false,
      hospitalSystemCount: 35,
      summary: null,
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(reseedFromFile).not.toHaveBeenCalled();
  });
});
