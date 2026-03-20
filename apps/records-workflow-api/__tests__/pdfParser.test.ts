import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parsePdfDocument } from '../src/parsers/pdfParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storageRoot = path.resolve(__dirname, '../storage/raw');

describe('pdf parser page model', () => {
  it('captures words, line candidates, and checkbox candidates for flat forms', async () => {
    const filePath = path.join(
      storageRoot,
      'wa',
      'multicare-authorization-to-release-health-care-information-EN.pdf',
    );
    const buffer = await fs.readFile(filePath);

    const parsed = await parsePdfDocument({ buffer, filePath });

    expect(parsed.parseStatus).toBe('success');
    expect(parsed.pages.length).toBeGreaterThan(0);
    expect(parsed.pages[0]?.width).toBe(612);
    expect(parsed.pages[0]?.height).toBe(792);
    expect(parsed.pages[0]?.words.length).toBeGreaterThan(100);
    expect(parsed.pages[0]?.lineCandidates.length).toBeGreaterThan(0);
    expect(parsed.pages[0]?.checkboxCandidates.length).toBeGreaterThan(0);
    expect(parsed.pages[0]?.checkboxCandidates[0]).toMatchObject({
      shape: 'checkbox_glyph',
    });
  });

  it('captures widget metadata when the PDF exposes real AcroForm fields', async () => {
    const filePath = path.join(
      storageRoot,
      'ak',
      'alaska-native-medical-center-authorization-for-use-and-disclosure-of-health-information-EN.pdf',
    );
    const buffer = await fs.readFile(filePath);

    const parsed = await parsePdfDocument({ buffer, filePath });
    const firstWidget = parsed.pages[0]?.widgets[0];

    expect(parsed.parseStatus).toBe('success');
    expect(parsed.pages[0]?.widgets.length).toBeGreaterThan(0);
    expect(firstWidget).toMatchObject({
      fieldName: 'Patient Name',
      fieldType: 'Text',
    });
    expect(firstWidget?.x).toBeTypeOf('number');
    expect(firstWidget?.y).toBeTypeOf('number');
  });
});
