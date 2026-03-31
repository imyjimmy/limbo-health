import type {
  RecordsWorkflowAutofillQuestion,
} from '../../types/recordsRequest';

export type RecordsWorkflowAutofillAnswers = Record<string, string | string[]>;
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
const DATE_QUESTION_HINT_PATTERN = /\bdate\b|\bdob\b|\bbirth\b/i;
const DATE_FIELD_NAME_HINT_PATTERN =
  /\b(date|dob|birth|service|visit|appointment|admission|admit|discharge|release|effective|expiration|expiry)\b/i;
const DATE_EXCLUSION_PATTERN = /\bor event\b|\bor occurrence\b|\bor condition\b/i;

function getQuestionBindingFieldNames(question: RecordsWorkflowAutofillQuestion) {
  return question.bindings
    .filter((binding) => 'fieldName' in binding)
    .map((binding) => binding.fieldName)
    .filter(Boolean)
    .join(' ');
}

function getOptionBindingFieldNames(
  option: RecordsWorkflowAutofillQuestion['options'][number],
) {
  return option.bindings
    .filter((binding) => 'fieldName' in binding)
    .map((binding) => binding.fieldName)
    .filter(Boolean)
    .join(' ');
}

const QUESTION_FLOW_FOLLOW_UP_HINT_PATTERN =
  /\bif\b|\bother\b|\bspecify\b|\bdescribe\b|\bdetail\b|\bfill\b/i;
const QUESTION_FLOW_OTHER_PATTERN =
  /\bif\s*\(?other\)?\b|\bother\b|\bother\s*\(please specify\)|\bplease specify\b/i;
const QUESTION_FLOW_TRAILING_HINT_PATTERN =
  /\b(fill|field|text|value|answer|entry|details?|description)\b/g;
const QUESTION_FLOW_STOP_WORDS = new Set([
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
  'selected',
  'the',
  'this',
  'to',
  'your',
]);

function normalizeQuestionFlowText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function trimQuestionFlowHintTokens(value: string) {
  return normalizeQuestionFlowText(value).replace(QUESTION_FLOW_TRAILING_HINT_PATTERN, ' ').trim();
}

function tokenizeQuestionFlowText(value: string) {
  return trimQuestionFlowHintTokens(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !QUESTION_FLOW_STOP_WORDS.has(token));
}

function buildQuestionFlowSignal(question: RecordsWorkflowAutofillQuestion) {
  return [question.label, question.helpText, getQuestionBindingFieldNames(question)]
    .filter(Boolean)
    .join(' ');
}

function buildOptionFlowSignal(option: RecordsWorkflowAutofillQuestion['options'][number]) {
  return [option.label, option.id, getOptionBindingFieldNames(option)].filter(Boolean).join(' ');
}

