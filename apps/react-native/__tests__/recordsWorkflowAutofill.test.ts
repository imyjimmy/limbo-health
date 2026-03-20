import { describe, expect, it } from 'vitest';
import {
  buildRecordsRequestWorkflowSteps,
  buildAutofillVisibilityDependencies,
  formatDateAutofillAnswerInput,
  getRecordsRequestQuestionStepId,
  getVisibleAutofillQuestions,
  isDateAutofillQuestion,
  isAutofillQuestionVisible,
  isValidDateAutofillAnswer,
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

const dependentOtherQuestion: RecordsWorkflowAutofillQuestion = {
  id: 'delivery-other-details',
  label: 'If (other), describe how the records should be delivered',
  kind: 'short_text',
  required: false,
  helpText: null,
  confidence: 0.91,
  bindings: [
    {
      type: 'field_text',
      fieldName: 'Delivery other fill',
    },
  ],
  options: [],
};

const deliveryMethodQuestion: RecordsWorkflowAutofillQuestion = {
  id: 'delivery-method',
  label: 'How should we deliver the records?',
  kind: 'single_select',
  required: true,
  helpText: null,
  confidence: 0.95,
  bindings: [],
  options: [
    {
      id: 'mail',
      label: 'Mail',
      confidence: 0.99,
      bindings: [
        {
          type: 'field_checkbox',
          fieldName: 'Mail',
          checked: true,
        },
      ],
    },
    {
      id: 'other',
      label: 'Other',
      confidence: 0.99,
      bindings: [
        {
          type: 'field_checkbox',
          fieldName: 'Delivery other',
          checked: true,
        },
      ],
    },
  ],
};

const specifyProviderQuestion: RecordsWorkflowAutofillQuestion = {
  id: 'provider-or-location',
  label: 'Provider or location',
  kind: 'short_text',
  required: false,
  helpText: null,
  confidence: 0.91,
  bindings: [
    {
      type: 'field_text',
      fieldName: 'Specify provider fill',
    },
  ],
  options: [],
};

const facilityQuestion: RecordsWorkflowAutofillQuestion = {
  id: 'facility-selector',
  label: 'Information to be released from these BSWH facilities',
  kind: 'multi_select',
  required: true,
  helpText: null,
  confidence: 0.97,
  bindings: [],
  options: [
    {
      id: 'clinic-visits',
      label: 'Clinic visits',
      confidence: 0.99,
      bindings: [
        {
          type: 'field_checkbox',
          fieldName: 'Clinic visits',
          checked: true,
        },
      ],
    },
    {
      id: 'specify-provider',
      label: 'Specify provider or location',
      confidence: 0.99,
      bindings: [
        {
          type: 'field_checkbox',
          fieldName: 'specify provider',
          checked: true,
        },
      ],
    },
  ],
};

const explicitDateQuestion: RecordsWorkflowAutofillQuestion = {
  id: 'service-date',
  label: 'Date of service',
  kind: 'short_text',
  required: true,
  helpText: 'Enter as MM/DD/YYYY.',
  confidence: 0.93,
  bindings: [
    {
      type: 'field_text',
      fieldName: 'service_date',
    },
  ],
  options: [],
};

const ambiguousDateOrEventQuestion: RecordsWorkflowAutofillQuestion = {
  id: 'expiration-date-or-event',
  label: 'Enter the expiration date or event for this authorization',
  kind: 'short_text',
  required: false,
  helpText: null,
  confidence: 0.88,
  bindings: [
    {
      type: 'field_text',
      fieldName: 'expiration_date_or_event',
    },
  ],
  options: [],
};

describe('records workflow autofill helpers', () => {
  it('creates one workflow step per fetched question between hospital and id', () => {
    expect(buildRecordsRequestWorkflowSteps([]).map((step) => step.id)).toEqual([
      'bio',
      'hospital',
      'id',
      'submit',
    ]);

    expect(
      buildRecordsRequestWorkflowSteps([], {
        includeSignatureStep: true,
      }).map((step) => step.id),
    ).toEqual(['bio', 'hospital', 'id', 'signature', 'submit']);

    expect(
      buildRecordsRequestWorkflowSteps([multiSelectQuestion, shortTextQuestion]).map(
        (step) => step.id,
      ),
    ).toEqual([
      'bio',
      'hospital',
      getRecordsRequestQuestionStepId('record-types'),
      getRecordsRequestQuestionStepId('delivery-notes'),
      'id',
      'submit',
    ]);
  });

  it('hides dependent follow-up questions until their triggering option is selected', () => {
    const questions = [
      deliveryMethodQuestion,
      dependentOtherQuestion,
      facilityQuestion,
      specifyProviderQuestion,
    ];
    const dependencies = buildAutofillVisibilityDependencies(questions);

    expect(dependencies.get('delivery-other-details')).toEqual({
      parentQuestionId: 'delivery-method',
      parentOptionIds: ['other'],
    });
    expect(dependencies.get('provider-or-location')).toEqual({
      parentQuestionId: 'facility-selector',
      parentOptionIds: ['specify-provider'],
    });

    expect(
      isAutofillQuestionVisible(dependentOtherQuestion, { 'delivery-method': 'mail' }, dependencies),
    ).toBe(false);
    expect(
      isAutofillQuestionVisible(
        dependentOtherQuestion,
        { 'delivery-method': 'other' },
        dependencies,
      ),
    ).toBe(true);

    expect(
      getVisibleAutofillQuestions(questions, {
        'delivery-method': 'mail',
        'facility-selector': ['clinic-visits'],
      }).map((question) => question.id),
    ).toEqual(['delivery-method', 'facility-selector']);

    expect(
      getVisibleAutofillQuestions(questions, {
        'delivery-method': 'other',
        'facility-selector': ['clinic-visits', 'specify-provider'],
      }).map((question) => question.id),
    ).toEqual([
      'delivery-method',
      'delivery-other-details',
      'facility-selector',
      'provider-or-location',
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

  it('detects date-only questions conservatively and formats date input', () => {
    expect(isDateAutofillQuestion(explicitDateQuestion)).toBe(true);
    expect(isDateAutofillQuestion(shortTextQuestion)).toBe(false);
    expect(isDateAutofillQuestion(ambiguousDateOrEventQuestion)).toBe(true);

    expect(formatDateAutofillAnswerInput('01022026')).toBe('01/02/2026');
    expect(formatDateAutofillAnswerInput('01-02-2026')).toBe('01/02/2026');
    expect(formatDateAutofillAnswerInput('0102')).toBe('01/02');
    expect(isValidDateAutofillAnswer('01/02/2026')).toBe(true);
    expect(isValidDateAutofillAnswer('13/02/2026')).toBe(false);
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

    expect(
      validateAutofillAnswers([explicitDateQuestion], {
        'service-date': '01/02',
      }),
    ).toBe(
      'Please enter "Date of service" as a valid date in MM/DD/YYYY format.',
    );
  });
});
