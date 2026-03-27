import fs from 'node:fs/promises';
import path from 'node:path';
import { parsePdfDocument } from '../parsers/pdfParser.js';
import { query, withTransaction } from '../db.js';
import {
  extractPdfFormUnderstanding,
  repairPdfFormUnderstandingOutput,
} from '../extractors/pdfFormUnderstandingExtractor.js';
import { insertExtractionRun } from '../repositories/workflowRepository.js';
import { resolveParsedArtifactPath } from '../utils/pipelineArtifactStorage.js';
import { resolveSourceDocumentPath } from '../utils/sourceDocumentStorage.js';
import {
  buildUnsupportedAutofillPayload,
  normalizePdfFormUnderstanding,
  normalizePdfSignatureAreas,
  PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME,
} from '../utils/pdfFormUnderstanding.js';
import { collapseWhitespace } from '../utils/text.js';

function normalizeString(value) {
  return collapseWhitespace(typeof value === 'string' ? value : '');
}

function slugify(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

function humanizeFieldName(value) {
  const trimmed = normalizeString(value);
  if (!trimmed) return '';

  const collapsed = trimmed.replace(/[_-]+/g, ' ');
  if (/^[A-Z0-9\s/&().:-]+$/.test(collapsed)) {
    return collapsed;
  }

  return collapsed.replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeCheckboxOptionLabel(label, fieldName) {
  let normalizedLabel = normalizeString(label).replace(/\s+/g, ' ').trim();
  if (/^\(.+\)$/.test(normalizedLabel)) {
    normalizedLabel = normalizedLabel.slice(1, -1).trim();
  }

  if (/^other:?$/i.test(normalizedLabel)) {
    return 'Other (please specify)';
  }

  return normalizedLabel || humanizeFieldName(fieldName);
}

function tokenizeCheckboxLabel(value) {
  return normalizeString(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function normalizeRenderableWord(value) {
  return normalizeString(value).replace(/[^\p{L}\p{N}&/().,:-]+/gu, ' ').trim();
}

function shouldPreferFallbackCheckboxLabel(label, fallbackLabel) {
  const normalizedLabel = normalizeString(label);
  const normalizedFallback = normalizeString(fallbackLabel);
  if (!normalizedFallback) return false;
  if (!normalizedLabel) return true;
  if (normalizedLabel.toLowerCase() === normalizedFallback.toLowerCase()) return false;

  const labelTokens = tokenizeCheckboxLabel(normalizedLabel);
  const fallbackTokens = tokenizeCheckboxLabel(normalizedFallback);
  if (labelTokens.length === 0) return true;
  if (fallbackTokens.length <= labelTokens.length) return false;

  const fallbackTokenSet = new Set(fallbackTokens);
  return labelTokens.every((token) => fallbackTokenSet.has(token));
}

function countNormalizedValues(values = []) {
  const counts = new Map();
  for (const value of values) {
    const normalizedValue = normalizeComparableLabel(value);
    if (!normalizedValue) continue;
    counts.set(normalizedValue, (counts.get(normalizedValue) || 0) + 1);
  }
  return counts;
}

function buildPdfGeometryPageMap(pdfGeometry) {
  return new Map(
    (pdfGeometry?.pages || []).map((page) => [Number(page.page_index), page]),
  );
}

function findClosestCheckboxWidget(binding, page) {
  if (!page || binding?.type !== 'overlay_mark') return null;

  const candidates = (page.widgets || [])
    .filter((widget) => /checkbox/i.test(normalizeString(widget.field_type)))
    .map((widget) => ({
      widget,
      distance: Math.hypot(
        Number(widget.x || 0) + Number(widget.width || 0) / 2 - Number(binding.x || 0),
        Number(widget.y || 0) + Number(widget.height || 0) / 2 - Number(binding.y || 0),
      ),
    }))
    .sort((left, right) => left.distance - right.distance);

  if (!candidates[0] || candidates[0].distance > 18) {
    return null;
  }

  return candidates[0].widget;
}

function buildCheckboxWidgetPrintedLabel(widget, page) {
  if (!widget || !page) return '';

  const rowWidgets = (page.widgets || [])
    .filter((candidate) => /checkbox/i.test(normalizeString(candidate.field_type)))
    .filter((candidate) => Math.abs(Number(candidate.y || 0) - Number(widget.y || 0)) <= 4)
    .sort((left, right) => Number(left.x || 0) - Number(right.x || 0));
  const widgetIndex = rowWidgets.findIndex(
    (candidate) => normalizeString(candidate.field_name) === normalizeString(widget.field_name),
  );
  const nextWidget = widgetIndex >= 0 ? rowWidgets[widgetIndex + 1] || null : null;
  const labelWords = (page.words || [])
    .filter((word) => Math.abs(Number(word.y || 0) - Number(widget.y || 0)) <= 5)
    .filter(
      (word) =>
        Number(word.x || 0) >=
        Number(widget.x || 0) + Math.max(Number(widget.width || 0) - 3, 4),
    )
    .filter((word) => !nextWidget || Number(word.x || 0) < Number(nextWidget.x || 0) - 4)
    .sort((left, right) => Number(left.x || 0) - Number(right.x || 0));

  return labelWords
    .map((word) => normalizeRenderableWord(word.text || ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function repairQuestionOptionMetadata(payload, pdfGeometry) {
  if (!Array.isArray(payload?.questions) || payload.questions.length === 0) {
    return payload;
  }

  const pagesByIndex = buildPdfGeometryPageMap(pdfGeometry);
  const repairedQuestions = payload.questions.map((question) => {
    if (!Array.isArray(question?.options) || question.options.length === 0) {
      return question;
    }

    const optionIdCounts = countNormalizedValues(question.options.map((option) => option?.id));
    const optionLabelCounts = countNormalizedValues(question.options.map((option) => option?.label));
    const seenOptionIds = new Set();

    const repairedOptions = question.options.map((option) => {
      const firstOverlayMark = (Array.isArray(option?.bindings) ? option.bindings : []).find(
        (binding) => binding?.type === 'overlay_mark' && Number.isInteger(binding?.page_index),
      );
      const page = firstOverlayMark
        ? pagesByIndex.get(Number(firstOverlayMark.page_index))
        : null;
      const matchedWidget = firstOverlayMark
        ? findClosestCheckboxWidget(firstOverlayMark, page)
        : null;
      const printedLabel = matchedWidget ? buildCheckboxWidgetPrintedLabel(matchedWidget, page) : '';
      const fallbackLabel = matchedWidget
        ? normalizeCheckboxOptionLabel(
            printedLabel ||
              normalizeString(matchedWidget.field_label) ||
              humanizeFieldName(matchedWidget.field_name),
            matchedWidget.field_name,
          )
        : '';
      const hasDuplicateId =
        (optionIdCounts.get(normalizeComparableLabel(option?.id || '')) || 0) > 1;
      const hasDuplicateLabel =
        (optionLabelCounts.get(normalizeComparableLabel(option?.label || '')) || 0) > 1;
      const prefersFallbackLabel =
        fallbackLabel && shouldPreferFallbackCheckboxLabel(option?.label, fallbackLabel);
      const canonicalWidgetOptionId = matchedWidget?.field_name ? slugify(matchedWidget.field_name) : '';
      const currentOptionId = slugify(option?.id);
      const nextLabel =
        fallbackLabel &&
        (hasDuplicateId || hasDuplicateLabel || prefersFallbackLabel)
          ? fallbackLabel
          : normalizeString(option?.label);
      const shouldRebuildOptionIdentity =
        hasDuplicateId ||
        hasDuplicateLabel ||
        prefersFallbackLabel ||
        Boolean(canonicalWidgetOptionId && currentOptionId !== canonicalWidgetOptionId);
      const nextId = buildUniqueSlug(
        shouldRebuildOptionIdentity
          ? [matchedWidget?.field_name, nextLabel, option?.id]
          : [option?.id, matchedWidget?.field_name, nextLabel],
        seenOptionIds,
        `${question?.id || 'question'}-option`,
      );
      seenOptionIds.add(nextId);

      return {
        ...option,
        id: nextId,
        label: nextLabel || normalizeString(option?.label),
      };
    });

    return {
      ...question,
      options: repairedOptions,
    };
  });

  return {
    ...payload,
    questions: repairedQuestions,
  };
}

function isSignatureWidget(widget) {
  const fieldType = normalizeString(widget?.field_type || widget?.fieldType).toLowerCase();
  if (fieldType === 'signature') {
    return true;
  }

  const fieldName = normalizeString(widget?.field_name || widget?.fieldName).toLowerCase();
  const fieldLabel = normalizeString(widget?.field_label || widget?.fieldLabel).toLowerCase();
  return /\bsignature\b|\bfirma\b/.test(`${fieldName} ${fieldLabel}`);
}

function findBestSignatureBaseline(page, widget) {
  const widgetLeft = Number(widget?.x || 0);
  const widgetWidth = Math.max(Number(widget?.width || 0), 1);
  const widgetRight = widgetLeft + widgetWidth;
  const widgetMidY = Number(widget?.y || 0) + Number(widget?.height || 0) / 2;

  const candidates = (page?.line_candidates || [])
    .filter((line) => normalizeString(line?.orientation) === 'horizontal')
    .map((line) => {
      const lineLeft = Number(line.x || 0);
      const lineWidth = Math.max(Number(line.width || 0), 0);
      const lineRight = lineLeft + lineWidth;
      const overlapWidth = Math.min(widgetRight, lineRight) - Math.max(widgetLeft, lineLeft);
      const overlapRatio = overlapWidth / widgetWidth;
      const verticalDistance = Math.abs(Number(line.y || 0) - widgetMidY);

      return {
        line,
        overlapWidth,
        overlapRatio,
        verticalDistance,
      };
    })
    .filter((candidate) => candidate.line.width > 0)
    .filter((candidate) => candidate.verticalDistance <= 18)
    .filter(
      (candidate) =>
        candidate.overlapWidth >= widgetWidth * 0.5 ||
        candidate.overlapRatio >= 0.65 ||
        (candidate.line.width >= widgetWidth * 0.85 &&
          Math.abs(Number(candidate.line.x || 0) - widgetLeft) <= 18),
    )
    .sort((left, right) => {
      if (left.verticalDistance !== right.verticalDistance) {
        return left.verticalDistance - right.verticalDistance;
      }
      return Number(right.line.width || 0) - Number(left.line.width || 0);
    });

  return candidates[0]?.line || null;
}

function buildDerivedSignatureAreas(pdfGeometry) {
  const derivedAreas = [];

  for (const page of pdfGeometry?.pages || []) {
    for (const widget of page.widgets || []) {
      if (!isSignatureWidget(widget)) continue;

      const baseline = findBestSignatureBaseline(page, widget);
      const areaWidth = Math.max(Number(baseline?.width || widget.width || 0), 24);
      const areaHeight = Math.max(Number(widget.height || 0) * 2.8, 32);
      const areaX = Number(baseline?.x ?? widget.x ?? 0);
      const areaY = Number(baseline?.y ?? widget.y ?? 0);

      derivedAreas.push({
        id: normalizeString(widget.field_name || widget.fieldName) || 'signature-area',
        label: normalizeString(widget.field_label || widget.fieldLabel) || 'Signature Area',
        field_name: normalizeString(widget.field_name || widget.fieldName) || null,
        page_index: Number(page.page_index || 0),
        x: Number(areaX.toFixed(2)),
        y: Number(areaY.toFixed(2)),
        width: Number(areaWidth.toFixed(2)),
        height: Number(areaHeight.toFixed(2)),
      });
    }
  }

  return normalizePdfSignatureAreas(derivedAreas);
}

function attachSignatureAreasToPayload(payload, pdfGeometry) {
  const normalizedPayload = payload || buildUnsupportedAutofillPayload();
  const existingAreas = normalizePdfSignatureAreas(normalizedPayload.signature_areas);
  const signatureAreas = existingAreas.length > 0 ? existingAreas : buildDerivedSignatureAreas(pdfGeometry);

  return {
    ...normalizedPayload,
    signature_areas: signatureAreas,
  };
}

function normalizeComparableUrl(value) {
  if (!value) return '';

  try {
    const normalized = new URL(value);
    normalized.hash = '';
    normalized.search = '';
    normalized.pathname = normalized.pathname.replace(/\/+$/, '') || '/';
    return normalized.toString();
  } catch {
    return normalizeString(value).replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  }
}

function normalizeComparableLabel(value) {
  return normalizeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toContentUrl(sourceDocumentId) {
  return `/api/records-workflow/source-documents/${sourceDocumentId}/content`;
}

function buildTemplateIdFallback(sourceDocument) {
  const base = slugify(
    [
      sourceDocument?.system_name,
      sourceDocument?.facility_name,
      sourceDocument?.title,
      sourceDocument?.source_url ? path.basename(sourceDocument.source_url) : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  return base || `source-document-${sourceDocument?.id || 'template'}`;
}

function buildConfidenceSummary(payload) {
  return {
    supported: Boolean(payload?.supported),
    confidence: payload?.confidence ?? null,
    question_count: Array.isArray(payload?.questions) ? payload.questions.length : 0,
    mode: payload?.mode ?? null,
  };
}

async function loadLatestParsedArtifact(sourceDocument, client = null) {
  if (!sourceDocument?.id) return null;

  const q = client || { query };
  const result = await q.query(
    `select
       pa.id,
       pa.parse_status,
       pa.storage_path,
       pa.created_at
     from parsed_artifacts pa
     where pa.source_document_id = $1
     order by
       case
         when pa.id = $2 then 0
         else 1
       end asc,
       pa.created_at desc
     limit 1`,
    [sourceDocument.id, sourceDocument.parsed_artifact_id || null],
  );

  return result.rows[0] || null;
}

async function loadPersistedParsedDocument(sourceDocument, client = null) {
  const parsedArtifact = await loadLatestParsedArtifact(sourceDocument, client);
  if (!parsedArtifact?.storage_path) {
    return {
      parsedArtifact: null,
      parsedDocument: null,
    };
  }

  try {
    const artifactPayload = JSON.parse(
      await fs.readFile(resolveParsedArtifactPath(parsedArtifact.storage_path), 'utf8'),
    );
    return {
      parsedArtifact,
      parsedDocument: artifactPayload?.parsed_document || null,
    };
  } catch (error) {
    console.warn('Failed to load persisted parsed artifact for question review:', {
      sourceDocumentId: sourceDocument?.id || null,
      parsedArtifactId: parsedArtifact.id,
      storagePath: parsedArtifact.storage_path,
      error,
    });
    return {
      parsedArtifact,
      parsedDocument: null,
    };
  }
}

async function loadPdfGeometry(sourceDocument, client = null) {
  if (!sourceDocument?.storage_path || sourceDocument?.source_type !== 'pdf') {
    return null;
  }

  const { parsedArtifact, parsedDocument: parsed } = await loadPersistedParsedDocument(
    sourceDocument,
    client,
  );
  if (!parsedArtifact?.storage_path) {
    return null;
  }

  if (!parsed) {
    return {
      parse_status: 'artifact_missing',
      page_count: 0,
      pages: [],
    };
  }

  const pages = Array.isArray(parsed?.pages)
    ? parsed.pages.map((page) => ({
        page_index: page.pageIndex,
        width: Number(page.width || 0),
        height: Number(page.height || 0),
        words: Array.isArray(page.words)
          ? page.words
              .map((word) => ({
                text: normalizeString(word.text || ''),
                x: Number(word.x || 0),
                y: Number(word.y || 0),
                width: Number(word.width || 0),
                height: Number(word.height || 0),
              }))
              .filter((word) => word.text)
          : [],
        widgets: Array.isArray(page.widgets)
          ? page.widgets.map((widget) => ({
              field_name: widget.fieldName || null,
              field_label: widget.fieldLabel || null,
              field_type: widget.fieldType || null,
              field_value: widget.fieldValue ?? null,
              x: Number(widget.x || 0),
              y: Number(widget.y || 0),
              width: Number(widget.width || 0),
              height: Number(widget.height || 0),
            }))
          : [],
        line_candidates: Array.isArray(page.lineCandidates)
          ? page.lineCandidates.map((line) => ({
              shape: line.shape || null,
              orientation: line.orientation || null,
              x: Number(line.x || 0),
              y: Number(line.y || 0),
              width: Number(line.width || 0),
              height: Number(line.height || 0),
            }))
          : [],
      }))
    : [];

  return {
    parse_status: parsed?.parseStatus || parsedArtifact.parse_status || null,
    page_count: pages.length,
    pages,
  };
}

function normalizeDraftPayload(payload, templateIdFallback) {
  if (payload?.supported === false) {
    return buildUnsupportedAutofillPayload({
      template_id: templateIdFallback,
    });
  }

  const normalized = normalizePdfFormUnderstanding(
    {
      ...(payload || {}),
      template_id: normalizeString(payload?.template_id) || templateIdFallback,
    },
    0,
  );

  if (!normalized.supported) {
    throw new Error(
      'Question-review drafts must contain a supported normalized autofill payload or be explicitly marked unsupported.',
    );
  }

  return normalized;
}

async function prepareDraftPayloadForPersistence(
  payload,
  templateIdFallback,
  sourceDocument,
  client = null,
) {
  const { parsedDocument: persistedParsedPdf } = await loadPersistedParsedDocument(sourceDocument, client);
  const repairedInputPayload = persistedParsedPdf
    ? repairPdfFormUnderstandingOutput(
        {
          ...(payload || {}),
          template_id: normalizeString(payload?.template_id) || templateIdFallback,
        },
        persistedParsedPdf,
      )
    : payload;
  const normalizedPayload = normalizeDraftPayload(repairedInputPayload, templateIdFallback);
  const enrichedPayload = persistedParsedPdf
    ? normalizePdfFormUnderstanding(
        repairPdfFormUnderstandingOutput(normalizedPayload, persistedParsedPdf),
        0,
      )
    : normalizedPayload;
  const pdfGeometry = await loadPdfGeometry(sourceDocument, client);
  const repairedPayload =
    enrichedPayload?.mode === 'overlay'
      ? repairQuestionOptionMetadata(enrichedPayload, pdfGeometry)
      : enrichedPayload;
  return attachSignatureAreasToPayload(repairedPayload, pdfGeometry);
}

async function loadSourceDocument(sourceDocumentId, client = null) {
  const q = client || { query };
  const result = await q.query(
    `select
       sd.id,
       sd.hospital_system_id,
       sd.facility_id,
       sd.source_url,
       sd.source_type,
       sd.title,
       sd.fetched_at,
       sd.http_status,
       sd.content_hash,
       sd.storage_path,
       sd.parsed_artifact_id,
       sd.extracted_text,
       sd.import_mode,
       sd.import_notes,
       hs.system_name,
       hs.state as system_state,
       f.facility_name,
       f.city as facility_city,
       f.state as facility_state
     from source_documents sd
     join hospital_systems hs on hs.id = sd.hospital_system_id
     left join facilities f on f.id = sd.facility_id
     where sd.id = $1
     limit 1`,
    [sourceDocumentId],
  );

  return result.rows[0] || null;
}

async function loadLatestFormExtractionRun(sourceDocumentId, client = null) {
  const q = client || { query };
  const result = await q.query(
    `select
       id,
       source_document_id,
       extractor_name,
       extractor_version,
       status,
       structured_output,
       created_at
     from extraction_runs
     where source_document_id = $1
       and extractor_name = $2
     order by created_at desc
     limit 1`,
    [sourceDocumentId, PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME],
  );

  return result.rows[0] || null;
}

async function loadQuestionTemplate(sourceDocumentId, client = null) {
  const q = client || { query };
  const result = await q.query(
    `select
       id,
       source_document_id,
       latest_extraction_run_id,
       status,
       payload,
       source_document_content_hash,
       confidence_summary,
       review_notes,
       approved_at,
       created_at,
       updated_at
     from pdf_question_templates
     where source_document_id = $1
     limit 1`,
    [sourceDocumentId],
  );

  return result.rows[0] || null;
}

async function loadPublishedVersions(templateId, client = null) {
  if (!templateId) return [];

  const q = client || { query };
  const result = await q.query(
    `select
       id,
       pdf_question_template_id,
       source_document_id,
       source_document_content_hash,
       version_no,
       status,
       payload,
       created_at,
       published_at
     from pdf_question_template_versions
     where pdf_question_template_id = $1
     order by version_no desc, published_at desc`,
    [templateId],
  );

  return result.rows;
}

async function ensureQuestionTemplate(sourceDocumentId, client = null) {
  const q = client || { query };
  const sourceDocument = await loadSourceDocument(sourceDocumentId, q);
  if (!sourceDocument) {
    throw new Error('Source document not found.');
  }

  let template = await loadQuestionTemplate(sourceDocumentId, q);
  if (template) {
    return {
      sourceDocument,
      template,
    };
  }

  const latestRun = await loadLatestFormExtractionRun(sourceDocumentId, q);
  const templateIdFallback = buildTemplateIdFallback(sourceDocument);
  const payload = latestRun?.structured_output?.form_understanding
    ? {
        ...latestRun.structured_output.form_understanding,
        template_id:
          normalizeString(latestRun.structured_output.form_understanding.template_id) ||
          templateIdFallback,
      }
    : buildUnsupportedAutofillPayload({
        template_id: templateIdFallback,
      });

  const inserted = await q.query(
    `insert into pdf_question_templates (
       source_document_id,
       latest_extraction_run_id,
       status,
       payload,
       source_document_content_hash,
       confidence_summary
     )
     values ($1, $2, $3, $4, $5, $6)
     returning
       id,
       source_document_id,
       latest_extraction_run_id,
       status,
       payload,
       source_document_content_hash,
       confidence_summary,
       review_notes,
       approved_at,
       created_at,
       updated_at`,
    [
      sourceDocumentId,
      latestRun?.id || null,
      'draft',
      payload,
      sourceDocument.content_hash || null,
      buildConfidenceSummary(payload),
    ],
  );

  template = inserted.rows[0];
  return {
    sourceDocument,
    template,
  };
}

function buildQuestionReviewResponse({
  sourceDocument,
  latestRun,
  template,
  publishedVersions,
  pdfGeometry = null,
}) {
  const latestRunPayload = attachSignatureAreasToPayload(
    latestRun?.structured_output?.form_understanding || buildUnsupportedAutofillPayload(),
    pdfGeometry,
  );
  const draftPayload = attachSignatureAreasToPayload(
    template?.payload || buildUnsupportedAutofillPayload(),
    pdfGeometry,
  );

  return {
    source_document: {
      id: sourceDocument.id,
      hospital_system_id: sourceDocument.hospital_system_id,
      facility_id: sourceDocument.facility_id,
      source_url: sourceDocument.source_url,
      source_type: sourceDocument.source_type,
      title: sourceDocument.title,
      fetched_at: sourceDocument.fetched_at,
      http_status: sourceDocument.http_status,
      content_hash: sourceDocument.content_hash,
      storage_path: sourceDocument.storage_path,
      import_mode: sourceDocument.import_mode,
      import_notes: sourceDocument.import_notes,
      content_url: toContentUrl(sourceDocument.id),
      hospital_system: {
        name: sourceDocument.system_name,
        state: sourceDocument.system_state,
      },
      facility: sourceDocument.facility_id
        ? {
            id: sourceDocument.facility_id,
            name: sourceDocument.facility_name,
            city: sourceDocument.facility_city,
            state: sourceDocument.facility_state,
          }
        : null,
    },
    latest_extraction_run: latestRun
      ? {
          id: latestRun.id,
          status: latestRun.status,
          created_at: latestRun.created_at,
          payload: latestRunPayload,
          metadata: latestRun.structured_output?.metadata || null,
        }
      : null,
    draft: template
      ? {
          id: template.id,
          status: template.status,
          payload: draftPayload,
          confidence_summary: template.confidence_summary,
          review_notes: template.review_notes,
          approved_at: template.approved_at,
          created_at: template.created_at,
          updated_at: template.updated_at,
        }
      : null,
    published_versions: publishedVersions.map((version) => ({
      id: version.id,
      version_no: version.version_no,
      status: version.status,
      source_document_id: version.source_document_id,
      source_document_content_hash: version.source_document_content_hash,
      payload: attachSignatureAreasToPayload(version.payload, pdfGeometry),
      published_at: version.published_at,
    })),
    pdf_geometry: pdfGeometry,
  };
}

async function buildQuestionReview(sourceDocumentId, client = null) {
  const q = client || { query };
  const { sourceDocument, template } = await ensureQuestionTemplate(sourceDocumentId, q);
  const [latestRun, publishedVersions, pdfGeometry] = await Promise.all([
    loadLatestFormExtractionRun(sourceDocumentId, q),
    loadPublishedVersions(template.id, q),
    loadPdfGeometry(sourceDocument, q),
  ]);

  return buildQuestionReviewResponse({
    sourceDocument,
    latestRun,
    template,
    publishedVersions,
    pdfGeometry,
  });
}

async function syncPublishedVersionToWorkflowForms(sourceDocument, versionId, client = null) {
  const q = client || { query };
  const forms = await q.query(
    `select
       wf.id,
       wf.form_name,
       wf.form_url
     from workflow_forms wf
     join records_workflows rw on rw.id = wf.records_workflow_id
     where rw.hospital_system_id = $1
       and (
         rw.facility_id is null
         or rw.facility_id is not distinct from $2
       )`,
    [sourceDocument.hospital_system_id, sourceDocument.facility_id],
  );

  const sourceUrl = normalizeComparableUrl(sourceDocument.source_url);
  const sourceLabel = normalizeComparableLabel(
    sourceDocument.title || path.basename(sourceDocument.source_url || ''),
  );

  const exactUrlMatches = forms.rows.filter(
    (form) => normalizeComparableUrl(form.form_url) === sourceUrl,
  );
  const nameMatches = forms.rows.filter(
    (form) => normalizeComparableLabel(form.form_name) === sourceLabel,
  );
  const matchingIds = new Set(
    (exactUrlMatches.length > 0
      ? exactUrlMatches
      : nameMatches.length === 1
        ? nameMatches
        : []
    ).map((form) => form.id),
  );

  if (matchingIds.size === 0) {
    return [];
  }

  await q.query(
    `update workflow_forms
     set published_question_template_version_id = $2,
         updated_at = now()
     where id = any($1::uuid[])`,
    [Array.from(matchingIds), versionId],
  );

  return Array.from(matchingIds);
}

export async function getSourceDocumentQuestionReview(sourceDocumentId) {
  return buildQuestionReview(sourceDocumentId);
}

export async function saveQuestionReviewDraft(
  sourceDocumentId,
  {
    payload,
    reviewNotes = null,
    markUnsupported = false,
  } = {},
) {
  return withTransaction(async (client) => {
    const { sourceDocument, template } = await ensureQuestionTemplate(sourceDocumentId, client);
    const nextPayload = await prepareDraftPayloadForPersistence(
      payload,
      buildTemplateIdFallback(sourceDocument),
      sourceDocument,
      client,
    );
    const nextStatus = !nextPayload.supported && markUnsupported ? 'unsupported' : 'draft';

    await client.query(
      `update pdf_question_templates
       set status = $2,
           payload = $3,
           source_document_content_hash = $4,
           confidence_summary = $5,
           review_notes = coalesce($6, review_notes),
           updated_at = now()
       where id = $1`,
      [
        template.id,
        nextStatus,
        nextPayload,
        sourceDocument.content_hash || null,
        buildConfidenceSummary(nextPayload),
        normalizeOptionalReviewNotes(reviewNotes),
      ],
    );

    return buildQuestionReview(sourceDocumentId, client);
  });
}

function normalizeOptionalReviewNotes(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function buildQuestionExtractionDraftPayload(extraction, sourceDocument) {
  const templateIdFallback = buildTemplateIdFallback(sourceDocument);
  const nextPayload =
    extraction?.structuredOutput?.form_understanding ||
    buildUnsupportedAutofillPayload({
      template_id: templateIdFallback,
    });

  return {
    ...nextPayload,
    template_id: normalizeString(nextPayload.template_id) || templateIdFallback,
  };
}

async function persistQuestionExtractionResultInClient(
  sourceDocumentId,
  {
    sourceDocument = null,
    extraction,
    replaceDraft = true,
  } = {},
  client,
) {
  const resolvedSourceDocument = sourceDocument || (await loadSourceDocument(sourceDocumentId, client));
  if (!resolvedSourceDocument) {
    throw new Error('Source document not found.');
  }

  if (resolvedSourceDocument.source_type !== 'pdf') {
    throw new Error('Question review is only available for PDF source documents.');
  }

  const nextPayload = await prepareDraftPayloadForPersistence(
    buildQuestionExtractionDraftPayload(extraction, resolvedSourceDocument),
    buildTemplateIdFallback(resolvedSourceDocument),
    resolvedSourceDocument,
    client,
  );
  const persistedExtraction = {
    ...extraction,
    structuredOutput: {
      ...(extraction?.structuredOutput || {}),
      form_understanding: nextPayload,
    },
  };
  const extractionRunId = await insertExtractionRun(
    {
      sourceDocumentId,
      extractorName: persistedExtraction.extractorName,
      extractorVersion: persistedExtraction.extractorVersion,
      status: persistedExtraction.status,
      structuredOutput: persistedExtraction.structuredOutput,
    },
    client,
  );

  const { template } = await ensureQuestionTemplate(sourceDocumentId, client);
  if (replaceDraft) {
    await client.query(
      `update pdf_question_templates
       set latest_extraction_run_id = $2,
           status = 'draft',
           payload = $3,
           source_document_content_hash = $4,
           confidence_summary = $5,
           updated_at = now()
       where id = $1`,
      [
        template.id,
        extractionRunId,
        nextPayload,
        resolvedSourceDocument.content_hash || null,
        buildConfidenceSummary(nextPayload),
      ],
    );
  } else {
    await client.query(
      `update pdf_question_templates
       set latest_extraction_run_id = $2,
           updated_at = now()
       where id = $1`,
      [template.id, extractionRunId],
    );
  }

  const review = await buildQuestionReview(sourceDocumentId, client);
  return {
    ...review,
    extraction_run_id: extractionRunId,
    reextraction_run: {
      id: extractionRunId,
      status: persistedExtraction.status,
      payload:
        persistedExtraction.structuredOutput?.form_understanding || buildUnsupportedAutofillPayload(),
      metadata: persistedExtraction.structuredOutput?.metadata || null,
    },
  };
}

export async function persistQuestionExtractionResult(
  sourceDocumentId,
  options = {},
  client = null,
) {
  if (client) {
    return persistQuestionExtractionResultInClient(sourceDocumentId, options, client);
  }

  return withTransaction(async (transactionClient) =>
    persistQuestionExtractionResultInClient(sourceDocumentId, options, transactionClient),
  );
}

export async function publishQuestionReview(
  sourceDocumentId,
  {
    payload = null,
    reviewNotes = null,
  } = {},
) {
  return withTransaction(async (client) => {
    const { sourceDocument, template } = await ensureQuestionTemplate(sourceDocumentId, client);
    const nextPayload = payload
      ? await prepareDraftPayloadForPersistence(
          payload,
          buildTemplateIdFallback(sourceDocument),
          sourceDocument,
          client,
        )
      : await prepareDraftPayloadForPersistence(
          template.payload,
          buildTemplateIdFallback(sourceDocument),
          sourceDocument,
          client,
        );
    const versionStatus = nextPayload.supported ? 'approved' : 'unsupported';

    const versionResult = await client.query(
      `select coalesce(max(version_no), 0) + 1 as next_version_no
       from pdf_question_template_versions
       where pdf_question_template_id = $1`,
      [template.id],
    );
    const nextVersionNo = Number(versionResult.rows[0]?.next_version_no || 1);

    const insertedVersion = await client.query(
      `insert into pdf_question_template_versions (
         pdf_question_template_id,
         source_document_id,
         source_document_content_hash,
         version_no,
         status,
         payload
       )
       values ($1, $2, $3, $4, $5, $6)
       returning id, version_no, status, payload, published_at`,
      [
        template.id,
        sourceDocument.id,
        sourceDocument.content_hash || null,
        nextVersionNo,
        versionStatus,
        nextPayload,
      ],
    );
    const version = insertedVersion.rows[0];

    await client.query(
      `update pdf_question_templates
       set status = $2,
           payload = $3,
           source_document_content_hash = $4,
           confidence_summary = $5,
           review_notes = coalesce($6, review_notes),
           approved_at = now(),
           updated_at = now()
       where id = $1`,
      [
        template.id,
        versionStatus,
        nextPayload,
        sourceDocument.content_hash || null,
        buildConfidenceSummary(nextPayload),
        normalizeOptionalReviewNotes(reviewNotes),
      ],
    );

    await syncPublishedVersionToWorkflowForms(sourceDocument, version.id, client);

    const review = await buildQuestionReview(sourceDocumentId, client);
    return {
      ...review,
      published_version: version,
    };
  });
}

export async function reextractQuestionReview(
  sourceDocumentId,
  {
    replaceDraft = true,
  } = {},
) {
  const sourceDocument = await loadSourceDocument(sourceDocumentId);
  if (!sourceDocument) {
    throw new Error('Source document not found.');
  }

  if (sourceDocument.source_type !== 'pdf') {
    throw new Error('Question review is only available for PDF source documents.');
  }

  if (!sourceDocument.storage_path) {
    throw new Error('Source document does not have a stored PDF path.');
  }

  const resolvedPath = resolveSourceDocumentPath(sourceDocument.storage_path);
  const { parsedDocument: persistedParsedPdf } = await loadPersistedParsedDocument(sourceDocument);
  let parsedPdf = persistedParsedPdf;

  if (!parsedPdf) {
    const buffer = await fs.readFile(resolvedPath);
    parsedPdf = await parsePdfDocument({
      buffer,
      filePath: resolvedPath,
    });
  }

  const extraction = await extractPdfFormUnderstanding({
    parsedPdf,
    hospitalSystemName: sourceDocument.system_name,
    facilityName: sourceDocument.facility_name || null,
    formName:
      sourceDocument.title ||
      path.basename(sourceDocument.source_url || sourceDocument.storage_path || 'authorization-form.pdf'),
    sourceUrl: sourceDocument.source_url,
  });

  return persistQuestionExtractionResult(sourceDocumentId, {
    sourceDocument,
    extraction,
    replaceDraft,
  });
}
