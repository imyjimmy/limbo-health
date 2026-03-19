import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNationalHospitalRoster,
  buildOfficialHospitalIdentities,
  findBestHospitalNameMatch,
  normalizeHospitalName,
  scoreHospitalNameSimilarity
} from '../src/utils/hospitalRoster.js';

test('normalizes hospital names with punctuation and common abbreviations', () => {
  assert.equal(normalizeHospitalName("St. Joseph's Hosp. & Medical Ctr."), 'saint josephs hospital and medical center');
  assert.equal(normalizeHospitalName('The University of Vermont Medical Center'), 'university of vermont medical center');
});

test('scores closely related hospital names highly', () => {
  const score = scoreHospitalNameSimilarity(
    'Porter Medical Center',
    'Porter Medical Center at Middlebury'
  );

  assert.equal(score >= 0.65, true);
});

test('builds active non-skeleton hospital roster from CMS-like CSV content', () => {
  const csvText = [
    'PRVDR_CTGRY_SBTYP_CD,PRVDR_CTGRY_CD,CITY_NAME,FAC_NAME,PRVDR_NUM,SKLTN_REC_SW,STATE_CD,ST_ADR,PHNE_NUM,PGM_TRMNTN_CD,ZIP_CD',
    '01,01,Boston,Massachusetts General Hospital,220071,N,MA,55 Fruit St,6177262000,00,02114',
    '04,01,Boston,Old Psychiatric Hospital,220099,N,MA,1 Main St,6175550100,07,02115',
    '01,01,Concord,Concord Hospital,Y12345,Y,NH,250 Pleasant St,6032252711,00,03301'
  ].join('\n');

  const roster = buildNationalHospitalRoster({ csvText, sourceUrl: 'https://example.org/cms.csv' });

  assert.equal(roster.totals.active_non_skeleton_hospital_rows, 1);
  assert.equal(roster.hospitals_by_state.MA.length, 1);
  assert.equal(roster.hospitals_by_state.NH.length, 0);
});

test('groups official hospital identities by normalized name and city', () => {
  const grouped = buildOfficialHospitalIdentities([
    {
      facility_name: 'Massachusetts General Hospital',
      normalized_facility_name: normalizeHospitalName('Massachusetts General Hospital'),
      city: 'Boston',
      normalized_city: normalizeHospitalName('Boston'),
      state: 'MA',
      provider_number: '220071',
      provider_category_subtype_label: 'Short Term'
    },
    {
      facility_name: 'Massachusetts General Hospital',
      normalized_facility_name: normalizeHospitalName('Massachusetts General Hospital'),
      city: 'Boston',
      normalized_city: normalizeHospitalName('Boston'),
      state: 'MA',
      provider_number: '220072',
      provider_category_subtype_label: 'Short Term'
    }
  ]);

  assert.equal(grouped.length, 1);
  assert.deepEqual(grouped[0].provider_numbers, ['220071', '220072']);
});

test('finds the best candidate match for an official hospital', () => {
  const officialHospital = {
    facility_name: 'Porter Medical Center',
    normalized_facility_name: normalizeHospitalName('Porter Medical Center'),
    city: 'Middlebury',
    normalized_city: normalizeHospitalName('Middlebury')
  };

  const best = findBestHospitalNameMatch(officialHospital, [
    {
      name: 'University of Vermont Medical Center',
      type: 'system',
      city: null,
      normalizedCity: ''
    },
    {
      name: 'Porter Medical Center',
      type: 'facility',
      city: 'Middlebury',
      normalizedCity: normalizeHospitalName('Middlebury')
    }
  ]);

  assert.equal(best?.candidate?.name, 'Porter Medical Center');
  assert.equal(best?.score, 1);
});
