import assert from 'node:assert/strict';
import test from 'node:test';

function importFresh(relativePath) {
  const baseUrl = new URL(relativePath, import.meta.url).href;
  return import(`${baseUrl}?t=${Date.now()}-${Math.random()}`);
}

test('resolveSeedFilePath prefers explicit file, resolves states, and preserves Texas default', async () => {
  const { resolveSeedFilePath } = await importFresh('../src/services/seedService.js');

  assert.match(resolveSeedFilePath({}), /seeds\/texas-systems\.json$/);
  assert.match(resolveSeedFilePath({ state: 'MA' }), /seeds\/massachusetts-systems\.json$/);
  assert.match(resolveSeedFilePath({ state: 'AL' }), /seeds\/alabama-systems\.json$/);
  assert.match(
    resolveSeedFilePath({ state: 'MA', seedFilePath: 'seeds/custom-systems.json' }),
    /seeds\/custom-systems\.json$/
  );
});

test('listActiveSeeds adds a state filter before the system-name filter', async (t) => {
  const calls = [];

  test.mock.module('../src/db.js', {
    namedExports: {
      query: async (text, params = []) => {
        calls.push({ text, params });
        return { rows: [] };
      },
      withTransaction: async () => {
        throw new Error('withTransaction should not be used in this test');
      }
    }
  });

  try {
    const { listActiveSeeds } = await importFresh('../src/repositories/workflowRepository.js');
    await listActiveSeeds({ state: 'MA', systemName: 'Tufts Medicine' });

    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /hs\.state = \$1/);
    assert.match(calls[0].text, /hs\.system_name = \$2/);
    assert.deepEqual(calls[0].params, ['MA', 'Tufts Medicine']);
  } finally {
    test.mock.restoreAll();
    test.mock.reset();
  }
});

test('runCrawl forwards the state filter and only crawls returned seeds', async (t) => {
  const seen = {
    listArgs: null,
    fetchedUrls: [],
    saved: []
  };

  test.mock.module('../src/repositories/workflowRepository.js', {
    namedExports: {
      listActiveSeeds: async (args) => {
        seen.listArgs = args;
        return [
          {
            id: 'seed-ma',
            url: 'https://example.org/ma-records',
            seed_type: 'system_records_page',
            hospital_system_id: 'system-ma',
            facility_id: null,
            system_name: 'Example Massachusetts Health',
            canonical_domain: 'example.org',
            system_state: 'MA',
            facility_name: null
          }
        ];
      },
      saveExtractionResult: async (payload) => {
        seen.saved.push(payload);
        return 'source-ma';
      }
    }
  });

  test.mock.module('../src/crawler/fetcher.js', {
    namedExports: {
      fetchAndParseDocument: async ({ url }) => {
        seen.fetchedUrls.push(url);
        return {
          sourceUrl: url,
          finalUrl: url,
          sourceType: 'html',
          status: 200,
          title: 'Example Massachusetts Health Medical Records',
          fetchedAt: '2026-03-15T00:00:00.000Z',
          contentHash: 'hash-ma',
          storagePath: '/tmp/hash-ma.html',
          extractedText: 'Medical records request by fax and mail.',
          parserVersion: 'v1',
          parsed: {
            title: 'Example Massachusetts Health Medical Records',
            text: 'Medical records request by fax and mail.',
            links: []
          }
        };
      }
    }
  });

  test.mock.module('../src/crawler/linkExpander.js', {
    namedExports: {
      expandCandidateLinks: () => [],
      isOfficialDomain: () => true
    }
  });

  test.mock.module('../src/extractors/workflowExtractor.js', {
    namedExports: {
      extractWorkflowBundle: () => ({
        portal: null,
        workflows: [
          {
            workflowType: 'medical_records',
            requestScope: 'complete_chart',
            formalRequestRequired: true,
            onlineRequestAvailable: false,
            portalRequestAvailable: false,
            emailAvailable: false,
            faxAvailable: true,
            mailAvailable: true,
            inPersonAvailable: false,
            phoneAvailable: false,
            turnaroundNotes: null,
            feeNotes: null,
            specialInstructions: null,
            confidence: 'high',
            contacts: [],
            forms: [],
            instructions: []
          }
        ],
        evidenceSnippets: []
      })
    }
  });

  try {
    const { runCrawl } = await importFresh('../src/services/crawlService.js');
    const summary = await runCrawl({ state: 'MA' });

    assert.deepEqual(seen.listArgs, { systemName: null, state: 'MA' });
    assert.deepEqual(seen.fetchedUrls, ['https://example.org/ma-records']);
    assert.equal(summary.systems, 1);
    assert.equal(summary.extracted, 1);
    assert.equal(seen.saved.length, 1);
    assert.equal(seen.saved[0].sourceDocument.hospitalSystemId, 'system-ma');
  } finally {
    test.mock.restoreAll();
    test.mock.reset();
  }
});

