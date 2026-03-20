import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFTextField } from 'pdf-lib';
import type { BioProfile } from '../types/bio';
import type {
  RecordsRequestUserSignature,
  RecordsWorkflowForm,
} from '../types/recordsRequest';

vi.mock('react-native-fs', () => ({
  default: {
    TemporaryDirectoryPath: '/tmp',
    writeFile: vi.fn(),
  },
}));

import { __testing__ } from '../core/recordsWorkflow/pdf';

function createForm(
  name: string,
  overrides: Partial<RecordsWorkflowForm> = {},
): RecordsWorkflowForm {
  return {
    name,
    url: `https://example.org/${name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
    format: 'pdf',
    cachedSourceDocumentId: null,
    cachedContentUrl: `https://cache.example.org/${name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
    autofill: {
      supported: true,
      mode: 'acroform',
      templateId: null,
      confidence: 0.95,
      questions: [],
    },
    ...overrides,
  };
}

describe('records workflow pdf helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T15:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prefers release-from hospital forms over release-to hospital intake forms', () => {
    const sorted = __testing__.sortPdfForms([
      createForm('authorization for release of medical information to bswh'),
      createForm('authorization for release of medical information from bswh'),
      createForm('authorization for release of medical information to bswh spanish', {
        cachedContentUrl: null,
      }),
    ]);

    expect(sorted.map((form) => form.name)).toEqual([
      'authorization for release of medical information from bswh',
      'authorization for release of medical information to bswh',
      'authorization for release of medical information to bswh spanish',
    ]);
  });

  it('prefers the target language when equivalent form variants exist', () => {
    const primaryForm = __testing__.getPrimaryPdfForm(
      [
        createForm('authorization for release of medical information from bswh'),
        createForm('authorization for release of medical information from bswh spanish'),
      ],
      {
        preferredLanguage: 'es',
      },
    );

    expect(primaryForm?.name).toBe(
      'authorization for release of medical information from bswh spanish',
    );
  });

  it('fills separate street city state zip layouts instead of only the zip field', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const form = pdf.getForm();

    const addTextField = (name: string) => {
      const field = form.createTextField(name);
      field.addToPage(page, { x: 24, y: 24, width: 200, height: 20 });
      return field;
    };

    addTextField('Patient Name');
    addTextField('Street');
    addTextField('City');
    addTextField('State');
    addTextField('Zip');
    addTextField('Printed Name of Patient or Legal Representative');
    addTextField('Relationship to Patient');
    addTextField('Date');

    const bioProfile: BioProfile = {
      fullName: 'Jimmy Zhang',
      dateOfBirth: '03/20/1990',
      phoneNumber: '',
      email: '',
      addressLine1: '123 Main St',
      addressLine2: 'Apt 4B',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
    };

    const result = __testing__.fillBioFields(pdf, bioProfile);

    expect(result.filledCount).toBeGreaterThanOrEqual(8);
    expect((form.getField('Patient Name') as PDFTextField).getText()).toBe('Jimmy Zhang');
    expect((form.getField('Street') as PDFTextField).getText()).toBe('123 Main St Apt 4B');
    expect((form.getField('City') as PDFTextField).getText()).toBe('Austin');
    expect((form.getField('State') as PDFTextField).getText()).toBe('TX');
    expect((form.getField('Zip') as PDFTextField).getText()).toBe('78701');
    expect(
      (form.getField('Printed Name of Patient or Legal Representative') as PDFTextField).getText(),
    ).toBe('Jimmy Zhang');
    expect((form.getField('Relationship to Patient') as PDFTextField).getText()).toBe('Self');
    expect((form.getField('Date') as PDFTextField).getText()).toBe('03/20/2026');
  });

  it('fills recipient contact fallback fields when the patient or designee should receive records', async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const form = pdf.getForm();

    const addTextField = (name: string) => {
      const field = form.createTextField(name);
      field.addToPage(page, { x: 24, y: 24, width: 200, height: 20 });
      return field;
    };

    addTextField('Patient Telephone Number');
    addTextField('Patient Email');
    addTextField('IndividualOrganization Name');
    addTextField('Telephone Number_2');

    const bioProfile: BioProfile = {
      fullName: 'Jimmy Zhang',
      dateOfBirth: '03/20/1990',
      phoneNumber: '512 555 0123',
      email: 'jimmy@example.com',
      addressLine1: '123 Main St',
      addressLine2: 'Apt 4B',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
    };

    const allowPatientRecipientFallback = __testing__.shouldFillPatientRecipientFields(
      createForm('authorization for release of medical information from bswh', {
        autofill: {
          supported: true,
          mode: 'acroform',
          templateId: null,
          confidence: 0.95,
          questions: [
            {
              id: 'release-recipient',
              label: 'Who should the medical information be released to?',
              kind: 'multi_select',
              required: true,
              helpText: null,
              confidence: 0.98,
              bindings: [],
              options: [
                {
                  id: 'patient-designee',
                  label: 'Patient/Designee',
                  confidence: 0.99,
                  bindings: [],
                },
                {
                  id: 'health-care-entity',
                  label: 'Health Care Entity',
                  confidence: 0.99,
                  bindings: [],
                },
              ],
            },
          ],
        },
      }),
      {
        'release-recipient': ['patient-designee'],
      },
    );

    const result = __testing__.fillBioFields(pdf, bioProfile, {
      allowPatientRecipientFallback,
    });

    expect(result.filledCount).toBeGreaterThanOrEqual(4);
    expect((form.getField('Patient Telephone Number') as PDFTextField).getText()).toBe(
      '512 555 0123',
    );
    expect((form.getField('Patient Email') as PDFTextField).getText()).toBe(
      'jimmy@example.com',
    );
    expect((form.getField('IndividualOrganization Name') as PDFTextField).getText()).toBe(
      'Jimmy Zhang',
    );
    expect((form.getField('Telephone Number_2') as PDFTextField).getText()).toBe(
      '512 555 0123',
    );
  });

  it('draws a captured signature into detected signature rectangles', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 300]);

    const signature: RecordsRequestUserSignature = {
      width: 280,
      height: 140,
      strokes: [
        {
          points: [
            { x: 24, y: 88 },
            { x: 80, y: 64 },
            { x: 134, y: 96 },
            { x: 196, y: 58 },
          ],
        },
      ],
    };

    const appliedCount = __testing__.applySignatureOverlays(
      pdf,
      [
        {
          fieldName: 'Signature1',
          pageIndex: 0,
          x: 36,
          y: 40,
          width: 180,
          height: 44,
        },
      ],
      signature,
    );

    expect(appliedCount).toBe(1);
    expect(await pdf.save()).toBeInstanceOf(Uint8Array);
  });
});
