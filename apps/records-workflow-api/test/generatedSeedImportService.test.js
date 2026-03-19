import assert from 'node:assert/strict';
import test from 'node:test';

import { importGeneratedSeeds } from '../src/services/generatedSeedImportService.js';

test('importGeneratedSeeds can evaluate generated systems directly without reading a file', async () => {
  const summary = await importGeneratedSeeds({
    state: 'CT',
    dryRun: true,
    generatedSystems: [
      {
        system_name: 'Bridgeport Hospital',
        state: 'CT',
        discovery_confidence: 'high',
        seed_urls: ['https://www.bridgeporthospital.org/patients-and-visitors/medical-records'],
        facilities: [
          {
            facility_name: 'Bridgeport Hospital',
            city: 'Bridgeport',
            state: 'CT'
          }
        ]
      },
      {
        system_name: 'Questionable Candidate',
        state: 'CT',
        discovery_confidence: 'low',
        seed_urls: [],
        facilities: [
          {
            facility_name: 'Questionable Candidate',
            city: 'Somewhere',
            state: 'CT'
          }
        ]
      }
    ]
  });

  assert.equal(summary.input_file_path, null);
  assert.equal(summary.generated_system_count, 2);
  assert.equal(summary.importable_system_count, 1);
  assert.equal(summary.imported, false);
});