test('reseedSystems preserves distinct same-domain systems when names differ', async () => {
  const upsertCalls = [];

  test.mock.module('../src/db.js', {
    namedExports: {
      withTransaction: async (fn) => fn({}),
      query: async () => {
        throw new Error('query should not be used directly in this test');
      }
    }
  });

  test.mock.module('../src/repositories/workflowRepository.js', {
    namedExports: {
      findHospitalSystemByDomain: async ({ domain, state }) => ({
        id: 'existing-va-richmond',
        system_name: 'VA Richmond Health Care',
        canonical_domain: domain,
        state
      }),
      findHospitalSystemByFacilityIdentity: async () => null,
      upsertHospitalSystem: async (payload) => {
        upsertCalls.push(payload);
        return { id: `system-${upsertCalls.length}`, system_name: payload.systemName };
      },
      upsertFacility: async () => `facility-${upsertCalls.length}`,
      upsertSeedUrl: async () => `seed-${upsertCalls.length}`
    }
  });

  try {
    const { reseedSystems } = await importFresh('../src/services/seedService.js');

    await reseedSystems([
      {
        system_name: 'VA Hampton Health Care',
        domain: 'va.gov',
        state: 'VA',
        seed_urls: ['https://www.va.gov/hampton-health-care/medical-records-office/'],
        facilities: [
          {
            facility_name: 'VA Hampton Health Care',
            city: 'Hampton',
            state: 'VA'
          }
        ]
      }
    ]);

    assert.equal(upsertCalls.length, 1);
    assert.equal(upsertCalls[0].systemName, 'VA Hampton Health Care');
    assert.equal(upsertCalls[0].domain, 'va.gov');
    assert.equal(upsertCalls[0].state, 'VA');
  } finally {
    test.mock.restoreAll();
    test.mock.reset();
  }
});

test('reseedSystems attaches facility page seed urls to the matching facility', async () => {
  const seedCalls = [];

  test.mock.module('../src/db.js', {
    namedExports: {
      withTransaction: async (fn) => fn({}),
      query: async () => {
        throw new Error('query should not be used directly in this test');
      }
    }
  });

  test.mock.module('../src/repositories/workflowRepository.js', {
    namedExports: {
      findHospitalSystemByDomain: async () => null,
      findHospitalSystemByFacilityIdentity: async () => null,
      upsertHospitalSystem: async () => ({ id: 'system-wa-multicare', system_name: 'MultiCare' }),
      upsertFacility: async ({ facilityName }) =>
        facilityName === 'Deaconess Hospital' ? 'facility-deaconess' : 'facility-yakima',
      upsertSeedUrl: async (payload) => {
        seedCalls.push(payload);
        return `seed-${seedCalls.length}`;
      }
    }
  });

  try {
    const { reseedSystems } = await importFresh('../src/services/seedService.js');

    await reseedSystems([
      {
        system_name: 'MultiCare',
        domain: 'multicare.org',
        state: 'WA',
        seed_urls: [
          'https://www.multicare.org/patient-resources/medical-records/deaconess-hospital-patients/',
          'https://www.multicare.org/patient-resources/medical-records/yakima-memorial-hospital-patients/',
          'https://www.multicare.org/patient-resources/medical-records/'
        ],
        facilities: [
          {
            facility_name: 'Deaconess Hospital',
            city: 'Spokane',
            state: 'WA',
            facility_page_url:
              'https://www.multicare.org/patient-resources/medical-records/deaconess-hospital-patients/'
          },
          {
            facility_name: 'Yakima Memorial Hospital',
            city: 'Yakima',
            state: 'WA',
            facility_page_url:
              'https://www.multicare.org/patient-resources/medical-records/yakima-memorial-hospital-patients/'
          }
        ]
      }
    ]);

    assert.deepEqual(
      seedCalls.map((call) => ({ url: call.url, facilityId: call.facilityId })),
      [
        {
          url: 'https://www.multicare.org/patient-resources/medical-records/deaconess-hospital-patients/',
          facilityId: 'facility-deaconess'
        },
        {
          url: 'https://www.multicare.org/patient-resources/medical-records/yakima-memorial-hospital-patients/',
          facilityId: 'facility-yakima'
        },
        {
          url: 'https://www.multicare.org/patient-resources/medical-records/',
          facilityId: null
        }
      ]
    );
  } finally {
    test.mock.restoreAll();
    test.mock.reset();
  }
});
