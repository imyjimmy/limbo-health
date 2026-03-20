import { describe, expect, it } from 'vitest';
import {
  buildRecordsRequestSteps,
  isAutofillQuestionAnswered,
  validateAutofillAnswers,
} from '../core/recordsWorkflow/autofill';
import type { RecordsWorkflowAutofillQuestion } from '../types/recordsRequest';

const multiSelectQuestion: RecordsWorkflowAutofillQuestion = {
  id: 'record-types',
  label: 'What kind of records do you want?',
  kind: 'multi_select',
  required: true,
  helpText: 'Choose every category that applies.',
  confidence: 0.92,
  bindings: [],
  options: [
    {
      id: 'xrays',
      label: 'X-rays',
      confidence: 0.98,
      bindings: [
        {
          type: 'overlay_mark',
          pageIndex: 0,
          x: 120,
          y: 420,
          mark: 'x',
          size: 12,
        },
      ],
    },
    {
      id: 'radiology',
      label: 'Radiology',
      confidence: 0.97,
      bindings: [
        {
          type: 'overlay_mark',
          pageIndex: 0,
          x: 120,
          y: 400,
          mark: 'x',
          size: 12,
        },
      ],
    },
  ],
};

const shortTextQuestion: RecordsWorkflowAutofillQuestion = {
  id: 'delivery-notes',
  label: 'Special delivery instructions',
  kind: 'short_text',
  required: false,
  helpText: null,
  confidence: 0.89,
  bindings: [
    {
      type: 'overlay_text',
      pageIndex: 0,
      x: 200,
      y: 300,
      maxWidth: 180,
      fontSize: 11,
    },
  ],
  options: [],
};

describe('records workflow autofill helpers', () => {
  it('adds a dynamic form step only when the selected PDF exposes questions', () => {
    expect(buildRecordsRequestSteps(false).map((step) => step.key)).toEqual([
      'bio',
      'hospital',
      'id',
      'submit',
    ]);

    expect(buildRecordsRequestSteps(true).map((step) => step.key)).toEqual([
      'bio',
      'hospital',
      'form',
      'id',
      'submit',
    ]);
  });

  it('tracks whether single answers are actually present', () => {
    expect(isAutofillQuestionAnswered(multiSelectQuestion, {})).toBe(false);
    expect(
      isAutofillQuestionAnswered(multiSelectQuestion, {
        'record-types': ['xrays'],
      }),
    ).toBe(true);

    expect(
      isAutofillQuestionAnswered(shortTextQuestion, {
        'delivery-notes': '  ',
      }),
    ).toBe(false);
    expect(
      isAutofillQuestionAnswered(shortTextQuestion, {
        'delivery-notes': 'Send via patient portal copy as well.',
      }),
    ).toBe(true);
  });

  it('blocks continuation when a required dynamic question is unanswered', () => {
    const validationMessage = validateAutofillAnswers(
      [multiSelectQuestion, shortTextQuestion],
      {
        'delivery-notes': 'Call before mailing.',
      },
    );

    expect(validationMessage).toBe(
      'Please answer "What kind of records do you want?" before continuing.',
    );
    expect(
      validateAutofillAnswers([multiSelectQuestion, shortTextQuestion], {
        'record-types': ['xrays', 'radiology'],
        'delivery-notes': 'Call before mailing.',
      }),
    ).toBeNull();
  });
});
