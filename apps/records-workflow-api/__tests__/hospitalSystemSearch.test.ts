import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

import { query } from '../src/db.js';
import { listHospitalSystems } from '../src/repositories/workflowRepository.js';

describe('hospital-system search query builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['Mass General Brigham', '%Mass General Brigham%', '%massgeneralbrigham%', 'massgeneralbrigham%'],
    ['Baylor Scott & White', '%Baylor Scott & White%', '%baylorscottwhite%', 'baylorscottwhite%'],
    ["St. David's", "%St. David's%", '%stdavids%', 'stdavids%'],
  ])(
    'normalizes %s before querying Postgres',
    async (searchTerm, expectedLike, expectedNormalizedLike, expectedNormalizedPrefix) => {
      vi.mocked(query).mockResolvedValue({ rows: [] });

      await expect(listHospitalSystems(searchTerm)).resolves.toEqual([]);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('from hospital_systems'),
        [expectedLike, expectedNormalizedLike, `${searchTerm}%`, expectedNormalizedPrefix, 50],
      );
    },
  );
});
