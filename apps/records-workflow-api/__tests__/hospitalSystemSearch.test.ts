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
    [
      'Mass General Brigham',
      '%Mass General Brigham%',
      '%massgeneralbrigham%',
      'massgeneralbrigham%',
      '%massgeneralbrigham%',
      'massgeneralbrigham%',
    ],
    [
      'Baylor Scott & White',
      '%Baylor Scott & White%',
      '%baylorscottwhite%',
      'baylorscottwhite%',
      '%baylorscottwhite%',
      'baylorscottwhite%',
    ],
    [
      'Baylor Scott and White',
      '%Baylor Scott and White%',
      '%baylorscottandwhite%',
      'baylorscottandwhite%',
      '%baylorscottwhite%',
      'baylorscottwhite%',
    ],
    [
      'BSW',
      '%BSW%',
      '%bsw%',
      'bsw%',
      '%bsw%',
      'bsw%',
    ],
    ["St. David's", "%St. David's%", '%stdavids%', 'stdavids%', '%stdavids%', 'stdavids%'],
  ])(
    'normalizes %s before querying Postgres',
    async (
      searchTerm,
      expectedLike,
      expectedNormalizedLike,
      expectedNormalizedPrefix,
      expectedConnectorInsensitiveLike,
      expectedConnectorInsensitivePrefix,
    ) => {
      vi.mocked(query).mockResolvedValue({ rows: [] });

      await expect(listHospitalSystems(searchTerm)).resolves.toEqual([]);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('from hospital_systems'),
        [
          expectedLike,
          expectedNormalizedLike,
          `${searchTerm}%`,
          expectedNormalizedPrefix,
          expectedConnectorInsensitiveLike,
          expectedConnectorInsensitivePrefix,
          50,
        ],
      );
    },
  );
});
