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
