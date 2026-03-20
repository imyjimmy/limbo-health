import {
  StandardFonts,
  rgb as pdfRgb,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type { BioProfile } from '../../types/bio';
import type {
  RecordsRequestPacket,
  RecordsWorkflowForm,
} from '../../types/recordsRequest';

export interface FlatPdfTemplateContext {
  packet: RecordsRequestPacket;
  form: RecordsWorkflowForm;
  pdf: PDFDocument;
}

export interface FlatPdfTemplate {
  id: string;
  label: string;
  matches: (context: FlatPdfTemplateContext) => boolean;
  apply: (context: FlatPdfTemplateContext & { bioProfile: BioProfile }) => Promise<number>;
}

function normalizeMatchValue(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function formatSingleLineAddress(bioProfile: BioProfile): string {
  return [
    bioProfile.addressLine1.trim(),
    bioProfile.addressLine2.trim(),
    [bioProfile.city.trim(), bioProfile.state.trim(), bioProfile.postalCode.trim()]
      .filter(Boolean)
      .join(' '),
  ]
    .filter(Boolean)
    .join(', ');
}

function topToBottomY(page: PDFPage, top: number, fontSize: number) {
  return page.getHeight() - top - fontSize;
}

function fitTextSize({
  text,
  baseSize,
  minSize,
  maxWidth,
  measure,
}: {
  text: string;
  baseSize: number;
  minSize: number;
  maxWidth: number;
  measure: (size: number) => number;
}) {
  let size = baseSize;

  while (size > minSize && measure(size) > maxWidth) {
    size -= 0.5;
  }

  return size;
}

async function drawFittedText({
  page,
  font,
  text,
  x,
  top,
  baseSize,
  minSize,
  maxWidth,
}: {
  page: PDFPage;
  font: PDFFont;
  text: string;
  x: number;
  top: number;
  baseSize: number;
  minSize: number;
  maxWidth: number;
}) {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const size = fitTextSize({
    text: trimmed,
    baseSize,
    minSize,
    maxWidth,
    measure: (candidateSize) => font.widthOfTextAtSize(trimmed, candidateSize),
  });

  page.drawText(trimmed, {
    x,
    y: topToBottomY(page, top, size),
    size,
    maxWidth,
    font,
    color: pdfRgb(0, 0, 0),
  });

  return true;
}

const multicareAuthorizationTemplate: FlatPdfTemplate = {
  id: 'multicare-release-phi-87-8455-5e-a',
  label: 'MultiCare authorization release form',
  matches: ({ packet, form, pdf }) => {
    const systemName = normalizeMatchValue(packet.hospitalSystem.name);
    const domain = normalizeMatchValue(packet.hospitalSystem.domain);
    const formUrl = normalizeMatchValue(form.url);
    const formName = normalizeMatchValue(form.name);
    const pages = pdf.getPages();

    return (
      (systemName.includes('multicare') || domain.includes('multicare org')) &&
      (formUrl.includes('87 8455 5e a') ||
        formUrl.includes('release phi') ||
        formName.includes('authorization to release health care information')) &&
      pages.length >= 1 &&
      Math.round(pages[0].getWidth()) === 612 &&
      Math.round(pages[0].getHeight()) === 792
    );
  },
  apply: async ({ pdf, bioProfile }) => {
    const [page] = pdf.getPages();
    if (!page) return 0;
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    const drewName = await drawFittedText({
      page,
      font,
      text: bioProfile.fullName,
      x: 166,
      top: 49,
      baseSize: 11,
      minSize: 9,
      maxWidth: 260,
    });

    const drewDateOfBirth = await drawFittedText({
      page,
      font,
      text: bioProfile.dateOfBirth,
      x: 496,
      top: 49,
      baseSize: 11,
      minSize: 9,
      maxWidth: 82,
    });

    const drewAddress = await drawFittedText({
      page,
      font,
      text: formatSingleLineAddress(bioProfile),
      x: 71,
      top: 66,
      baseSize: 10,
      minSize: 7,
      maxWidth: 340,
    });

    return [drewName, drewDateOfBirth, drewAddress].filter(Boolean).length;
  },
};

const flatPdfTemplates: FlatPdfTemplate[] = [multicareAuthorizationTemplate];

export function findFlatPdfTemplate(context: FlatPdfTemplateContext): FlatPdfTemplate | null {
  return flatPdfTemplates.find((template) => template.matches(context)) || null;
}

export function getFlatPdfTemplateSupportMessage(formName: string) {
  return `The available hospital PDF (${formName}) is cached, but it is a flat form without fillable fields or a matching overlay template yet.`;
}
