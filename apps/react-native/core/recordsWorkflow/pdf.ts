import RNFS from 'react-native-fs';
import {
  PDFDocument,
  PDFTextField,
  StandardFonts,
  rgb as pdfRgb,
  type PDFField,
} from 'pdf-lib';
import { decode as decodeBase64, encode as encodeBase64 } from '../crypto/base64';
import { ACTIVE_THEME_NAME, resolveTheme } from '../../theme';
import type { BioProfile } from '../../types/bio';
import type {
  RecordsRequestIdAttachment,
  RecordsRequestPacket,
  RecordsWorkflowForm,
} from '../../types/recordsRequest';

interface GenerateRecordsRequestPdfInput {
  bioProfile: BioProfile;
  packet: RecordsRequestPacket;
  idAttachment: RecordsRequestIdAttachment | null;
}

const pdfTheme = resolveTheme(ACTIVE_THEME_NAME, 'light');

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
    form,
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

async function loadFormCandidate(form: RecordsWorkflowForm) {
  const downloadUrl = form.cachedContentUrl || form.url;
  const response = await fetch(downloadUrl);

  if (!response.ok) {
    throw new Error(`Unable to download ${form.name}.`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });

  return { form, pdf };
}

async function chooseFillablePdfForm(forms: RecordsWorkflowForm[]) {
  const candidates = sortPdfForms(forms);
  if (candidates.length === 0) {
    throw new Error('No PDF request form is available for this hospital system yet.');
  }

  let flatFormDetected = false;
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const loaded = await loadFormCandidate(candidate);
      const fieldCount = loaded.pdf.getForm().getFields().length;

      if (fieldCount > 0) {
        return loaded;
      }

      flatFormDetected = true;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unable to load PDF form.');
    }
  }

  if (flatFormDetected) {
    throw new Error(
      'The available hospital PDF is cached, but it is a flat form without fillable fields. It needs template coordinates before we can auto-fill it.',
    );
  }

  throw lastError || new Error('Unable to load a fillable hospital PDF form.');
}

export async function generateRecordsRequestPdf(input: GenerateRecordsRequestPdfInput) {
  const { form: selectedForm, pdf } = await chooseFillablePdfForm(input.packet.forms);
  const { form, fieldCount, filledCount } = fillBioFields(pdf, input.bioProfile);

  if (fieldCount === 0 || filledCount === 0) {
    throw new Error(
      'The selected hospital PDF did not expose any matching bio fields to populate automatically.',
    );
  }

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  form.updateFieldAppearances(font);

  if (input.idAttachment) {
    await appendIdPage(pdf, input.idAttachment);
  }

  form.flatten();

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
    usedCachedTemplate: Boolean(selectedForm.cachedContentUrl),
  };
}