function scoreQuestionVisibilityOptionMatch(
  question: RecordsWorkflowAutofillQuestion,
  option: RecordsWorkflowAutofillQuestion['options'][number],
) {
  const questionSignal = normalizeQuestionFlowText(buildQuestionFlowSignal(question));
  const questionSignalTrimmed = trimQuestionFlowHintTokens(buildQuestionFlowSignal(question));
  const optionSignal = normalizeQuestionFlowText(buildOptionFlowSignal(option));
  const optionSignalTrimmed = trimQuestionFlowHintTokens(buildOptionFlowSignal(option));
  const questionTokens = new Set(tokenizeQuestionFlowText(buildQuestionFlowSignal(question)));
  const optionTokens = new Set(tokenizeQuestionFlowText(buildOptionFlowSignal(option)));

  let score = 0;

  if (QUESTION_FLOW_OTHER_PATTERN.test(questionSignal) && /\bother\b/.test(optionSignal)) {
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

function inferAutofillQuestionVisibilityRule(
  question: RecordsWorkflowAutofillQuestion,
  questions: RecordsWorkflowAutofillQuestion[],
) {
  if (question.kind !== 'short_text') return null;

  const questionSignal = buildQuestionFlowSignal(question);
  if (!QUESTION_FLOW_FOLLOW_UP_HINT_PATTERN.test(questionSignal)) {
    return null;
  }

  const questionIndex = questions.findIndex((candidate) => candidate.id === question.id);
  if (questionIndex === -1) return null;

  let bestMatch:
    | {
        parentQuestionId: string;
        parentOptionIds: string[];
        score: number;
        parentIndex: number;
      }
    | null = null;

  for (let parentIndex = questionIndex - 1; parentIndex >= 0; parentIndex -= 1) {
    const parentQuestion = questions[parentIndex];
    if (!parentQuestion || parentQuestion.kind === 'short_text') continue;

    const scoredOptions = parentQuestion.options
      .map((option) => ({
        optionId: option.id,
        score: scoreQuestionVisibilityOptionMatch(question, option),
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

function getAutofillQuestionVisibilityRule(
  question: RecordsWorkflowAutofillQuestion,
  questions: RecordsWorkflowAutofillQuestion[],
) {
  return question.visibilityRule || inferAutofillQuestionVisibilityRule(question, questions);
}

export function isAutofillQuestionVisible(
  question: RecordsWorkflowAutofillQuestion,
  answers: RecordsWorkflowAutofillAnswers,
  questions: RecordsWorkflowAutofillQuestion[] = [],
) {
  const dependency = getAutofillQuestionVisibilityRule(question, questions);
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
  return questions.filter((question) => isAutofillQuestionVisible(question, answers, questions));
}

function findQuestionById(
  questions: RecordsWorkflowAutofillQuestion[],
  questionId: string,
) {
  return questions.find((question) => question.id === questionId) || null;
}

function getAdjacentQuestionIdByOrder(
  questions: RecordsWorkflowAutofillQuestion[],
  currentQuestionId: string,
  direction: 'next' | 'previous',
) {
  const currentQuestionIndex = questions.findIndex((question) => question.id === currentQuestionId);
  if (currentQuestionIndex === -1) return null;

  const adjacentQuestion =
    direction === 'next'
      ? questions[currentQuestionIndex + 1]
      : questions[currentQuestionIndex - 1];

  return adjacentQuestion?.id || null;
}

export function getNextAutofillQuestionId(
  questions: RecordsWorkflowAutofillQuestion[],
  currentQuestionId: string,
  answers: RecordsWorkflowAutofillAnswers,
) {
  const visitedQuestionIds = new Set<string>();
  let nextQuestionId =
    findQuestionById(questions, currentQuestionId)?.nextQuestionId ||
    getAdjacentQuestionIdByOrder(questions, currentQuestionId, 'next');

  while (nextQuestionId && !visitedQuestionIds.has(nextQuestionId)) {
    visitedQuestionIds.add(nextQuestionId);
    const nextQuestion = findQuestionById(questions, nextQuestionId);
    if (!nextQuestion) return null;
    if (isAutofillQuestionVisible(nextQuestion, answers, questions)) {
      return nextQuestion.id;
    }

    nextQuestionId =
      nextQuestion.nextQuestionId || getAdjacentQuestionIdByOrder(questions, nextQuestion.id, 'next');
  }

  return null;
}

export function getPreviousAutofillQuestionId(
  questions: RecordsWorkflowAutofillQuestion[],
  currentQuestionId: string,
  answers: RecordsWorkflowAutofillAnswers,
) {
  const visitedQuestionIds = new Set<string>();
  let previousQuestionId =
    findQuestionById(questions, currentQuestionId)?.previousQuestionId ||
    getAdjacentQuestionIdByOrder(questions, currentQuestionId, 'previous');

  while (previousQuestionId && !visitedQuestionIds.has(previousQuestionId)) {
    visitedQuestionIds.add(previousQuestionId);
    const previousQuestion = findQuestionById(questions, previousQuestionId);
    if (!previousQuestion) return null;
    if (isAutofillQuestionVisible(previousQuestion, answers, questions)) {
      return previousQuestion.id;
    }

    previousQuestionId =
      previousQuestion.previousQuestionId ||
      getAdjacentQuestionIdByOrder(questions, previousQuestion.id, 'previous');
  }

  return null;
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
