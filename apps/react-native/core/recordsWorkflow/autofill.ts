import type {
  RecordsWorkflowAutofillOption,
  RecordsWorkflowAutofillQuestion,
} from '../../types/recordsRequest';

export type RecordsWorkflowAutofillAnswers = Record<string, string | string[]>;
export interface RecordsWorkflowVisibilityDependency {
  parentQuestionId: string;
  parentOptionIds: string[];
}
export type RecordsRequestWorkflowStep =
  | {
      id: 'bio';
      kind: 'bio';
      label: 'Bio';
    }
  | {
      id: 'hospital';
      kind: 'hospital';
      label: 'Hospital';
    }
  | {
      id: `question:${string}`;
      kind: 'question';
      label: string;
      question: RecordsWorkflowAutofillQuestion;
      questionIndex: number;
    }
  | {
      id: 'id';
      kind: 'id';
      label: 'ID';
    }
  | {
      id: 'signature';
      kind: 'signature';
      label: 'Signature';
    }
  | {
      id: 'submit';
      kind: 'submit';
      label: 'Submit';
    };

export function getRecordsRequestQuestionStepId(questionId: string) {
  return `question:${questionId}` as const;
}

export function buildRecordsRequestWorkflowSteps(
  questions: RecordsWorkflowAutofillQuestion[],
  options?: {
    includeSignatureStep?: boolean;
  },
): RecordsRequestWorkflowStep[] {
  return [
    { id: 'bio', kind: 'bio', label: 'Bio' },
    { id: 'hospital', kind: 'hospital', label: 'Hospital' },
    ...questions.map((question, questionIndex) => ({
      id: getRecordsRequestQuestionStepId(question.id),
      kind: 'question' as const,
      label: question.label,
      question,
      questionIndex,
    })),
    { id: 'id', kind: 'id', label: 'ID' },
    ...(options?.includeSignatureStep
      ? [{ id: 'signature', kind: 'signature', label: 'Signature' } as const]
      : []),
    { id: 'submit', kind: 'submit', label: 'Submit' },
  ];
}

const DATE_FORMAT_HINT_PATTERN =
  /\b(mm\s*\/\s*dd\s*\/\s*yyyy|mm-dd-yyyy|month\s*\/\s*day\s*\/\s*year|month day year)\b/i;
const DATE_QUESTION_HINT_PATTERN =
  /\b(date of birth|birth date|dob|service date|date of service|appointment date|visit date|admission date|discharge date|effective date|expiration date|expiry date|release date|event date)\b/i;
const DATE_FIELD_NAME_HINT_PATTERN =
  /\b(date|dob|birth|service|visit|appointment|admission|admit|discharge|release|effective|expiration|expiry)\b/i;
const DATE_EXCLUSION_PATTERN = /\bor event\b|\bor occurrence\b|\bor condition\b/i;
const OTHER_DEPENDENCY_PATTERN = /\bif\s*\(?other\)?\b|\bother\b|\bother\s*\(please specify\)|\bplease specify\b/i;
const FOLLOW_UP_HINT_PATTERN = /\bif\b|\bother\b|\bspecify\b|\bdescribe\b|\bdetail\b|\bfill\b/i;
const STOP_WORDS = new Set([
  'a',
  'all',
  'an',
  'answer',
  'and',
  'applicable',
  'apply',
  'be',
  'for',
  'if',
  'in',
  'of',
  'or',
  'please',
  'question',
  'rest',
  'the',
  'this',
  'to',
  'your',
]);
const TRAILING_DEPENDENCY_HINT_PATTERN =
  /\b(fill|field|text|value|answer|entry|details?|description)\b/g;

function getQuestionBindingFieldNames(question: RecordsWorkflowAutofillQuestion) {
  return question.bindings
    .filter((binding) => 'fieldName' in binding)
    .map((binding) => binding.fieldName)
    .filter(Boolean)
    .join(' ');
}

function getOptionBindingFieldNames(option: RecordsWorkflowAutofillOption) {
  return option.bindings
    .filter((binding) => 'fieldName' in binding)
    .map((binding) => binding.fieldName)
    .filter(Boolean)
    .join(' ');
}

function normalizeDependencyText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function trimDependencyHintTokens(value: string) {
  return normalizeDependencyText(value).replace(TRAILING_DEPENDENCY_HINT_PATTERN, ' ').trim();
}

