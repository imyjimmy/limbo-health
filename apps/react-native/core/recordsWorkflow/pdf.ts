import RNFS from 'react-native-fs';
import {
  PDFCheckBox,
  PDFDocument,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  rgb as pdfRgb,
  type PDFFont,
  type PDFPage,
  type PDFField,
} from 'pdf-lib';
import { decode as decodeBase64, encode as encodeBase64 } from '../crypto/base64';
import type { RecordsWorkflowAutofillAnswers } from './autofill';
import { findFlatPdfTemplate, getFlatPdfTemplateSupportMessage } from './pdfTemplates';
import { ACTIVE_THEME_NAME, resolveTheme } from '../../theme/themes';
import type { BioProfile } from '../../types/bio';
import type {
  RecordsRequestIdAttachment,
  RecordsRequestPacket,
  RecordsWorkflowAutofillBinding,
  RecordsWorkflowForm,
} from '../../types/recordsRequest';

interface GenerateRecordsRequestPdfInput {
  bioProfile: BioProfile;
  packet: RecordsRequestPacket;
  idAttachment: RecordsRequestIdAttachment | null;
  selectedFormKey?: string | null;
  autofillAnswers?: RecordsWorkflowAutofillAnswers;
}

interface PreparedRecordsRequestPdfTemplate {
  form: RecordsWorkflowForm;
  pdfBytes: Uint8Array;
  fieldCount: number;
  flatTemplateId: string | null;
}

const pdfTheme = resolveTheme(ACTIVE_THEME_NAME, 'light');
const preparedTemplateCache = new Map<string, Promise<PreparedRecordsRequestPdfTemplate>>();

function normalizeFieldName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isSpanishFormName(name: string): boolean {
  return /espanol|español|spanish/i.test(name);
}

function sortPdfForms(forms: RecordsWorkflowForm[]): RecordsWorkflowForm[] {
  return [...forms]
    .filter((form) => form.format === 'pdf')
    .sort((a, b) => {
      const score = (form: RecordsWorkflowForm) =>
        (form.cachedContentUrl ? 100 : 0) +
        (!isSpanishFormName(form.name) ? 10 : 0);

      return score(b) - score(a);
    });
}

function matchesAny(fieldName: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(fieldName));
}

function setTextFieldValue(field: PDFField, value: string) {
  if (!(field instanceof PDFTextField)) return false;
  field.setText(value);
  return true;
}

