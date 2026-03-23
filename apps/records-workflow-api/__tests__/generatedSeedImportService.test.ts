import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/services/seedEditorService.js', () => ({
  mergeSystemsIntoStateSeedFile: vi.fn(),
  readStateSeedFile: vi.fn(),
}));

vi.mock('../src/services/seedService.js', () => ({
  reseedFromFile: vi.fn(),
}));

import { importGeneratedSeeds } from '../src/services/generatedSeedImportService.js';
import {
  mergeSystemsIntoStateSeedFile,
  readStateSeedFile,
} from '../src/services/seedEditorService.js';
import { reseedFromFile } from '../src/services/seedService.js';

describe('generatedSeedImportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readStateSeedFile).mockResolvedValue({
      state: 'NH',
      seed_file_path: '/tmp/new-hampshire-systems.json',
      counts: {
        systems: 1,
        facilities: 1,
        seed_urls: 1,
      },
      systems: [],
    } as never);
  });

  it('promotes importable generated seeds into the canonical seed file before reseeding the db', async () => {
    vi.mocked(mergeSystemsIntoStateSeedFile).mockResolvedValue({
      state: 'NH',
      seed_file_path: '/tmp/new-hampshire-systems.json',
      counts: {
        systems: 2,
        facilities: 2,
        seed_urls: 3,
      },
      systems: [],
    } as never);
    vi.mocked(reseedFromFile).mockResolvedValue({
      systems: 2,
      facilities: 2,
      seeds: 3,
    } as never);

    const highConfidenceCandidate = {
      system_name: 'Cottage Hospital',
      state: 'NH',
      domain: 'cottagehospital.org',
      discovery_confidence: 'high',
      seed_urls: ['https://www.cottagehospital.org/department/medical-records-health-information-management-him'],
      facilities: [],
    };
    const lowConfidenceCandidate = {
      system_name: 'Example Hospital',
      state: 'NH',
      domain: 'example.org',
      discovery_confidence: 'low',
      seed_urls: ['https://example.org/medical-records'],
      facilities: [],
    };

    const result = await importGeneratedSeeds({
      state: 'NH',
      minimumConfidence: 'high',
      generatedSystems: [highConfidenceCandidate, lowConfidenceCandidate],
    });

    expect(mergeSystemsIntoStateSeedFile).toHaveBeenCalledWith({
      state: 'NH',
      systems: [highConfidenceCandidate],
    });
    expect(reseedFromFile).toHaveBeenCalledWith({ state: 'NH' });
    expect(result).toMatchObject({
      state: 'NH',
      generated_system_count: 2,
      importable_system_count: 1,
      imported: true,
      promoted_system_count: 1,
      canonical_seed_file_systems_before: 1,
      canonical_seed_file_systems_after: 2,
      seed_summary: {
        systems: 2,
        facilities: 2,
        seeds: 3,
      },
    });
  });

  it('skips writes when dryRun is enabled', async () => {
    const result = await importGeneratedSeeds({
      state: 'NH',
      minimumConfidence: 'high',
      dryRun: true,
      generatedSystems: [
        {
          system_name: 'Cottage Hospital',
          state: 'NH',
          discovery_confidence: 'high',
          seed_urls: ['https://www.cottagehospital.org/department/medical-records-health-information-management-him'],
          facilities: [],
        },
      ],
    });

    expect(mergeSystemsIntoStateSeedFile).not.toHaveBeenCalled();
    expect(reseedFromFile).not.toHaveBeenCalled();
    expect(result.imported).toBe(false);
    expect(result.promoted_system_count).toBe(0);
  });
});
