import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNationalHospitalRoster } from '../src/utils/hospitalRoster.js';
import {
  classifyGeneratedSeedConfidence,
  discoverHospitalSeedCandidate,
  generateStateSeedCandidates,
  groupGeneratedSeedCandidates
} from '../src/services/generatedSeedService.js';
import { normalizeHospitalName } from '../src/utils/hospitalRoster.js';

test('classifies generated seed confidence based on discovered official workflow evidence', () => {
  assert.equal(
    classifyGeneratedSeedConfidence({
      officialUrl: 'https://example.org/medical-records',
      workflowSeedUrls: ['https://example.org/medical-records'],
      portalSeedUrls: ['https://portal.example.org/mychart']
    }),
    'high'
  );

  assert.equal(
    classifyGeneratedSeedConfidence({
      officialUrl: 'https://example.org/',
      workflowSeedUrls: [],
      portalSeedUrls: ['https://portal.example.org/mychart']
    }),
    'medium'
  );

  assert.equal(
    classifyGeneratedSeedConfidence({
      officialUrl: null,
      workflowSeedUrls: [],
      portalSeedUrls: []
    }),
    'low'
  );
});

test('groups generated discoveries by domain and lowers confidence to the weakest member', () => {
  const grouped = groupGeneratedSeedCandidates([
    {
      state: 'VT',
      official_hospital_name: 'Porter Medical Center',
      official_city: 'Middlebury',
      canonical_domain: 'uvmhealth.org',
      system_name_candidate: 'University of Vermont Health',
      seed_urls: ['https://www.uvmhealth.org/locations/medical-records-office-uvm-health-porter-medical-center'],
      discovery_confidence: 'high',
      evidence_urls: ['https://www.uvmhealth.org/locations/porter-medical-center']
    },
    {
      state: 'VT',
      official_hospital_name: 'Central Vermont Medical Center',
      official_city: 'Berlin',
      canonical_domain: 'uvmhealth.org',
      system_name_candidate: 'University of Vermont Health',
      seed_urls: ['https://www.uvmhealth.org/locations/medical-records-office-central-vermont-medical-center'],
      discovery_confidence: 'medium',
      evidence_urls: ['https://www.uvmhealth.org/locations/central-vermont-medical-center']
    }
  ]);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].discovery_confidence, 'medium');
  assert.equal(grouped[0].facilities.length, 2);
  assert.equal(grouped[0].domain, 'uvmhealth.org');
});

test('generates an import-compatible state seed file in dry-run mode from roster hospitals', async () => {
  const csvText = [
    'PRVDR_CTGRY_SBTYP_CD,PRVDR_CTGRY_CD,CITY_NAME,FAC_NAME,PRVDR_NUM,SKLTN_REC_SW,STATE_CD,ST_ADR,PHNE_NUM,PGM_TRMNTN_CD,ZIP_CD',
    '01,01,Middlebury,Porter Medical Center,471307,N,VT,115 Porter Dr,8023884701,00,05753'
  ].join('\n');
  const roster = buildNationalHospitalRoster({ csvText, sourceUrl: 'https://example.org/cms.csv' });

  const searchFn = async (query) => {
    if (/medical records/i.test(query)) {
      return [
        {
          title: 'Medical Records Office, UVM Health - Porter Medical Center',
          url: 'https://www.uvmhealth.org/locations/medical-records-office-uvm-health-porter-medical-center',
          snippet: 'Request medical records from Porter Medical Center.'
        }
      ];
    }

    return [
      {
        title: 'Porter Medical Center | University of Vermont Health',
        url: 'https://www.uvmhealth.org/locations/porter-medical-center',
        snippet: 'Official Porter Medical Center page.'
      }
    ];
  };

  const fetchImpl = async (url) => {
    const html = `
      <html>
        <head><title>University of Vermont Health</title></head>
        <body>
          <a href="/patients-visitors/request-medical-records">Request Medical Records</a>
          <a href="https://mychart.uvmhealth.org/">MyChart</a>
        </body>
      </html>
    `;
    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  };

  const summary = await generateStateSeedCandidates({
    state: 'VT',
    roster,
    dryRun: true,
    fetchImpl,
    searchFn
  });

  assert.equal(summary.generated_systems, 1);
  assert.equal(summary.confidence_summary.high, 1);
  assert.equal(summary.entries[0].state, 'VT');
  assert.equal(summary.entries[0].facilities[0].facility_name, 'Porter Medical Center');
  assert.equal(
    summary.entries[0].seed_urls.includes('https://www.uvmhealth.org/patients-visitors/request-medical-records'),
    true
  );
});

