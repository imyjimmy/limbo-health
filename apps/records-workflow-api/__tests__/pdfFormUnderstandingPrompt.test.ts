import { describe, expect, it } from 'vitest';
import {
  PDF_FORM_UNDERSTANDING_RESPONSE_SCHEMA,
  preparePdfFormUnderstandingRequest,
} from '../src/utils/pdfFormUnderstandingPrompt.js';

describe('pdfFormUnderstandingPrompt', () => {
  it('defines strict object schemas that require all declared properties', () => {
    const topLevelProperties = Object.keys(PDF_FORM_UNDERSTANDING_RESPONSE_SCHEMA.properties);
    expect(PDF_FORM_UNDERSTANDING_RESPONSE_SCHEMA.required).toEqual(topLevelProperties);

    const questionSchema = PDF_FORM_UNDERSTANDING_RESPONSE_SCHEMA.properties.questions.items;
    expect(questionSchema.required).toEqual(Object.keys(questionSchema.properties));

    const optionSchema = questionSchema.properties.options.items;
    expect(optionSchema.required).toEqual(Object.keys(optionSchema.properties));

    const bindingSchemas = questionSchema.properties.bindings.items.anyOf;
    expect(bindingSchemas).toHaveLength(5);
    for (const bindingSchema of bindingSchemas) {
      expect(bindingSchema.required).toEqual(Object.keys(bindingSchema.properties));
      expect(bindingSchema.additionalProperties).toBe(false);
    }
  });

  it('builds a compact prompt around fillable regions without including the full text body', () => {
    const prepared = preparePdfFormUnderstandingRequest({
      parsedPdf: {
        title: 'Authorization to Release Information',
        text: 'Very long full text body that should not be included in compact prompts.',
        headerText: 'Authorization',
        pages: [
          {
            pageIndex: 0,
            width: 612,
            height: 792,
            words: [
              { text: 'What', x: 100, y: 150, width: 22, height: 12 },
              { text: 'kind', x: 125, y: 150, width: 20, height: 12 },
              { text: 'of', x: 148, y: 150, width: 10, height: 12 },
              { text: 'records', x: 162, y: 150, width: 36, height: 12 },
              { text: 'do', x: 202, y: 150, width: 12, height: 12 },
              { text: 'you', x: 218, y: 150, width: 20, height: 12 },
              { text: 'want?', x: 242, y: 150, width: 28, height: 12 },
            ],
            widgets: [
              {
                fieldName: 'record_type',
                fieldType: 'checkbox',
                x: 80,
                y: 145,
                width: 12,
                height: 12,
              },
            ],
            lineCandidates: [{ x: 300, y: 220, width: 120, height: 2 }],
            checkboxCandidates: [{ x: 80, y: 145, width: 12, height: 12 }],
          },
        ],
      },
      hospitalSystemName: 'Example Health',
      facilityName: null,
      formName: 'Authorization Form',
      sourceUrl: 'https://example.org/form.pdf',
      promptProfile: 'compact',
      maxInputTokens: 12000,
    });

    expect(prepared.promptMetadata.prompt_profile).toBe('compact');
    expect(prepared.promptMetadata.prompt_over_budget).toBe(false);
    expect(prepared.promptMetadata.estimated_input_tokens).toBeGreaterThan(0);
    expect(prepared.userPrompt).toContain('"labelSnippets"');
    expect(prepared.userPrompt).not.toContain('"textExcerpt":');
    expect(prepared.userPrompt).not.toContain('Very long full text body');
  });

  it('prioritizes lower question widgets over top-of-form admin and bio widgets', () => {
    const prepared = preparePdfFormUnderstandingRequest({
      parsedPdf: {
        title: 'Authorization to Release Information',
        text: '',
        headerText: 'Authorization',
        pages: [
          {
            pageIndex: 0,
            width: 612,
            height: 792,
            words: [
              { text: 'Purpose', x: 80, y: 400, width: 42, height: 12 },
              { text: 'Record', x: 80, y: 375, width: 40, height: 12 },
              { text: 'delivery', x: 124, y: 375, width: 48, height: 12 },
              { text: 'Please', x: 80, y: 352, width: 36, height: 12 },
              { text: 'release', x: 120, y: 352, width: 46, height: 12 },
              { text: 'the', x: 170, y: 352, width: 18, height: 12 },
              { text: 'following', x: 192, y: 352, width: 54, height: 12 },
              { text: 'information', x: 250, y: 352, width: 68, height: 12 },
              { text: 'Alcohol/Drug', x: 220, y: 316, width: 82, height: 12 },
              { text: 'Radiology', x: 442, y: 289, width: 64, height: 12 },
            ],
            widgets: [
              { fieldName: 'PRINT', fieldType: 'Button', x: 180, y: 760, width: 60, height: 23 },
              { fieldName: 'SAVE AS', fieldType: 'Button', x: 250, y: 760, width: 60, height: 23 },
              { fieldName: 'EMAIL', fieldType: 'Button', x: 320, y: 760, width: 60, height: 23 },
              { fieldName: 'RESET', fieldType: 'Button', x: 390, y: 760, width: 60, height: 23 },
              { fieldName: 'Patient Name', fieldType: 'Text', x: 55, y: 546, width: 203, height: 18 },
              { fieldName: 'first_name', fieldType: 'Text', x: 55, y: 538, width: 96, height: 18 },
              { fieldName: 'last_name', fieldType: 'Text', x: 160, y: 538, width: 96, height: 18 },
              { fieldName: 'Last 4 of Social Security Number', fieldType: 'Text', x: 261, y: 546, width: 98, height: 18 },
              { fieldName: 'DOB', fieldType: 'Text', x: 360, y: 553, width: 74, height: 12 },
              { fieldName: 'date_of_birth', fieldType: 'Text', x: 360, y: 538, width: 74, height: 12 },
              { fieldName: 'Acct', fieldType: 'Text', x: 437, y: 546, width: 78, height: 18 },
              { fieldName: 'MRN', fieldType: 'Text', x: 516, y: 546, width: 78, height: 18 },
              { fieldName: 'Patient Street Address', fieldType: 'Text', x: 55, y: 519, width: 254, height: 16 },
              { fieldName: 'Patient City State', fieldType: 'Text', x: 313, y: 519, width: 155, height: 16 },
              { fieldName: 'Patient Zip', fieldType: 'Text', x: 470, y: 519, width: 123, height: 16 },
              { fieldName: 'Patient Telephone Number', fieldType: 'Text', x: 56, y: 493, width: 201, height: 16 },
              { fieldName: 'Patient Email', fieldType: 'Text', x: 261, y: 493, width: 333, height: 16 },
              { fieldName: 'continuedcare', fieldType: 'CheckBox', x: 229, y: 400, width: 10, height: 10 },
              { fieldName: 'legal', fieldType: 'CheckBox', x: 312, y: 400, width: 10, height: 10 },
              { fieldName: 'Fax to healthcare', fieldType: 'CheckBox', x: 207, y: 376, width: 10, height: 10 },
              { fieldName: 'Mail', fieldType: 'CheckBox', x: 362, y: 376, width: 10, height: 10 },
              { fieldName: 'Delivery other fill', fieldType: 'Text', x: 90, y: 364, width: 325, height: 11 },
              { fieldName: 'treatment date from', fieldType: 'Text', x: 343, y: 330, width: 80, height: 13 },
              { fieldName: 'treatment date to', fieldType: 'Text', x: 435, y: 330, width: 80, height: 13 },
              { fieldName: 'Alcohol/Drug', fieldType: 'Text', x: 224, y: 316, width: 37, height: 16 },
              { fieldName: 'summaryabstractonly', fieldType: 'CheckBox', x: 53, y: 300, width: 10, height: 10 },
              { fieldName: 'radiology reports', fieldType: 'CheckBox', x: 442, y: 278, width: 10, height: 10 },
              { fieldName: 'release other fill', fieldType: 'Text', x: 94, y: 244, width: 500, height: 12 },
            ],
            lineCandidates: Array.from({ length: 30 }, (_, index) => ({
              x: 80 + index,
              y: index < 10 ? 560 : 260 + index,
              width: 120,
              height: 0,
            })),
            checkboxCandidates: [],
          },
        ],
      },
      hospitalSystemName: 'Baylor Scott & White Health',
      facilityName: null,
      formName: 'authorization for release of medical information from bswh',
      sourceUrl: 'https://example.org/form.pdf',
      promptProfile: 'compact',
      maxInputTokens: 12000,
    });

    expect(prepared.userPrompt).not.toContain('"field_name": "PRINT"');
    expect(prepared.userPrompt).not.toContain('"field_name": "Patient Street Address"');
    expect(prepared.userPrompt).not.toContain('"field_name": "first_name"');
    expect(prepared.userPrompt).not.toContain('"field_name": "last_name"');
    expect(prepared.userPrompt).not.toContain('"field_name": "date_of_birth"');
    expect(prepared.userPrompt).toContain('"field_name": "continuedcare"');
    expect(prepared.userPrompt).toContain('"field_name": "summaryabstractonly"');
    expect(prepared.userPrompt).toContain('"field_name": "treatment date from"');
    expect(prepared.userPrompt).toContain('"field_name": "radiology reports"');
  });

  it('uses nearby on-page label text even when the widget field name is unhelpful', () => {
    const prepared = preparePdfFormUnderstandingRequest({
      parsedPdf: {
        title: 'Authorization to Release Information',
        text: '',
        headerText: 'Authorization',
        pages: [
          {
            pageIndex: 0,
            width: 612,
            height: 792,
            words: [
              { text: 'Personal', x: 320, y: 400, width: 52, height: 12 },
              { text: 'Use', x: 376, y: 400, width: 28, height: 12 },
            ],
            widgets: [
              ...Array.from({ length: 40 }, (_, index) => ({
                fieldName: `lower-choice-${index}`,
                fieldType: 'CheckBox',
                x: 40 + (index % 4) * 120,
                y: 120 + Math.floor(index / 4) * 14,
                width: 10,
                height: 10,
              })),
              {
                fieldName: 'purpose_value',
                fieldType: 'Text',
                x: 280,
                y: 396,
                width: 120,
                height: 14,
              },
            ],
            lineCandidates: [],
            checkboxCandidates: [],
          },
        ],
      },
      hospitalSystemName: 'Example Health',
      facilityName: null,
      formName: 'Authorization Form',
      sourceUrl: 'https://example.org/form.pdf',
      promptProfile: 'compact',
      maxInputTokens: 12000,
    });

    expect(prepared.userPrompt).toContain('"field_name": "purpose_value"');
  });

  it('falls back to the minimal profile when tighter prompt budgets demand it', () => {
    const prepared = preparePdfFormUnderstandingRequest({
      parsedPdf: {
        title: 'Big Form',
        text: 'A'.repeat(50_000),
        headerText: 'Authorization',
        pages: [
          {
            pageIndex: 0,
            width: 612,
            height: 792,
            words: Array.from({ length: 500 }, (_, index) => ({
              text: `word-${index}`,
              x: 10 + index,
              y: 100,
              width: 20,
              height: 10,
            })),
            widgets: Array.from({ length: 80 }, (_, index) => ({
              fieldName: `field-${index}`,
              fieldType: 'text',
              x: 10 + index,
              y: 200,
              width: 100,
              height: 20,
            })),
            lineCandidates: Array.from({ length: 80 }, (_, index) => ({
              x: 20 + index,
              y: 240,
              width: 100,
              height: 2,
            })),
            checkboxCandidates: Array.from({ length: 80 }, (_, index) => ({
              x: 20 + index,
              y: 260,
              width: 12,
              height: 12,
            })),
          },
        ],
      },
      hospitalSystemName: 'Example Health',
      facilityName: null,
      formName: 'Big Form',
      sourceUrl: 'https://example.org/form.pdf',
      promptProfile: 'expanded',
      maxInputTokens: 5,
    });

    expect(prepared.promptMetadata.prompt_profile_requested).toBe('expanded');
    expect(prepared.promptMetadata.prompt_profile).toBe('minimal');
    expect(prepared.promptMetadata.prompt_over_budget).toBe(true);
  });
});
