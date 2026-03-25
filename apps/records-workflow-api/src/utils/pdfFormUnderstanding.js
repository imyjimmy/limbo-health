export const PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME = 'pdf_form_understanding_openai';
export const PDF_FORM_UNDERSTANDING_EXTRACTOR_VERSION = 'v1';
export const MIN_AUTOFILL_CONFIDENCE = 0.85;

const QUESTION_KINDS = new Set(['single_select', 'multi_select', 'short_text']);
const FIELD_BINDING_TYPES = new Set(['field_text', 'field_checkbox', 'field_radio']);
const OVERLAY_BINDING_TYPES = new Set(['overlay_text', 'overlay_mark']);
const SUPPORTED_MARKS = new Set(['x', 'check']);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clampConfidence(value) {
  if (!Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value);
}

function slugify(value) {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'question';
}

function buildUniqueSlug(candidates = [], seenIds = new Set(), fallbackBase = 'option') {
  for (const candidate of candidates) {
    const nextId = slugify(candidate);
    if (nextId && !seenIds.has(nextId)) {
      return nextId;
    }
  }

  const baseId = slugify(candidates.find((candidate) => normalizeString(candidate)) || fallbackBase);
  let nextId = baseId;
  let suffix = 2;
  while (seenIds.has(nextId)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return nextId;
}

function normalizeMode(value) {
  if (value === 'acroform' || value === 'overlay') return value;
  return null;
}

function inferBindingFamily(type) {
  if (FIELD_BINDING_TYPES.has(type)) return 'acroform';
  if (OVERLAY_BINDING_TYPES.has(type)) return 'overlay';
  return null;
}

function normalizeBinding(rawBinding) {
  if (!isPlainObject(rawBinding)) return null;

  const type = normalizeString(rawBinding.type);
  const family = inferBindingFamily(type);
  if (!family) return null;

  if (type === 'field_text') {
    const fieldName = normalizeString(rawBinding.field_name);
    if (!fieldName) return null;
    return {
      family,
      binding: {
        type,
        field_name: fieldName,
      },
    };
  }

  if (type === 'field_checkbox') {
    const fieldName = normalizeString(rawBinding.field_name);
    if (!fieldName) return null;
    return {
      family,
      binding: {
        type,
        field_name: fieldName,
        checked: rawBinding.checked !== false,
      },
    };
  }

  if (type === 'field_radio') {
    const fieldName = normalizeString(rawBinding.field_name);
    const value = normalizeString(rawBinding.value);
    if (!fieldName || !value) return null;
    return {
      family,
      binding: {
        type,
        field_name: fieldName,
        value,
      },
    };
  }

  if (type === 'overlay_text') {
    const pageIndex = Number(rawBinding.page_index);
    const x = Number(rawBinding.x);
    const y = Number(rawBinding.y);
    if (
      !Number.isInteger(pageIndex) ||
      pageIndex < 0 ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return null;
    }

    const maxWidth = rawBinding.max_width == null ? null : Number(rawBinding.max_width);
    const fontSize = rawBinding.font_size == null ? null : Number(rawBinding.font_size);
    if (maxWidth != null && !Number.isFinite(maxWidth)) return null;
    if (fontSize != null && !Number.isFinite(fontSize)) return null;

    return {
      family,
      binding: {
        type,
        page_index: pageIndex,
        x,
        y,
        max_width: maxWidth,
        font_size: fontSize,
      },
    };
  }

  if (type === 'overlay_mark') {
    const pageIndex = Number(rawBinding.page_index);
    const x = Number(rawBinding.x);
    const y = Number(rawBinding.y);
    const mark = normalizeString(rawBinding.mark);
    if (
      !Number.isInteger(pageIndex) ||
      pageIndex < 0 ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !SUPPORTED_MARKS.has(mark)
    ) {
      return null;
    }

    const size = rawBinding.size == null ? null : Number(rawBinding.size);
    if (size != null && !Number.isFinite(size)) return null;

    return {
      family,
      binding: {
        type,
        page_index: pageIndex,
        x,
        y,
        mark,
        size,
      },
    };
  }

  return null;
}

function normalizeOption(rawOption, questionId, minimumConfidence) {
  if (!isPlainObject(rawOption)) return null;

  const label = normalizeString(rawOption.label);
  if (!label) return null;

  const confidence =
    clampConfidence(rawOption.confidence) ?? clampConfidence(rawOption.binding_confidence) ?? 1;
  if (confidence == null || confidence < minimumConfidence) {
    return null;
  }

  const bindings = [];
  const families = new Set();

  for (const rawBinding of Array.isArray(rawOption.bindings) ? rawOption.bindings : []) {
    const normalized = normalizeBinding(rawBinding);
    if (!normalized) continue;
    bindings.push(normalized.binding);
    families.add(normalized.family);
  }

  if (bindings.length === 0) return null;

  const bindingFieldNames = bindings
    .filter((binding) => binding?.type === 'field_text' || binding?.type === 'field_checkbox')
    .map((binding) => normalizeString(binding.field_name))
    .filter(Boolean);

  return {
    option: {
      id: slugify(normalizeString(rawOption.id) || `${questionId}-${label}`),
      label,
      confidence,
      bindings,
    },
    bindingFieldNames,
    families,
  };
}

function normalizeQuestion(rawQuestion, minimumConfidence) {
  if (!isPlainObject(rawQuestion)) return null;

  const kind = normalizeString(rawQuestion.kind);
  if (!QUESTION_KINDS.has(kind)) return null;

  const label = normalizeString(rawQuestion.label);
  if (!label) return null;

  const confidence = clampConfidence(rawQuestion.confidence) ?? 1;
  if (confidence == null || confidence < minimumConfidence) return null;

  const id = slugify(normalizeString(rawQuestion.id) || label);
  const normalizedQuestion = {
    id,
    label,
    kind,
    required: Boolean(rawQuestion.required),
    help_text: normalizeString(rawQuestion.help_text) || null,
    confidence,
    bindings: [],
    options: [],
  };
  const families = new Set();

  if (kind === 'short_text') {
    for (const rawBinding of Array.isArray(rawQuestion.bindings) ? rawQuestion.bindings : []) {
      const normalized = normalizeBinding(rawBinding);
      if (!normalized) continue;
      normalizedQuestion.bindings.push(normalized.binding);
      families.add(normalized.family);
    }

    if (normalizedQuestion.bindings.length === 0) return null;
    return { question: normalizedQuestion, families };
  }

  const seenOptionIds = new Set();
  for (const rawOption of Array.isArray(rawQuestion.options) ? rawQuestion.options : []) {
    const normalized = normalizeOption(rawOption, id, minimumConfidence);
    if (!normalized) continue;
    const uniqueOptionId = buildUniqueSlug(
      [
        normalized.option.id,
        ...normalized.bindingFieldNames,
        `${id}-${normalized.option.label}`,
      ],
      seenOptionIds,
      `${id}-option`,
    );
    seenOptionIds.add(uniqueOptionId);
    normalizedQuestion.options.push({
      ...normalized.option,
      id: uniqueOptionId,
    });
    for (const family of normalized.families) {
      families.add(family);
    }
  }

  if (normalizedQuestion.options.length === 0) return null;
  return { question: normalizedQuestion, families };
}

export function buildUnsupportedAutofillPayload(overrides = {}) {
  return {
    supported: false,
    mode: null,
    template_id: null,
    confidence: null,
    questions: [],
    ...overrides,
  };
}

export function normalizePdfFormUnderstanding(rawValue, minimumConfidence = MIN_AUTOFILL_CONFIDENCE) {
  if (!isPlainObject(rawValue)) {
    return buildUnsupportedAutofillPayload();
  }

  const normalizedQuestions = [];
  const families = new Set();

  for (const rawQuestion of Array.isArray(rawValue.questions) ? rawValue.questions : []) {
    const normalized = normalizeQuestion(rawQuestion, minimumConfidence);
    if (!normalized) continue;
    normalizedQuestions.push(normalized.question);
    for (const family of normalized.families) {
      families.add(family);
    }
  }

  const explicitMode = normalizeMode(rawValue.mode);
  const inferredMode = families.size === 1 ? Array.from(families)[0] : null;
  const mode = explicitMode || inferredMode;
  if (!mode) {
    return buildUnsupportedAutofillPayload();
  }

  const expectedFamily = mode;
  const questions = normalizedQuestions.filter((question) => {
    const bindings =
      question.kind === 'short_text'
        ? question.bindings
        : question.options.flatMap((option) => option.bindings);

    return bindings.every((binding) => inferBindingFamily(binding.type) === expectedFamily);
  });

  const confidence =
    clampConfidence(rawValue.confidence) ??
    Math.max(...questions.map((question) => question.confidence), 0);

  if (!questions.length || confidence < minimumConfidence) {
    return buildUnsupportedAutofillPayload({
      mode,
      confidence,
    });
  }

  return {
    supported: true,
    mode,
    template_id: normalizeString(rawValue.template_id) || null,
    confidence,
    questions,
  };
}
