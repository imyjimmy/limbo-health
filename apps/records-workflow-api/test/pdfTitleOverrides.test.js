import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { deriveAutomaticPdfTitleOverride } from '../src/utils/pdfTitleOverrides.js';

function importFresh(relativePath) {
  const baseUrl = new URL(relativePath, import.meta.url).href;
  return import(`${baseUrl}?t=${Date.now()}-${Math.random()}`);
}

test('deriveAutomaticPdfTitleOverride shortens verbose Valley-style epic header text', () => {
  const override = deriveAutomaticPdfTitleOverride({
    title: 'UH4216 UW Medicine Epic Care Everywhere Patient Opt Out',
    headerText:
      'Valley Medical Center Epic Care Everywhere Patient Opt-Out Valley Medical Center (VMC) participates in a Health Information Exchange (HIE) through Epic Care Everywhere that allows health organizations who utilize Epic as their electronic health records system to exchange electronic health information.',
    headerLines: [
      {
        text: 'Valley Medical Center Epic Care Everywhere Patient Opt-Out'
      },
      {
        text: 'Valley Medical Center (VMC) participates in a Health Information Exchange (HIE) through Epic Care Everywhere that allows health organizations who utilize Epic as their electronic health records system to exchange electronic health information.'
      }
    ],
    facilityName: 'Valley Medical Center',
    systemName: 'UW Medicine'
  });

  assert.equal(override, 'Epic Care Everywhere Patient Opt Out');
});

test('assignPdfStoragePath automatically compacts dangerous filenames before rename', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-storage-auto-'));
  const waDir = path.join(tempDir, 'wa');
  await fs.mkdir(waDir, { recursive: true });

  const previousRawStorageDir = process.env.RAW_STORAGE_DIR;
  process.env.RAW_STORAGE_DIR = tempDir;

  try {
    const { assignPdfStoragePath } = await importFresh('../src/utils/pdfStorage.js');

    const currentStoragePath = path.join(waDir, 'hash.pdf');
    await fs.writeFile(currentStoragePath, Buffer.from('pdf'));

    const nextPath = await assignPdfStoragePath({
      currentStoragePath,
      contentHash: 'hash',
      state: 'WA',
      systemName: 'UW Medicine',
      facilityName: 'Valley Medical Center',
      url: 'https://www.valleymed.org/globalassets/valley-medical/media/files/global/87-9221.2-epic-care-everywhere-patient-opt-out.pdf',
      title: 'UH4216 UW Medicine Epic Care Everywhere Patient Opt Out',
      text:
        'Valley Medical Center Epic Care Everywhere Patient Opt-Out Valley Medical Center (VMC) participates in a Health Information Exchange (HIE) through Epic Care Everywhere that allows health organizations who utilize Epic as their electronic health records system to exchange electronic health information.',
      headerText:
        'Valley Medical Center Epic Care Everywhere Patient Opt-Out Valley Medical Center (VMC) participates in a Health Information Exchange (HIE) through Epic Care Everywhere that allows health organizations who utilize Epic as their electronic health records system to exchange electronic health information.',
      headerLines: [
        {
          text: 'Valley Medical Center Epic Care Everywhere Patient Opt-Out'
        },
        {
          text: 'Valley Medical Center (VMC) participates in a Health Information Exchange (HIE) through Epic Care Everywhere that allows health organizations who utilize Epic as their electronic health records system to exchange electronic health information.'
        }
      ]
    });

    assert.match(nextPath, /valley-medical-center-epic-care-everywhere-patient-opt-out-EN\.pdf$/);
  } finally {
    if (previousRawStorageDir === undefined) delete process.env.RAW_STORAGE_DIR;
    else process.env.RAW_STORAGE_DIR = previousRawStorageDir;
  }
});