function hexToPdfColor(hexColor: string) {
  const normalized = hexColor.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized;
  const red = Number.parseInt(value.slice(0, 2), 16) / 255;
  const green = Number.parseInt(value.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(value.slice(4, 6), 16) / 255;
  return pdfRgb(red, green, blue);
}

function fillBioFields(pdf: PDFDocument, bioProfile: BioProfile) {
  const form = pdf.getForm();
  const fields = form.getFields();

  const addressLine = [bioProfile.addressLine1, bioProfile.addressLine2]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ');
  const cityState = [bioProfile.city.trim(), bioProfile.state.trim()]
    .filter(Boolean)
    .join(', ');

  let filledCount = 0;

  for (const field of fields) {
    const normalized = normalizeFieldName(field.getName());
    if (/signature|firma/.test(normalized)) continue;

    if (
      matchesAny(normalized, [
        /\bpatients? name\b/,
        /\bpatient name\b/,
        /\bnombre del paciente\b/,
        /\bmake request\b/,
        /\byour name\b/,
      ])
    ) {
      filledCount += setTextFieldValue(field, bioProfile.fullName.trim()) ? 1 : 0;
      continue;
    }

    if (
      matchesAny(normalized, [
        /\bstreet address\b/,
        /\bmailing address\b/,
        /\bdireccion postal\b/,
      ])
    ) {
      filledCount += setTextFieldValue(field, addressLine) ? 1 : 0;
      continue;
    }

    if (matchesAny(normalized, [/\bcity state\b/, /\bciudad y estado\b/])) {
      filledCount += setTextFieldValue(field, cityState) ? 1 : 0;
      continue;
    }

    if (
      matchesAny(normalized, [
        /\bzip\b/,
        /\bpostal code\b/,
        /\bcodigo postal\b/,
        /\bp code\b/,
      ])
    ) {
      filledCount += setTextFieldValue(field, bioProfile.postalCode.trim()) ? 1 : 0;
      continue;
    }

    if (
      matchesAny(normalized, [
        /\bdate of birth\b/,
        /\bfecha de nac\b/,
        /\bdob\b/,
      ])
    ) {
      filledCount += setTextFieldValue(field, bioProfile.dateOfBirth.trim()) ? 1 : 0;
    }
  }

  return {
    fieldCount: fields.length,
    filledCount,
  };
}

async function appendIdPage(pdf: PDFDocument, idAttachment: RecordsRequestIdAttachment) {
  const imageBytes = decodeBase64(idAttachment.base64Data);
  const image = /png/i.test(idAttachment.mimeType)
    ? await pdf.embedPng(imageBytes)
    : await pdf.embedJpg(imageBytes);

  const pageWidth = 612;
  const pageHeight = 792;
  const page = pdf.addPage([pageWidth, pageHeight]);
  const margin = 36;
  const titleY = pageHeight - 48;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2 - 36;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = (pageWidth - drawWidth) / 2;
  const drawY = pageHeight - margin - 28 - drawHeight;

  page.drawText('Attached Identification', {
    x: margin,
    y: titleY,
    size: 16,
    color: hexToPdfColor(pdfTheme.colors.text),
  });
  page.drawImage(image, {
    x: drawX,
    y: Math.max(margin, drawY),
    width: drawWidth,
    height: drawHeight,
  });
}

function buildTemplateCacheKey(form: RecordsWorkflowForm) {
  return form.cachedContentUrl || form.url;
}

function buildPreparedTemplateCacheKey(packet: RecordsRequestPacket, form: RecordsWorkflowForm) {
  return `${packet.hospitalSystem.id}:${buildTemplateCacheKey(form)}`;
}

async function prepareFormTemplate(
  packet: RecordsRequestPacket,
  form: RecordsWorkflowForm,
): Promise<PreparedRecordsRequestPdfTemplate> {
  const downloadUrl = buildTemplateCacheKey(form);
  const response = await fetch(downloadUrl);

  if (!response.ok) {
    throw new Error(`Unable to download ${form.name}.`);
  }

  const pdfBytes = new Uint8Array(await response.arrayBuffer());
  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const flatTemplate = findFlatPdfTemplate({ packet, form, pdf });

  return {
    form,
    pdfBytes,
    fieldCount: pdf.getForm().getFields().length,
    flatTemplateId: flatTemplate?.id || null,
  };
}

async function loadPreparedFormTemplate(
  packet: RecordsRequestPacket,
  form: RecordsWorkflowForm,
): Promise<PreparedRecordsRequestPdfTemplate> {
  const cacheKey = buildPreparedTemplateCacheKey(packet, form);
  let cachedPromise = preparedTemplateCache.get(cacheKey);

  if (!cachedPromise) {
    cachedPromise = prepareFormTemplate(packet, form).catch((error) => {
      preparedTemplateCache.delete(cacheKey);
      throw error;
    });
    preparedTemplateCache.set(cacheKey, cachedPromise);
  }

  const prepared = await cachedPromise;

  return {
    form: prepared.form,
    pdfBytes: prepared.pdfBytes.slice(),
    fieldCount: prepared.fieldCount,
    flatTemplateId: prepared.flatTemplateId,
  };
}

function orderPdfCandidates(forms: RecordsWorkflowForm[], preferredFormKey?: string | null) {
  const sorted = sortPdfForms(forms);
  if (!preferredFormKey) return sorted;

  return [...sorted].sort((a, b) => {
    const aMatches = buildTemplateCacheKey(a) === preferredFormKey ? -1 : 0;
    const bMatches = buildTemplateCacheKey(b) === preferredFormKey ? -1 : 0;
    return aMatches - bMatches;
  });
}

async function chooseFillablePdfForm(
  packet: RecordsRequestPacket,
  options?: { preferredFormKey?: string | null },
) {
  const candidates = orderPdfCandidates(packet.forms, options?.preferredFormKey);
  if (candidates.length === 0) {
    throw new Error('No PDF request form is available for this hospital system yet.');
  }

  let flatFormDetected = false;
  let lastError: Error | null = null;
  let firstFlatFormName: string | null = null;

  for (const candidate of candidates) {
    try {
      const prepared = await loadPreparedFormTemplate(packet, candidate);
      const hasBioSupport = prepared.fieldCount > 0 || Boolean(prepared.flatTemplateId);
      const hasDynamicQuestionSupport =
        candidate.autofill.supported && candidate.autofill.questions.length > 0;

      if (hasBioSupport || hasDynamicQuestionSupport) {
        return prepared;
      }

      flatFormDetected = true;
      firstFlatFormName ||= candidate.name;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unable to load PDF form.');
    }
  }

  if (flatFormDetected) {
    throw new Error(getFlatPdfTemplateSupportMessage(firstFlatFormName || 'hospital request form'));
  }

  throw lastError || new Error('Unable to load a fillable hospital PDF form.');
}

function findPdfFieldByName(fields: PDFField[], fieldName: string) {
  const exactMatch = fields.find((field) => field.getName() === fieldName);
  if (exactMatch) return exactMatch;

  const normalizedTarget = normalizeFieldName(fieldName);
  return fields.find((field) => normalizeFieldName(field.getName()) === normalizedTarget) || null;
}

async function ensureFont(pdf: PDFDocument, cachedFont: PDFFont | null) {
  if (cachedFont) return cachedFont;
  return pdf.embedFont(StandardFonts.Helvetica);
}

async function applyOverlayTextBinding(
  page: PDFPage,
  binding: Extract<RecordsWorkflowAutofillBinding, { type: 'overlay_text' }>,
  text: string,
  font: PDFFont,
) {
  if (!text.trim()) return 0;

  page.drawText(text.trim(), {
    x: binding.x,
    y: binding.y,
    size: binding.fontSize || 11,
    maxWidth: binding.maxWidth || undefined,
    font,
    color: pdfRgb(0, 0, 0),
  });

  return 1;
}

async function applyOverlayMarkBinding(
  page: PDFPage,
  binding: Extract<RecordsWorkflowAutofillBinding, { type: 'overlay_mark' }>,
  font: PDFFont,
) {
  page.drawText('X', {
    x: binding.x,
    y: binding.y,
    size: binding.size || 12,
    font,
    color: pdfRgb(0, 0, 0),
  });

  return 1;
}

async function applyBindings({
  pdf,
  fields,
  bindings,
  textValue = '',
}: {
  pdf: PDFDocument;
  fields: PDFField[];
  bindings: RecordsWorkflowAutofillBinding[];
  textValue?: string;
}) {
  let appliedCount = 0;
  let usedAcroForm = false;
  let overlayFont: PDFFont | null = null;

  for (const binding of bindings) {
    if (binding.type === 'field_text') {
      const field = findPdfFieldByName(fields, binding.fieldName);
      if (field && setTextFieldValue(field, textValue)) {
        appliedCount += 1;
        usedAcroForm = true;
      }
      continue;
    }

    if (binding.type === 'field_checkbox') {
      const field = findPdfFieldByName(fields, binding.fieldName);
      if (field instanceof PDFCheckBox) {
        if (binding.checked) {
          field.check();
        } else {
          field.uncheck();
        }
        appliedCount += 1;
        usedAcroForm = true;
      }
      continue;
    }

    if (binding.type === 'field_radio') {
      const field = findPdfFieldByName(fields, binding.fieldName);
      if (field instanceof PDFRadioGroup) {
        field.select(binding.value);
        appliedCount += 1;
        usedAcroForm = true;
      }
      continue;
    }

    const page = pdf.getPage(binding.pageIndex);
    overlayFont = await ensureFont(pdf, overlayFont);

    if (binding.type === 'overlay_text') {
      appliedCount += await applyOverlayTextBinding(page, binding, textValue, overlayFont);
      continue;
    }

    appliedCount += await applyOverlayMarkBinding(page, binding, overlayFont);
  }

  return { appliedCount, usedAcroForm };
}

async function applyDynamicAutofillAnswers({
  pdf,
  form,
  answers,
}: {
  pdf: PDFDocument;
  form: RecordsWorkflowForm;
  answers: RecordsWorkflowAutofillAnswers;
}) {
  if (!form.autofill.supported || form.autofill.questions.length === 0) {
    return { appliedCount: 0, usedAcroForm: false };
  }

  const fields = pdf.getForm().getFields();
  let appliedCount = 0;
  let usedAcroForm = false;

  for (const question of form.autofill.questions) {
    const answer = answers[question.id];

    if (question.kind === 'short_text') {
      if (typeof answer !== 'string' || !answer.trim()) continue;
      const result = await applyBindings({
        pdf,
        fields,
        bindings: question.bindings,
        textValue: answer,
      });
      appliedCount += result.appliedCount;
      usedAcroForm ||= result.usedAcroForm;
      continue;
    }

    if (question.kind === 'single_select') {
      if (typeof answer !== 'string' || !answer.trim()) continue;
      const selectedOption = question.options.find((option) => option.id === answer);
      if (!selectedOption) continue;
      const result = await applyBindings({
        pdf,
        fields,
        bindings: selectedOption.bindings,
        textValue: selectedOption.label,
      });
      appliedCount += result.appliedCount;
      usedAcroForm ||= result.usedAcroForm;
      continue;
    }

    const selectedOptions = Array.isArray(answer)
      ? question.options.filter((option) => answer.includes(option.id))
      : [];

    for (const selectedOption of selectedOptions) {
      const result = await applyBindings({
        pdf,
        fields,
        bindings: selectedOption.bindings,
        textValue: selectedOption.label,
      });
      appliedCount += result.appliedCount;
      usedAcroForm ||= result.usedAcroForm;
    }
  }

  return { appliedCount, usedAcroForm };
}

export async function prefetchRecordsRequestPdfTemplate(
  packet: RecordsRequestPacket,
  options?: { preferredFormKey?: string | null },
) {
  const prepared = await chooseFillablePdfForm(packet, options);

  return {
    formName: prepared.form.name,
    formKey: buildTemplateCacheKey(prepared.form),
    usedCachedTemplate: Boolean(prepared.form.cachedContentUrl),
    autofillQuestionCount: prepared.form.autofill.questions.length,
  };
}

export async function generateRecordsRequestPdf(input: GenerateRecordsRequestPdfInput) {
  const preparedTemplate = await chooseFillablePdfForm(input.packet, {
    preferredFormKey: input.selectedFormKey || null,
  });
  const selectedForm = preparedTemplate.form;
  const pdf = await PDFDocument.load(preparedTemplate.pdfBytes, { ignoreEncryption: true });

  let filledCount = 0;
  let usedAcroForm = false;

  if (preparedTemplate.fieldCount > 0) {
    const bioResult = fillBioFields(pdf, input.bioProfile);
    filledCount += bioResult.filledCount;
    usedAcroForm ||= bioResult.filledCount > 0;
  } else if (preparedTemplate.flatTemplateId) {
    const flatTemplate = findFlatPdfTemplate({
      packet: input.packet,
      form: selectedForm,
      pdf,
    });
    if (flatTemplate) {
      filledCount += await flatTemplate.apply({
        packet: input.packet,
        form: selectedForm,
        pdf,
        bioProfile: input.bioProfile,
      });
    }
  }

  const dynamicAnswerResult = await applyDynamicAutofillAnswers({
    pdf,
    form: selectedForm,
    answers: input.autofillAnswers || {},
  });
  filledCount += dynamicAnswerResult.appliedCount;
  usedAcroForm ||= dynamicAnswerResult.usedAcroForm;

  if (filledCount === 0) {
    throw new Error(
      'The selected hospital PDF did not expose any matching bio fields or dynamic answer bindings to populate automatically.',
    );
  }

  if (usedAcroForm) {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const form = pdf.getForm();
    form.updateFieldAppearances(font);
    form.flatten();
  }

  if (input.idAttachment) {
    await appendIdPage(pdf, input.idAttachment);
  }

  const pdfBytes = await pdf.save();
  const fileName = `${input.packet.hospitalSystem.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'records-request'}-filled.pdf`;
  const filePath = `${RNFS.TemporaryDirectoryPath}/${fileName}`;

  await RNFS.writeFile(filePath, encodeBase64(pdfBytes), 'base64');

  return {
    uri: `file://${filePath}`,
    filledFieldCount: filledCount,
    formName: selectedForm.name,
    formKey: buildTemplateCacheKey(selectedForm),
    usedCachedTemplate: Boolean(selectedForm.cachedContentUrl),
  };
}