test('rejects generic city pages and picks the later official hospital candidate', async () => {
  const officialHospital = {
    facility_name: 'Bridgeport Hospital',
    city: 'Bridgeport',
    state: 'CT',
    state_name: 'Connecticut',
    normalized_facility_name: normalizeHospitalName('Bridgeport Hospital'),
    normalized_city: normalizeHospitalName('Bridgeport'),
    provider_numbers: ['070001']
  };

  const searchFn = async (query) => {
    if (/medical records/i.test(query)) {
      return [
        {
          title: 'Bridgeport | History, Culture, CT',
          url: 'https://www.britannica.com/place/Bridgeport',
          snippet: 'Bridgeport is the largest city in Connecticut.'
        },
        {
          title: 'Medical Records | Bridgeport Hospital',
          url: 'https://www.bridgeporthospital.org/patients-and-visitors/medical-records',
          snippet: 'Request medical records from Bridgeport Hospital.'
        }
      ];
    }

    return [
      {
        title: 'Bridgeport | History, Culture, CT',
        url: 'https://www.britannica.com/place/Bridgeport',
        snippet: 'Bridgeport is the largest city in Connecticut.'
      },
      {
        title: 'Bridgeport Hospital | Yale New Haven Health',
        url: 'https://www.bridgeporthospital.org/',
        snippet: 'Official Bridgeport Hospital site.'
      }
    ];
  };

  const fetchImpl = async (url) => {
    if (/britannica\.com/.test(url)) {
      return new Response(
        `
          <html>
            <head><title>Bridgeport | Connecticut, Map, Population, History, & Facts</title></head>
            <body>
              <h1>Bridgeport</h1>
              <p>Bridgeport is a city in Connecticut.</p>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' }
        }
      );
    }

    return new Response(
      `
        <html>
          <head><title>Medical Records | Bridgeport Hospital</title></head>
          <body>
            <h1>Bridgeport Hospital</h1>
            <a href="/patients-and-visitors/medical-records">Medical Records</a>
          </body>
        </html>
      `,
      {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      }
    );
  };

  const discovery = await discoverHospitalSeedCandidate(officialHospital, {
    fetchImpl,
    searchFn
  });

  assert.equal(discovery.canonical_domain, 'bridgeporthospital.org');
  assert.equal(
    discovery.seed_urls.includes('https://www.bridgeporthospital.org/patients-and-visitors/medical-records'),
    true
  );
});

test('rejects hospital directory domains and prefers the official hospital domain', async () => {
  const officialHospital = {
    facility_name: 'AdventHealth Central Texas',
    city: 'Killeen',
    state: 'TX',
    state_name: 'Texas',
    normalized_facility_name: normalizeHospitalName('AdventHealth Central Texas'),
    normalized_city: normalizeHospitalName('Killeen'),
    provider_numbers: ['450152']
  };

  const searchFn = async () => [
    {
      title: 'Adventhealth Central Texas - a Hospital in Killeen TX - HealthCare4PPL',
      url: 'https://www.healthcare4ppl.com/hospital/texas/killeen/adventhealth-central-texas-450152.html',
      snippet: 'Adventhealth Central Texas is located in Killeen, Texas.'
    },
    {
      title: 'Medical Records - AdventHealth',
      url: 'https://www.adventhealth.com/hospital/adventhealth-central-texas/medical-records',
      snippet: 'Access medical records for AdventHealth Central Texas.'
    }
  ];

  const fetchImpl = async (url) => {
    if (/healthcare4ppl\.com/.test(url)) {
      return new Response(
        `
          <html>
            <head><title>Adventhealth Central Texas - a Hospital in Killeen TX - HealthCare4PPL</title></head>
            <body>
              <h1>Adventhealth Central Texas</h1>
              <p>Hospital profile and contact details.</p>
            </body>
          </html>
        `,
        {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' }
        }
      );
    }

    return new Response(
      `
        <html>
          <head><title>Medical Records - AdventHealth</title></head>
          <body>
            <h1>AdventHealth Central Texas</h1>
            <a href="/locations/hospitals/central-texas/medical-records">Medical Records</a>
            <a href="https://account.adventhealth.com/login">Patient Portal</a>
          </body>
        </html>
      `,
      {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      }
    );
  };

  const discovery = await discoverHospitalSeedCandidate(officialHospital, {
    fetchImpl,
    searchFn
  });

  assert.equal(discovery.canonical_domain, 'adventhealth.com');
  assert.equal(discovery.discovery_confidence, 'high');
  assert.equal(
    discovery.seed_urls.includes('https://www.adventhealth.com/locations/hospitals/central-texas/medical-records'),
    true
  );
});
