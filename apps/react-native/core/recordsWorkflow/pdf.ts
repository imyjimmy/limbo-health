import RNFS from 'react-native-fs';
import {
  LineCapStyle,
  PDFCheckBox,
  PDFDocument,
  PDFRadioGroup,
  PDFSignature,
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
import {
  buildSignatureSvgPath,
  getSignatureBounds,
  hasSignatureStrokeInput,
} from './signature';
import { ACTIVE_THEME_NAME, resolveTheme } from '../../theme/themes';
import type { BioProfile } from '../../types/bio';
import type {
  RecordsRequestIdAttachment,
  RecordsRequestPacket,
  RecordsRequestUserSignature,
  RecordsWorkflowAutofillBinding,
  RecordsWorkflowForm,
} from '../../types/recordsRequest';

interface GenerateRecordsRequestPdfInput {
  bioProfile: BioProfile;
  packet: RecordsRequestPacket;
  idAttachment: RecordsRequestIdAttachment | null;
  selectedFormKey?: string | null;
  autofillAnswers?: RecordsWorkflowAutofillAnswers;
  signature?: RecordsRequestUserSignature | null;
}

interface RecordsRequestPdfSignatureField {
  fieldName: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PreparedRecordsRequestPdfTemplate {
  form: RecordsWorkflowForm;
  pdfBytes: Uint8Array;
  fieldCount: number;
  flatTemplateId: string | null;
  signatureFields: RecordsRequestPdfSignatureField[];
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

function getPreferredLanguageCode(preferredLanguage?: string): string {
  const normalizedOverride = preferredLanguage?.trim().toLowerCase();
  if (normalizedOverride) {
    return normalizedOverride.split(/[-_]/)[0] || 'en';
  }

  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const normalizedLocale = locale?.trim().toLowerCase();
    if (normalizedLocale) {
      return normalizedLocale.split(/[-_]/)[0] || 'en';
    }
  } catch {
    // Fall back to English when locale introspection is unavailable.
  }

  return 'en';
}

function normalizeFormDescriptor(form: RecordsWorkflowForm): string {
  return normalizeFieldName(`${form.name} ${form.url} ${form.cachedContentUrl || ''}`);
}

function getSemanticFormScore(form: RecordsWorkflowForm): number {
  const descriptor = normalizeFormDescriptor(form);
  let score = 0;

  if (
    descriptor.includes('authorization for release of medical information from') ||
    descriptor.includes('release of medical information from')
  ) {
    score += 140;
  }

  if (
    descriptor.includes('authorization for release of medical information to') ||
    descriptor.includes('release of medical information to')
  ) {
    score -= 120;
  }

  if (descriptor.includes(' from bswh') || descriptor.includes(' from bswhealth')) {
    score += 60;
  }

  if (descriptor.includes(' to bswh') || descriptor.includes(' to bswhealth')) {
    score -= 60;
  }

  return score;
}

function getLanguagePreferenceScore(
  form: RecordsWorkflowForm,
  preferredLanguage?: string,
): number {
  const normalizedLanguage = getPreferredLanguageCode(preferredLanguage);
  const wantsSpanish = normalizedLanguage === 'es';
  const isSpanish = isSpanishFormName(form.name);

  if (wantsSpanish) {
    return isSpanish ? 40 : -40;
  }

  return isSpanish ? -30 : 30;
}

function sortPdfForms(
  forms: RecordsWorkflowForm[],
  options?: {
    preferredLanguage?: string;
    preferredFormKey?: string | null;
  },
): RecordsWorkflowForm[] {
  return [...forms]
    .filter((form) => form.format === 'pdf')
    .sort((a, b) => {
      const score = (form: RecordsWorkflowForm) =>
        getSemanticFormScore(form) +
        getLanguagePreferenceScore(form, options?.preferredLanguage) +
        (form.cachedContentUrl ? 100 : 0) +
        (options?.preferredFormKey && buildTemplateCacheKey(form) === options.preferredFormKey ? 500 : 0) +
        form.autofill.questions.length;

      return score(b) - score(a);
    });
}

export function getPrimaryPdfForm(
  forms: RecordsWorkflowForm[],
  options?: {
    preferredLanguage?: string;
    preferredFormKey?: string | null;
  },
) {
  return sortPdfForms(forms, options)[0] || null;
}

function matchesAny(fieldName: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(fieldName));
}

function matchesExactFieldName(fieldName: string, names: string[]) {
  return names.includes(fieldName);
}

function setTextFieldValue(field: PDFField, value: string) {
  if (!(field instanceof PDFTextField)) return false;
  field.setText(value);
  return true;
}

function buildCurrentDateValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = String(now.getFullYear());
  return `${month}/${day}/${year}`;
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

function shouldFillPatientRecipientFields(
  form: RecordsWorkflowForm,
  answers: RecordsWorkflowAutofillAnswers,
) {
  return form.autofill.questions.some((question) => {
    if (question.kind !== 'single_select' && question.kind !== 'multi_select') {
      return false;
    }

    if (
      !/\b(released to|receive the records|receive the released information|medical information be released to|recipients?)\b/i.test(
        question.label,
      )
    ) {
      return false;
    }

    const selectedOptionLabels =
      question.kind === 'single_select'
        ? question.options
            .filter((option) => option.id === answers[question.id])
            .map((option) => option.label)
        : Array.isArray(answers[question.id])
          ? question.options
              .filter((option) => (answers[question.id] as string[]).includes(option.id))
              .map((option) => option.label)
          : [];

    return selectedOptionLabels.some((label) => /\b(patient|designee|self)\b/i.test(label));
  });
}

function fillBioFields(
  pdf: PDFDocument,
  bioProfile: BioProfile,
  options?: { allowPatientRecipientFallback?: boolean },
) {
  const form = pdf.getForm();
  const fields = form.getFields();

  const fullName = bioProfile.fullName.trim();
  const phoneNumber = bioProfile.phoneNumber.trim();
  const email = bioProfile.email.trim();
  const addressLine = [bioProfile.addressLine1, bioProfile.addressLine2]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ');
  const cityState = [bioProfile.city.trim(), bioProfile.state.trim()]
    .filter(Boolean)
    .join(', ');
  const cityStateZip = [cityState, bioProfile.postalCode.trim()].filter(Boolean).join(' ');
  const fullMailingAddress = [addressLine, cityStateZip].filter(Boolean).join(', ');
  const today = buildCurrentDateValue();
  const allowPatientRecipientFallback = Boolean(options?.allowPatientRecipientFallback);

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
      filledCount += setTextFieldValue(field, fullName) ? 1 : 0;
      continue;
    }

    if (
      matchesAny(normalized, [
        /\bprinted name of patient or legal representative\b/,
        /\bprinted name\b/,
      ])
    ) {
      filledCount += setTextFieldValue(field, fullName) ? 1 : 0;
      continue;
    }

    if (
      phoneNumber &&
      matchesAny(normalized, [
        /\bpatient telephone number\b/,
        /\bpatient phone\b/,
        /\bpatient contact number\b/,
      ])
    ) {
      filledCount += setTextFieldValue(field, phoneNumber) ? 1 : 0;
      continue;
    }

    if (
      email &&
      matchesAny(normalized, [
        /\bpatient email\b/,
        /\bpatient email address\b/,
      ])
    ) {
      filledCount += setTextFieldValue(field, email) ? 1 : 0;
      continue;
    }

    if (
      allowPatientRecipientFallback &&
      fullName &&
      matchesAny(normalized, [
        /\bindividual ?organization name\b/,
        /\bindividual or organization name\b/,
      ])
    ) {
      filledCount += setTextFieldValue(field, fullName) ? 1 : 0;
      continue;
    }

    if (
      allowPatientRecipientFallback &&
      phoneNumber &&
      !/\bfax\b|\bprovider\b|\bhospital\b|\bfacility\b|\bphysician\b|\bdoctor\b|\binsurance\b|\battorney\b|\bhealth care\b|\bhealthcare\b/i.test(
        normalized,
      ) &&
      matchesAny(normalized, [/\btelephone number\b/, /\bphone number\b/, /\bcontact number\b/])
    ) {
      filledCount += setTextFieldValue(field, phoneNumber) ? 1 : 0;
      continue;
    }

    if (
      allowPatientRecipientFallback &&
      email &&
      !/\bfax\b|\bprovider\b|\bhospital\b|\bfacility\b|\bphysician\b|\bdoctor\b|\binsurance\b|\battorney\b|\bhealth care\b|\bhealthcare\b/i.test(
        normalized,
      ) &&
      matchesAny(normalized, [/\bemail\b/, /\bemail address\b/])
    ) {
      filledCount += setTextFieldValue(field, email) ? 1 : 0;
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

    if (
      matchesExactFieldName(normalized, [
        'street',
        'street address city state zip',
      ])
    ) {
      const value = normalized === 'street address city state zip' ? fullMailingAddress : addressLine;
      filledCount += setTextFieldValue(field, value) ? 1 : 0;
      continue;
    }

    if (matchesAny(normalized, [/\bcity state\b/, /\bciudad y estado\b/])) {
      filledCount += setTextFieldValue(field, cityState) ? 1 : 0;
      continue;
    }

    if (matchesExactFieldName(normalized, ['city', 'patient city'])) {
      filledCount += setTextFieldValue(field, bioProfile.city.trim()) ? 1 : 0;
      continue;
    }

    if (matchesExactFieldName(normalized, ['state', 'patient state'])) {
      filledCount += setTextFieldValue(field, bioProfile.state.trim()) ? 1 : 0;
      continue;
    }

    if (matchesExactFieldName(normalized, ['city state zip'])) {
      filledCount += setTextFieldValue(field, cityStateZip) ? 1 : 0;
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

    if (matchesExactFieldName(normalized, ['relationship to patient'])) {
      filledCount += setTextFieldValue(field, 'Self') ? 1 : 0;
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
      continue;
    }

    if (matchesExactFieldName(normalized, ['date'])) {
      filledCount += setTextFieldValue(field, today) ? 1 : 0;
    }
  }

  return {
    fieldCount: fields.length,
    filledCount,
  };
}

function isSignatureField(field: PDFField) {
  return field instanceof PDFSignature || /\bsignature\b|\bfirma\b/i.test(normalizeFieldName(field.getName()));
}

function findWidgetPageIndex(pdf: PDFDocument, widget: ReturnType<PDFField['acroField']['getWidgets']>[number]) {
  const widgetPageRef = widget.P();

  if (widgetPageRef) {
    const matchingPageIndex = pdf.getPages().findIndex((page) => page.ref === widgetPageRef);
    if (matchingPageIndex >= 0) {
      return matchingPageIndex;
    }
  }

  return pdf.getPages().findIndex((page) => {
    const annotations = page.node.Annots();
    if (!annotations) return false;

    for (let annotationIndex = 0; annotationIndex < annotations.size(); annotationIndex += 1) {
      if (annotations.lookup(annotationIndex) === widget.dict) {
        return true;
      }
    }

    return false;
  });
}

function extractSignatureFields(pdf: PDFDocument): RecordsRequestPdfSignatureField[] {
  const form = pdf.getForm();
  const signatureFields: RecordsRequestPdfSignatureField[] = [];

  for (const field of form.getFields()) {
    if (!isSignatureField(field)) continue;

    for (const widget of field.acroField.getWidgets()) {
      const pageIndex = findWidgetPageIndex(pdf, widget);
      const rect = widget.getRectangle();

      if (pageIndex < 0 || rect.width <= 0 || rect.height <= 0) {
        continue;
      }

      signatureFields.push({
        fieldName: field.getName(),
        pageIndex,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    }
  }

  return signatureFields;
}

function applySignatureOverlays(
  pdf: PDFDocument,
  signatureFields: RecordsRequestPdfSignatureField[],
  signature: RecordsRequestUserSignature | null | undefined,
) {
  if (!hasSignatureStrokeInput(signature) || signatureFields.length === 0) {
    return 0;
  }

  const signatureBounds = getSignatureBounds(signature);
  const signaturePath = buildSignatureSvgPath(signature, { normalize: true });

  if (!signatureBounds || !signaturePath) {
    return 0;
  }

  let appliedCount = 0;

  for (const signatureField of signatureFields) {
    const page = pdf.getPage(signatureField.pageIndex);
    const padding = Math.min(signatureField.height * 0.18, signatureField.width * 0.08, 6);
    const availableWidth = Math.max(signatureField.width - padding * 2, 1);
    const availableHeight = Math.max(signatureField.height - padding * 2, 1);
    const scale = Math.min(
      availableWidth / signatureBounds.width,
      availableHeight / signatureBounds.height,
    );

    if (!Number.isFinite(scale) || scale <= 0) {
      continue;
    }

    const renderedWidth = signatureBounds.width * scale;
    const renderedHeight = signatureBounds.height * scale;
    const offsetX = signatureField.x + (signatureField.width - renderedWidth) / 2;
    const topPadding = (signatureField.height - renderedHeight) / 2;
    const offsetY = signatureField.y + signatureField.height - topPadding;

    page.drawSvgPath(signaturePath, {
      x: offsetX,
      y: offsetY,
      scale,
      borderColor: hexToPdfColor(pdfTheme.colors.text),
      borderWidth: 1.35,
      borderLineCap: LineCapStyle.Round,
    });

    appliedCount += 1;
  }

  return appliedCount;
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
  const signatureFields = extractSignatureFields(pdf);

  return {
    form,
    pdfBytes,
    fieldCount: pdf.getForm().getFields().length,
    flatTemplateId: flatTemplate?.id || null,
    signatureFields,
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
    signatureFields: prepared.signatureFields.map((signatureField) => ({ ...signatureField })),
  };
}

function orderPdfCandidates(forms: RecordsWorkflowForm[], preferredFormKey?: string | null) {
  return sortPdfForms(forms, { preferredFormKey });
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
    signatureFieldCount: prepared.signatureFields.length,
  };
}

export async function generateRecordsRequestPdf(input: GenerateRecordsRequestPdfInput) {
  const preparedTemplate = await chooseFillablePdfForm(input.packet, {
    preferredFormKey: input.selectedFormKey || null,
  });
  const selectedForm = preparedTemplate.form;
  const pdf = await PDFDocument.load(preparedTemplate.pdfBytes, { ignoreEncryption: true });
  const autofillAnswers = input.autofillAnswers || {};
  const signatureFields = preparedTemplate.signatureFields;
  const allowPatientRecipientFallback = shouldFillPatientRecipientFields(
    selectedForm,
    autofillAnswers,
  );

  let filledCount = 0;
  let usedAcroForm = false;

  if (preparedTemplate.fieldCount > 0) {
    const bioResult = fillBioFields(pdf, input.bioProfile, {
      allowPatientRecipientFallback,
    });
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
    answers: autofillAnswers,
  });
  filledCount += dynamicAnswerResult.appliedCount;
  usedAcroForm ||= dynamicAnswerResult.usedAcroForm;

  if (
    preparedTemplate.fieldCount > 0 &&
    (usedAcroForm || (signatureFields.length > 0 && hasSignatureStrokeInput(input.signature)))
  ) {
    const form = pdf.getForm();

    if (usedAcroForm) {
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      form.updateFieldAppearances(font);
    }

    form.flatten();
  }

  const signatureAppliedCount = applySignatureOverlays(pdf, signatureFields, input.signature);
  filledCount += signatureAppliedCount;

  if (filledCount === 0) {
    throw new Error(
      'The selected hospital PDF did not expose any matching bio fields, dynamic answer bindings, or signature placements to populate automatically.',
    );
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

export const __testing__ = {
  applySignatureOverlays,
  buildCurrentDateValue,
  extractSignatureFields,
  fillBioFields,
  getLanguagePreferenceScore,
  getPrimaryPdfForm,
  getSemanticFormScore,
  shouldFillPatientRecipientFields,
  sortPdfForms,
};
