import { API_BASE_URL } from '../../constants/api';
import type {
  HospitalSystemOption,
  RecordsRequestPacket,
  RecordsWorkflowAutofillBinding,
} from '../../types/recordsRequest';
import { normalizeHospitalSystemSearchQuery } from './search';

const WORKFLOW_API_HOST = (
  process.env.EXPO_PUBLIC_RECORDS_WORKFLOW_API_BASE_URL || API_BASE_URL
).replace(/\/+$/, '');
const WORKFLOW_API_PREFIX = '/api/records-workflow';

interface ApiHospitalSystem {
  id: string;
  system_name: string;
  canonical_domain: string | null;
  state: string;
}

interface ApiRecordsRequestPacket {
  hospital_system: {
    id: string;
    name: string;
    domain: string | null;
    state: string;
  };
  portal: {
    name: string | null;
    url: string | null;
    scope: string;
    supports_formal_copy_request_in_portal: boolean;
  };
  medical_workflow: {
    request_scope: string;
    formal_request_required: boolean;
    available_methods: string[];
  } | null;
  recommended_paths: {
    type: string;
    label: string;
    available: boolean;
    methods?: string[];
  }[];
  special_cases: {
    type: string;
    label: string;
  }[];
  contacts: {
    type: string;
    label: string | null;
    value: string;
  }[];
  forms: {
    name: string;
    url: string;
    format: string | null;
    cached_source_document_id: string | null;
    cached_content_url: string | null;
    autofill: {
      supported: boolean;
      mode: 'acroform' | 'overlay' | null;
      template_id: string | null;
      confidence?: number | null;
      signature_areas?: {
        id: string;
        label: string | null;
        field_name: string | null;
        page_index: number;
        x: number;
        y: number;
        width: number;
        height: number;
      }[];
      questions: {
        id: string;
        label: string;
        kind: 'single_select' | 'multi_select' | 'short_text';
        required: boolean;
        help_text: string | null;
        confidence: number;
        visibility_rule?: {
          parent_question_id: string;
          parent_option_ids: string[];
        } | null;
        previous_question_id?: string | null;
        next_question_id?: string | null;
        bindings: ApiAutofillBinding[];
        options: {
          id: string;
          label: string;
          confidence: number;
          bindings: ApiAutofillBinding[];
        }[];
      }[];
    };
  }[];
  instructions: {
    kind: string;
    sequence_no: number;
    label: string | null;
    channel: string | null;
    value: string | null;
    details: string;
  }[];
  requires_photo_id: boolean;
  sources: {
    url: string;
    last_verified_at: string | null;
  }[];
}

type ApiAutofillBinding =
  | {
      type: 'field_text';
      field_name: string;
    }
  | {
      type: 'field_checkbox';
      field_name: string;
      checked: boolean;
    }
  | {
      type: 'field_radio';
      field_name: string;
      value: string;
    }
  | {
      type: 'overlay_text';
      page_index: number;
      x: number;
      y: number;
      max_width: number | null;
      font_size: number | null;
    }
  | {
      type: 'overlay_mark';
      page_index: number;
      x: number;
      y: number;
      mark: 'x' | 'check';
      size: number | null;
    };

function buildWorkflowUrl(path: string): string {
  return `${WORKFLOW_API_HOST}${WORKFLOW_API_PREFIX}${path}`;
}

function buildNonJsonError(path: string, response: Response, bodyText: string): Error {
  const contentType = response.headers.get('content-type')?.trim() || 'unknown content type';
  const preview = bodyText.replace(/\s+/g, ' ').trim().slice(0, 120);
  const routeHint = `Check ${WORKFLOW_API_PREFIX} routing.`;

  if (response.ok) {
    return new Error(
      `Records workflow API returned ${contentType} for ${path} instead of JSON. ${routeHint}${
        preview ? ` Response started with: ${preview}` : ''
      }`,
    );
  }

  return new Error(
    `Records workflow API request failed with status ${response.status} and returned ${contentType} for ${path}. ${routeHint}${
      preview ? ` Response started with: ${preview}` : ''
    }`,
  );
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = init
    ? await fetch(buildWorkflowUrl(path), init)
    : await fetch(buildWorkflowUrl(path));
  const contentType = response.headers.get('content-type')?.toLowerCase() || '';

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (typeof data?.error === 'string' && data.error.trim().length > 0) {
        message = data.error;
      }
      throw new Error(message);
    }

    const bodyText = await response.text();
    throw buildNonJsonError(path, response, bodyText);
  }

  if (!contentType.includes('application/json')) {
    const bodyText = await response.text();
    throw buildNonJsonError(path, response, bodyText);
  }

  return (await response.json()) as T;
}

function mapHospitalSystem(system: ApiHospitalSystem): HospitalSystemOption {
  return {
    id: system.id,
    name: system.system_name,
    domain: system.canonical_domain,
    state: system.state,
  };
}

