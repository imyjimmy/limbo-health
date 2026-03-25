import fs from 'node:fs/promises';
import path from 'node:path';
import { parsePdfDocument } from '../parsers/pdfParser.js';
import { query, withTransaction } from '../db.js';
import { extractPdfFormUnderstanding } from '../extractors/pdfFormUnderstandingExtractor.js';
import { insertExtractionRun } from '../repositories/workflowRepository.js';
import { resolveParsedArtifactPath } from '../utils/pipelineArtifactStorage.js';
import { resolveSourceDocumentPath } from '../utils/sourceDocumentStorage.js';
import {
  buildUnsupportedAutofillPayload,
  normalizePdfFormUnderstanding,
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
          payload:
            latestRun.structured_output?.form_understanding || buildUnsupportedAutofillPayload(),
          metadata: latestRun.structured_output?.metadata || null,
        }
      : null,
    draft: template
      ? {
          id: template.id,
          status: template.status,
          payload: template.payload,
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
      payload: version.payload,
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
    const nextPayload = normalizeDraftPayload(payload, buildTemplateIdFallback(sourceDocument));
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

  const extractionRunId = await insertExtractionRun(
    {
      sourceDocumentId,
      extractorName: extraction.extractorName,
      extractorVersion: extraction.extractorVersion,
      status: extraction.status,
      structuredOutput: extraction.structuredOutput,
    },
    client,
  );

  const { template } = await ensureQuestionTemplate(sourceDocumentId, client);
  if (replaceDraft) {
    const nextPayload = buildQuestionExtractionDraftPayload(extraction, resolvedSourceDocument);

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
      status: extraction.status,
      payload:
        extraction.structuredOutput?.form_understanding || buildUnsupportedAutofillPayload(),
      metadata: extraction.structuredOutput?.metadata || null,
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
      ? normalizeDraftPayload(payload, buildTemplateIdFallback(sourceDocument))
      : normalizeDraftPayload(template.payload, buildTemplateIdFallback(sourceDocument));
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
