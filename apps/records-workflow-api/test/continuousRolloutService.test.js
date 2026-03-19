import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  determineRolloutStates,
  runContinuousRollout
} from '../src/services/continuousRolloutService.js';

test('determineRolloutStates prioritizes remediation states before uncrawled remaining states', () => {
  const states = determineRolloutStates({
    roster: {
      state_summaries: [
        { state: 'CT', unique_hospital_identities: 30 },
        { state: 'ME', unique_hospital_identities: 36 },
        { state: 'NH', unique_hospital_identities: 30 }
      ]
    },
    currentAudit: {
      state_audits: [
        { state: 'NH', coverage: { missing_hospitals: 4 } },
        { state: 'VT', coverage: { missing_hospitals: 3 } }
      ]
    },
    allRemaining: true
  });

  assert.deepEqual(states, ['VT', 'NH', 'CT', 'ME']);
});

test('determineRolloutStates excludes DC from automatic nationwide targets', () => {
  const states = determineRolloutStates({
    roster: {
      state_summaries: [
        { state: 'DC', unique_hospital_identities: 12 },
        { state: 'DE', unique_hospital_identities: 16 },
        { state: 'RI', unique_hospital_identities: 16 }
      ]
    },
    currentAudit: {
      state_audits: []
    },
    allRemaining: true
  });

  assert.deepEqual(states, ['DE', 'RI']);
});

test('runContinuousRollout keeps going after a not_ready state in dry-run mode', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'records-rollout-'));
  const rosterFilePath = path.join(tempDir, 'roster.json');
  await fs.writeFile(
    rosterFilePath,
    JSON.stringify(
      {
        state_summaries: [
          { state: 'NH', unique_hospital_identities: 30 },
          { state: 'CT', unique_hospital_identities: 28 },
          { state: 'RI', unique_hospital_identities: 16 }
        ],
        hospitals_by_state: {
          NH: [],
          CT: [],
          RI: []
        },
        filters: {}
      },
      null,
      2
    )
  );

  const generatedStates = [];
  const importedStates = [];
  const importedGeneratedCounts = [];
  const crawledStates = [];
  const auditCalls = [];

  const auditFn = async ({ states = null }) => {
    auditCalls.push(states ? [...states] : null);

    if (!states) {
      if (auditCalls.length === 1) {
        return {
          state_audits: [
            {
              state: 'NH',
              recommendation: 'review',
              coverage: { missing_hospitals: 3 },
              db: { low_confidence_rate: 0.1, workflow_count: 10 }
            }
          ]
        };
      }

      return {
        state_audits: [
          {
            state: 'NH',
            recommendation: 'not_ready',
            coverage: { missing_hospitals: 6 },
            db: { low_confidence_rate: 0.15, workflow_count: 12 }
          },
          {
            state: 'CT',
            recommendation: 'review',
            coverage: { missing_hospitals: 4 },
            db: { low_confidence_rate: 0.08, workflow_count: 9 }
          },
          {
            state: 'RI',
            recommendation: 'ready',
            coverage: { missing_hospitals: 1 },
            db: { low_confidence_rate: 0.03, workflow_count: 8 }
          }
        ]
      };
    }

    const state = states[0];
    return {
      state_audits: [
        {
          state,
          recommendation: state === 'NH' ? 'not_ready' : state === 'CT' ? 'review' : 'ready',
          coverage: { missing_hospitals: state === 'NH' ? 6 : state === 'CT' ? 4 : 1 },
          db: { low_confidence_rate: state === 'RI' ? 0.03 : 0.1, workflow_count: 10 }
        }
      ]
    };
  };

  const { report } = await runContinuousRollout({
    allRemaining: true,
    dryRun: true,
    rosterFilePath,
    generateFn: async ({ state }) => {
      generatedStates.push(state);
      return {
        state,
        confidence_summary: { high: 1, medium: 0, low: 0 },
        entries: [{ system_name: `${state} Health`, state, seed_urls: [] }]
      };
    },
    importFn: async ({ state, generatedSystems }) => {
      importedStates.push(state);
      importedGeneratedCounts.push(Array.isArray(generatedSystems) ? generatedSystems.length : 0);
      return { state, imported: true };
    },
    crawlFn: async ({ state }) => {
      crawledStates.push(state);
      return { status: 'ok', crawled: 1, extracted: 1, failed: 0, systems: 1, details: [] };
    },
    auditFn
  });

  assert.deepEqual(report.targeted_states, ['NH', 'RI', 'CT']);
  assert.deepEqual(generatedStates, ['NH', 'RI', 'CT']);
  assert.deepEqual(importedStates, ['NH', 'RI', 'CT']);
  assert.deepEqual(importedGeneratedCounts, [1, 1, 1]);
  assert.deepEqual(crawledStates, []);
  assert.equal(report.state_runs.length, 3);
  assert.equal(report.state_report_cards.length, 3);
  assert.deepEqual(report.national_summary.states_by_verdict, {
    ready: ['RI'],
    review: ['CT'],
    not_ready: ['NH']
  });
});

test('runContinuousRollout with an explicit state skips the baseline national audit', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'records-rollout-one-state-'));
  const rosterFilePath = path.join(tempDir, 'roster.json');
  await fs.writeFile(
    rosterFilePath,
    JSON.stringify(
      {
        state_summaries: [{ state: 'CT', unique_hospital_identities: 28 }],
        hospitals_by_state: { CT: [] },
        filters: {}
      },
      null,
      2
    )
  );

  const auditCalls = [];
  const { report } = await runContinuousRollout({
    state: 'CT',
    dryRun: true,
    rosterFilePath,
    generateFn: async ({ state }) => ({
      state,
      confidence_summary: { high: 0, medium: 0, low: 1 },
      entries: []
    }),
    importFn: async ({ state }) => ({ state, imported: false }),
    crawlFn: async () => ({ status: 'dry_run', systems: 0, crawled: 0, extracted: 0, failed: 0, details: [] }),
    auditFn: async ({ states = null }) => {
      auditCalls.push(states ? [...states] : null);
      return {
        state_audits: [
          {
            state: 'CT',
            recommendation: 'review',
            coverage: {
              missing_hospitals: 4,
              exact_match_rate: 0.6,
              weighted_match_rate: 0.72,
              official_unique_hospital_identities: 28,
              likely_matches: 2,
              possible_matches: 1
            },
            db: {
              low_confidence_rate: 0.1,
              workflow_count: 8,
              low_confidence_count: 1,
              source_document_count: 5
            },
            raw_storage: { raw_pdf_file_count: 0 },
            raw_pdf_snapshot: { parse_error_count: 0 }
          }
        ]
      };
    }
  });

  assert.deepEqual(report.targeted_states, ['CT']);
  assert.deepEqual(auditCalls, [['CT'], ['CT']]);
});