function mapAutofillBinding(binding: ApiAutofillBinding): RecordsWorkflowAutofillBinding {
  switch (binding.type) {
    case 'field_text':
      return {
        type: 'field_text',
        fieldName: binding.field_name,
      };
    case 'field_checkbox':
      return {
        type: 'field_checkbox',
        fieldName: binding.field_name,
        checked: binding.checked,
      };
    case 'field_radio':
      return {
        type: 'field_radio',
        fieldName: binding.field_name,
        value: binding.value,
      };
    case 'overlay_text':
      return {
        type: 'overlay_text',
        pageIndex: binding.page_index,
        x: binding.x,
        y: binding.y,
        maxWidth: binding.max_width,
        fontSize: binding.font_size,
      };
    case 'overlay_mark':
      return {
        type: 'overlay_mark',
        pageIndex: binding.page_index,
        x: binding.x,
        y: binding.y,
        mark: binding.mark,
        size: binding.size,
      };
  }
}

export async function fetchHospitalSystems(
  searchQuery = '',
  options?: { signal?: AbortSignal },
): Promise<HospitalSystemOption[]> {
  const trimmedQuery = normalizeHospitalSystemSearchQuery(searchQuery);
  const params = new URLSearchParams();
  if (trimmedQuery) {
    params.set('q', trimmedQuery);
  }

  const suffix = params.toString();
  const requestInit = options?.signal ? { signal: options.signal } : undefined;
  const data = await fetchJson<{ results: ApiHospitalSystem[] }>(
    `/hospital-systems${suffix ? `?${suffix}` : ''}`,
    requestInit,
  );
  return data.results.map(mapHospitalSystem);
}

export async function fetchRecordsRequestPacket(systemId: string): Promise<RecordsRequestPacket> {
  const params = new URLSearchParams({
    _ts: Date.now().toString(),
  });
  const data = await fetchJson<ApiRecordsRequestPacket>(
    `/hospital-systems/${encodeURIComponent(systemId)}/records-request-packet?${params.toString()}`,
  );

  return {
    hospitalSystem: {
      id: data.hospital_system.id,
      name: data.hospital_system.name,
      domain: data.hospital_system.domain,
      state: data.hospital_system.state,
    },
    portal: {
      name: data.portal.name,
      url: data.portal.url,
      scope: data.portal.scope,
      supportsFormalCopyRequestInPortal: data.portal.supports_formal_copy_request_in_portal,
    },
    medicalWorkflow: data.medical_workflow
      ? {
          requestScope: data.medical_workflow.request_scope,
          formalRequestRequired: data.medical_workflow.formal_request_required,
          availableMethods: data.medical_workflow.available_methods,
        }
      : null,
    recommendedPaths: data.recommended_paths,
    specialCases: data.special_cases,
    contacts: data.contacts,
    forms: data.forms.map((form) => ({
      name: form.name,
      url: form.url,
      format: form.format,
      cachedSourceDocumentId: form.cached_source_document_id,
      cachedContentUrl: form.cached_content_url
        ? `${WORKFLOW_API_HOST}${form.cached_content_url}`
        : null,
      autofill: {
        supported: Boolean(form.autofill?.supported),
        mode: form.autofill?.mode || null,
        templateId: form.autofill?.template_id || null,
        confidence:
          typeof form.autofill?.confidence === 'number' ? form.autofill.confidence : null,
        questions: (form.autofill?.questions || []).map((question) => ({
          id: question.id,
          label: question.label,
          kind: question.kind,
          required: question.required,
          helpText: question.help_text,
          confidence: question.confidence,
          visibilityRule: question.visibility_rule
            ? {
                parentQuestionId: question.visibility_rule.parent_question_id,
                parentOptionIds: question.visibility_rule.parent_option_ids,
              }
            : null,
          previousQuestionId: question.previous_question_id || null,
          nextQuestionId: question.next_question_id || null,
          bindings: question.bindings.map(mapAutofillBinding),
          options: question.options.map((option) => ({
            id: option.id,
            label: option.label,
            confidence: option.confidence,
            bindings: option.bindings.map(mapAutofillBinding),
            })),
        })),
        signatureAreas: (form.autofill?.signature_areas || []).map((area) => ({
          id: area.id,
          label: area.label || 'Signature Area',
          fieldName: area.field_name || null,
          pageIndex: area.page_index,
          x: area.x,
          y: area.y,
          width: area.width,
          height: area.height,
        })),
      },
    })),
    instructions: data.instructions.map((instruction) => ({
      kind: instruction.kind,
      sequenceNo: instruction.sequence_no,
      label: instruction.label,
      channel: instruction.channel,
      value: instruction.value,
      details: instruction.details,
    })),
    requiresPhotoId: data.requires_photo_id,
    sources: data.sources.map((source) => ({
      url: source.url,
      lastVerifiedAt: source.last_verified_at,
    })),
  };
}
