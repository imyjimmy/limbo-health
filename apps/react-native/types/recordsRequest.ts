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
