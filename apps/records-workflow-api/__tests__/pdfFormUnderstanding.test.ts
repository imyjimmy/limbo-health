import { describe, expect, it } from 'vitest';
import { normalizePdfFormUnderstanding } from '../src/utils/pdfFormUnderstanding.js';

describe('normalizePdfFormUnderstanding', () => {
  it('drops malformed and low-confidence questions without discarding valid mixed-family questions', () => {
    const result = normalizePdfFormUnderstanding({
      mode: 'overlay',
      confidence: 0.9,
      questions: [
        {
          id: 'record-types',
          label: 'What kind of records do you want?',
          kind: 'multi_select',
          required: true,
          confidence: 0.89,
          options: [
            {
              id: 'xrays',
              label: 'X-rays',
              confidence: 0.95,
              bindings: [
                {
                  type: 'overlay_mark',
                  page_index: 0,
                  x: 120,
                  y: 400,
                  mark: 'x',
                  size: 12,
                },
              ],
            },
            {
              id: 'bad-option',
              label: 'Bad option',
              confidence: 0.4,
              bindings: [
                {
                  type: 'overlay_mark',
                  page_index: 0,
                  x: 120,
                  y: 380,
                  mark: 'x',
                  size: 12,
                },
              ],
            },
          ],
        },
        {
          id: 'other-name',
          label: 'Other name',
          kind: 'short_text',
          required: false,
          confidence: 0.3,
          bindings: [
            {
              type: 'overlay_text',
              page_index: 0,
              x: 200,
              y: 200,
              max_width: 120,
              font_size: 11,
            },
          ],
          options: [],
        },
        {
          id: 'mixed-bindings',
          label: 'Mixed bindings',
          kind: 'single_select',
          required: false,
          confidence: 0.95,
          options: [
            {
              id: 'field-choice',
              label: 'Field choice',
              confidence: 0.95,
              bindings: [
                {
                  type: 'field_checkbox',
                  field_name: 'ChoiceA',
                  checked: true,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result).toEqual({
      supported: true,
      mode: 'overlay',
      template_id: null,
      confidence: 0.9,
      signature_areas: [],
      questions: [
        {
          id: 'record-types',
          label: 'What kind of records do you want?',
          kind: 'multi_select',
          required: true,
          help_text: null,
          confidence: 0.89,
          visibility_rule: null,
          bindings: [],
          options: [
            {
              id: 'xrays',
              label: 'X-rays',
              confidence: 0.95,
              bindings: [
                {
                  type: 'overlay_mark',
                  page_index: 0,
                  x: 120,
                  y: 400,
                  mark: 'x',
                  size: 12,
                },
              ],
            },
          ],
        },
        {
          id: 'mixed-bindings',
          label: 'Mixed bindings',
          kind: 'single_select',
          required: false,
          help_text: null,
          confidence: 0.95,
          visibility_rule: null,
          bindings: [],
          options: [
            {
              id: 'field-choice',
              label: 'Field choice',
              confidence: 0.95,
              bindings: [
                {
                  type: 'field_checkbox',
                  field_name: 'ChoiceA',
                  checked: true,
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('falls back to acroform mode when valid questions span both binding families', () => {
    const result = normalizePdfFormUnderstanding({
      confidence: 0.96,
      questions: [
        {
          id: 'recipient-name',
          label: 'Recipient name',
          kind: 'short_text',
          required: false,
          confidence: 0.95,
          bindings: [
            {
              type: 'field_text',
              field_name: 'RecipientName',
            },
          ],
        },
        {
          id: 'purpose',
          label: 'Purpose of disclosure',
          kind: 'single_select',
          required: false,
          confidence: 0.97,
          options: [
            {
              id: 'continuing-care',
              label: 'Continuing care',
              confidence: 0.97,
              bindings: [
                {
                  type: 'overlay_mark',
                  page_index: 0,
                  x: 120,
                  y: 340,
                  mark: 'x',
                  size: 12,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.supported).toBe(true);
    expect(result.mode).toBe('acroform');
    expect(result.questions.map((question) => question.id)).toEqual([
      'recipient-name',
      'purpose',
    ]);
  });

  it('returns an unsupported payload when no valid questions survive validation', () => {
    expect(
      normalizePdfFormUnderstanding({
        mode: 'acroform',
        confidence: 0.82,
        questions: [
          {
            id: 'unsupported',
            label: 'Unsupported',
            kind: 'essay',
            required: false,
            confidence: 0.99,
            bindings: [],
            options: [],
          },
        ],
      }),
    ).toEqual({
      supported: false,
      mode: 'acroform',
      template_id: null,
      confidence: 0.82,
      questions: [],
      signature_areas: [],
    });
  });

  it('guarantees unique option ids within a question even when extraction duplicates them', () => {
    const result = normalizePdfFormUnderstanding({
      mode: 'acroform',
      confidence: 0.95,
      questions: [
        {
          id: 'facilities',
          label: 'Information to be released from these facilities',
          kind: 'multi_select',
          required: false,
          confidence: 0.95,
          options: [
            {
              id: 'visits',
              label: 'visits',
              confidence: 0.95,
              bindings: [
                {
                  type: 'field_checkbox',
                  field_name: 'Clinic visits',
                  checked: true,
                },
              ],
            },
            {
              id: 'visits',
              label: 'visits',
              confidence: 0.95,
              bindings: [
                {
                  type: 'field_checkbox',
                  field_name: 'Hospital visits',
                  checked: true,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.supported).toBe(true);
    expect(result.questions[0]?.options?.map((option) => option.id)).toEqual([
      'visits',
      'hospital-visits',
    ]);
  });

  it('preserves normalized signature areas alongside the published question payload', () => {
    const result = normalizePdfFormUnderstanding({
      mode: 'overlay',
      confidence: 0.95,
      signature_areas: [
        {
          id: 'Signature1',
          label: 'Patient signature',
          field_name: 'Signature1',
          page_index: 0,
          x: 54,
          y: 176.5,
          width: 324,
          height: 40,
        },
      ],
      questions: [
        {
          id: 'expiration',
          label: 'Enter the expiration date',
          kind: 'short_text',
          required: false,
          confidence: 0.96,
          bindings: [
            {
              type: 'overlay_text',
              page_index: 0,
              x: 120,
              y: 240,
              max_width: 160,
              font_size: 14,
            },
          ],
        },
      ],
    });

    expect(result.supported).toBe(true);
    expect(result.signature_areas).toEqual([
      {
        id: 'signature1',
        label: 'Patient signature',
        field_name: 'Signature1',
        page_index: 0,
        x: 54,
        y: 176.5,
        width: 324,
        height: 40,
      },
    ]);
  });

  it('preserves explicit visibility rules on normalized follow-up questions', () => {
    const result = normalizePdfFormUnderstanding({
      mode: 'acroform',
      confidence: 0.96,
      questions: [
        {
          id: 'purpose-other-details',
          label: 'If other, specify the purpose of the use or disclosure',
          kind: 'short_text',
          required: false,
          confidence: 0.96,
          visibility_rule: {
            parent_question_id: 'purpose-of-use',
            parent_option_ids: ['other'],
          },
          bindings: [
            {
              type: 'field_text',
              field_name: 'fill_4',
            },
          ],
          options: [],
        },
      ],
    });

    expect(result.questions[0]).toMatchObject({
      id: 'purpose-other-details',
      visibility_rule: {
        parent_question_id: 'purpose-of-use',
        parent_option_ids: ['other'],
      },
    });
  });
});
