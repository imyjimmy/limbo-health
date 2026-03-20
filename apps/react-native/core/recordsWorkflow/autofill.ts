import type { RecordsWorkflowAutofillQuestion } from '../../types/recordsRequest';

export type RecordsRequestStepKey = 'bio' | 'hospital' | 'form' | 'id' | 'submit';
export type RecordsWorkflowAutofillAnswers = Record<string, string | string[]>;

export function buildRecordsRequestSteps(hasDynamicQuestions: boolean) {
  return hasDynamicQuestions
    ? [
        { key: 'bio' as const, label: 'Bio' },
        { key: 'hospital' as const, label: 'Hospital' },
        { key: 'form' as const, label: 'Form' },
        { key: 'id' as const, label: 'ID' },
        { key: 'submit' as const, label: 'Submit' },
      ]
    : [
        { key: 'bio' as const, label: 'Bio' },
        { key: 'hospital' as const, label: 'Hospital' },
        { key: 'id' as const, label: 'ID' },
        { key: 'submit' as const, label: 'Submit' },
      ];
}

export function isAutofillQuestionAnswered(
  question: RecordsWorkflowAutofillQuestion,
  answers: RecordsWorkflowAutofillAnswers,
) {
  const value = answers[question.id];

  if (question.kind === 'short_text') {
    return typeof value === 'string' && value.trim().length > 0;
  }

  if (question.kind === 'single_select') {
    return typeof value === 'string' && value.trim().length > 0;
  }

  return Array.isArray(value) && value.length > 0;
}

export function validateAutofillAnswers(
  questions: RecordsWorkflowAutofillQuestion[],
  answers: RecordsWorkflowAutofillAnswers,
) {
  const missingRequired = questions.find(
    (question) => question.required && !isAutofillQuestionAnswered(question, answers),
  );

  if (!missingRequired) return null;
  return `Please answer "${missingRequired.label}" before continuing.`;
}