function tokenizeDependencyText(value: string) {
  return trimDependencyHintTokens(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function buildQuestionDependencySignal(question: RecordsWorkflowAutofillQuestion) {
  return [question.label, question.helpText, getQuestionBindingFieldNames(question)]
    .filter(Boolean)
    .join(' ');
}

function buildOptionDependencySignal(option: RecordsWorkflowAutofillOption) {
  return [option.label, option.id, getOptionBindingFieldNames(option)]
    .filter(Boolean)
    .join(' ');
}

function scoreOptionVisibilityDependency(
  question: RecordsWorkflowAutofillQuestion,
  option: RecordsWorkflowAutofillOption,
) {
  const questionSignal = normalizeDependencyText(buildQuestionDependencySignal(question));
  const questionSignalTrimmed = trimDependencyHintTokens(buildQuestionDependencySignal(question));
  const optionSignal = normalizeDependencyText(buildOptionDependencySignal(option));
  const optionSignalTrimmed = trimDependencyHintTokens(buildOptionDependencySignal(option));
  const questionTokens = new Set(tokenizeDependencyText(buildQuestionDependencySignal(question)));
  const optionTokens = new Set(tokenizeDependencyText(buildOptionDependencySignal(option)));

  let score = 0;

  if (OTHER_DEPENDENCY_PATTERN.test(questionSignal) && /\bother\b/.test(optionSignal)) {
    score += 6;
  }

  if (
    questionSignalTrimmed &&
    optionSignalTrimmed &&
    (questionSignalTrimmed.includes(optionSignalTrimmed) ||
      optionSignalTrimmed.includes(questionSignalTrimmed))
  ) {
    score += 5;
  }

  for (const token of questionTokens) {
    if (optionTokens.has(token)) {
      score += token === 'other' ? 3 : 2;
    }
  }

  return score;
}

function inferQuestionVisibilityDependency(
  questions: RecordsWorkflowAutofillQuestion[],
  questionIndex: number,
): RecordsWorkflowVisibilityDependency | null {
  const question = questions[questionIndex];
  if (!question) return null;

  const questionSignal = buildQuestionDependencySignal(question);
  if (!FOLLOW_UP_HINT_PATTERN.test(questionSignal)) {
    return null;
  }

  let bestMatch:
    | (RecordsWorkflowVisibilityDependency & {
        score: number;
        parentIndex: number;
      })
    | null = null;

  for (let parentIndex = questionIndex - 1; parentIndex >= 0; parentIndex -= 1) {
    const parentQuestion = questions[parentIndex];
    if (!parentQuestion || parentQuestion.kind === 'short_text') continue;

    const scoredOptions = parentQuestion.options
      .map((option) => ({
        optionId: option.id,
        score: scoreOptionVisibilityDependency(question, option),
      }))
      .filter((entry) => entry.score > 0);

    if (scoredOptions.length === 0) continue;

    const topScore = Math.max(...scoredOptions.map((entry) => entry.score));
    if (topScore < 4) continue;

    const dependency = {
      parentQuestionId: parentQuestion.id,
      parentOptionIds: scoredOptions
        .filter((entry) => entry.score === topScore)
        .map((entry) => entry.optionId),
      score: topScore,
      parentIndex,
    };

    if (
      !bestMatch ||
      dependency.parentIndex > bestMatch.parentIndex ||
      (dependency.parentIndex === bestMatch.parentIndex && dependency.score > bestMatch.score)
    ) {
      bestMatch = dependency;
    }
  }

  if (!bestMatch) return null;

  return {
    parentQuestionId: bestMatch.parentQuestionId,
    parentOptionIds: bestMatch.parentOptionIds,
  };
}

export function buildAutofillVisibilityDependencies(
  questions: RecordsWorkflowAutofillQuestion[],
) {
  const dependencies = new Map<string, RecordsWorkflowVisibilityDependency>();

  for (let questionIndex = 0; questionIndex < questions.length; questionIndex += 1) {
    const dependency = inferQuestionVisibilityDependency(questions, questionIndex);
    if (!dependency) continue;
    dependencies.set(questions[questionIndex].id, dependency);
  }

  return dependencies;
}

export function isAutofillQuestionVisible(
  question: RecordsWorkflowAutofillQuestion,
  answers: RecordsWorkflowAutofillAnswers,
  dependencies: Map<string, RecordsWorkflowVisibilityDependency>,
) {
  const dependency = dependencies.get(question.id);
  if (!dependency) return true;

  const parentAnswer = answers[dependency.parentQuestionId];
  if (typeof parentAnswer === 'string') {
    return dependency.parentOptionIds.includes(parentAnswer);
  }

  if (Array.isArray(parentAnswer)) {
    return dependency.parentOptionIds.some((optionId) => parentAnswer.includes(optionId));
  }

  return false;
}

export function getVisibleAutofillQuestions(
  questions: RecordsWorkflowAutofillQuestion[],
  answers: RecordsWorkflowAutofillAnswers,
) {
  const dependencies = buildAutofillVisibilityDependencies(questions);
  return questions.filter((question) => isAutofillQuestionVisible(question, answers, dependencies));
}

export function isDateAutofillQuestion(question: RecordsWorkflowAutofillQuestion) {
  if (question.kind !== 'short_text') return false;

  const combinedText = [question.label, question.helpText, getQuestionBindingFieldNames(question)]
    .filter(Boolean)
    .join(' ');

  if (DATE_FORMAT_HINT_PATTERN.test(combinedText) || DATE_QUESTION_HINT_PATTERN.test(combinedText)) {
    return true;
  }

  if (DATE_EXCLUSION_PATTERN.test(combinedText)) {
    return false;
  }

  return DATE_FIELD_NAME_HINT_PATTERN.test(getQuestionBindingFieldNames(question));
}

export function formatDateAutofillAnswerInput(value: string) {
  const digitsOnly = value.replace(/\D+/g, '').slice(0, 8);

  if (digitsOnly.length <= 2) return digitsOnly;
  if (digitsOnly.length <= 4) {
    return `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2)}`;
  }

  return `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2, 4)}/${digitsOnly.slice(4)}`;
}

export function isValidDateAutofillAnswer(value: string) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false;

  const [monthRaw, dayRaw, yearRaw] = value.split('/');
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const year = Number(yearRaw);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > 2100) return false;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
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
  const invalidDateQuestion = questions.find((question) => {
    if (!isDateAutofillQuestion(question)) return false;
    const value = answers[question.id];
    if (typeof value !== 'string' || !value.trim()) return false;
    return !isValidDateAutofillAnswer(value.trim());
  });

  if (invalidDateQuestion) {
    return `Please enter "${invalidDateQuestion.label}" as a valid date in MM/DD/YYYY format.`;
  }

  const missingRequired = questions.find(
    (question) => question.required && !isAutofillQuestionAnswered(question, answers),
  );

  if (!missingRequired) return null;
  return `Please answer "${missingRequired.label}" before continuing.`;
}
