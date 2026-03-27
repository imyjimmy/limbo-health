export interface HospitalSystemOption {
  id: string;
  name: string;
  domain: string | null;
  state: string;
}

export interface RecordsWorkflowContact {
  type: string;
  label: string | null;
  value: string;
}

export interface RecordsWorkflowForm {
  name: string;
  url: string;
  format: string | null;
  cachedSourceDocumentId: string | null;
  cachedContentUrl: string | null;
  autofill: RecordsWorkflowFormAutofill;
}

export type RecordsWorkflowAutofillMode = 'acroform' | 'overlay';

export type RecordsWorkflowAutofillBinding =
  | {
      type: 'field_text';
      fieldName: string;
    }
  | {
      type: 'field_checkbox';
      fieldName: string;
      checked: boolean;
    }
  | {
      type: 'field_radio';
      fieldName: string;
      value: string;
    }
  | {
      type: 'overlay_text';
      pageIndex: number;
      x: number;
      y: number;
      maxWidth: number | null;
      fontSize: number | null;
    }
  | {
      type: 'overlay_mark';
      pageIndex: number;
      x: number;
      y: number;
      mark: 'x' | 'check';
      size: number | null;
    };

export interface RecordsWorkflowAutofillOption {
  id: string;
  label: string;
  confidence: number;
  bindings: RecordsWorkflowAutofillBinding[];
}

export interface RecordsWorkflowAutofillVisibilityRule {
  parentQuestionId: string;
  parentOptionIds: string[];
}

export interface RecordsWorkflowAutofillQuestion {
  id: string;
  label: string;
  kind: 'single_select' | 'multi_select' | 'short_text';
  required: boolean;
  helpText: string | null;
  confidence: number;
  bindings: RecordsWorkflowAutofillBinding[];
  options: RecordsWorkflowAutofillOption[];
  visibilityRule?: RecordsWorkflowAutofillVisibilityRule | null;
  previousQuestionId?: string | null;
  nextQuestionId?: string | null;
}

export interface RecordsWorkflowSignatureArea {
  id: string;
  label: string;
  fieldName: string | null;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecordsWorkflowFormAutofill {
  supported: boolean;
  mode: RecordsWorkflowAutofillMode | null;
  templateId: string | null;
  confidence: number | null;
  questions: RecordsWorkflowAutofillQuestion[];
  signatureAreas: RecordsWorkflowSignatureArea[];
}

export interface RecordsWorkflowInstruction {
  kind: string;
  sequenceNo: number;
  label: string | null;
  channel: string | null;
  value: string | null;
  details: string;
}

export interface RecordsWorkflowSource {
  url: string;
  lastVerifiedAt: string | null;
}

export interface RecordsRequestIdAttachment {
  uri: string;
  base64Data: string;
  mimeType: string;
  source: 'camera' | 'library';
}

export interface RecordsRequestSignaturePoint {
  x: number;
  y: number;
}

export interface RecordsRequestSignatureStroke {
  points: RecordsRequestSignaturePoint[];
}

export interface RecordsRequestUserSignature {
  width: number;
  height: number;
  strokes: RecordsRequestSignatureStroke[];
}

export interface RecordsRequestPacket {
  hospitalSystem: HospitalSystemOption;
  portal: {
    name: string | null;
    url: string | null;
    scope: string;
    supportsFormalCopyRequestInPortal: boolean;
  };
  medicalWorkflow: {
    requestScope: string;
    formalRequestRequired: boolean;
    availableMethods: string[];
  } | null;
  recommendedPaths: {
    type: string;
    label: string;
    available: boolean;
    methods?: string[];
  }[];
  specialCases: {
    type: string;
    label: string;
  }[];
  contacts: RecordsWorkflowContact[];
  forms: RecordsWorkflowForm[];
  instructions: RecordsWorkflowInstruction[];
  requiresPhotoId: boolean;
  sources: RecordsWorkflowSource[];
}
