import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';
import { IconPencil, IconSignature, IconUser } from '@tabler/icons-react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import {
  HospitalSystemLogo,
  hasHospitalSystemLogo,
} from '../components/records/HospitalSystemLogo';
import { SignaturePad } from '../components/records/SignaturePad';
import { TexasHospitalLogoMarquee } from '../components/records/TexasHospitalLogoMarquee';
import { fetchHospitalSystems, fetchRecordsRequestPacket } from '../core/recordsWorkflow/api';
import {
  buildRecordsRequestWorkflowSteps,
  filterQuestionsForQuestionFlow,
  formatDateAutofillAnswerInput,
  getNextAutofillQuestionId,
  getPreviousAutofillQuestionId,
  getRecordsRequestQuestionStepId,
  getVisibleAutofillQuestions,
  isDateAutofillQuestion,
  validateAutofillAnswers,
  type RecordsWorkflowAutofillAnswers,
  type RecordsRequestWorkflowStep,
} from '../core/recordsWorkflow/autofill';
import { hasSignatureStrokeInput } from '../core/recordsWorkflow/signature';
import {
  generateRecordsRequestPdf,
  getPrimaryPdfForm,
  isPdfBackedWorkflowForm,
  prefetchRecordsRequestPdfTemplate,
} from '../core/recordsWorkflow/pdf';
import {
  HOSPITAL_SYSTEM_SEARCH_DEBOUNCE_MS,
  normalizeHospitalSystemSearchQuery,
} from '../core/recordsWorkflow/search';
import { useBioProfile } from '../providers/BioProfileProvider';
import { createThemedStyles, useTheme, useThemedStyles } from '../theme';
import type {
  HospitalSystemOption,
  RecordsRequestIdAttachment,
  RecordsRequestPacket,
  RecordsRequestUserSignature,
  RecordsWorkflowForm,
} from '../types/recordsRequest';

type RecordsRequestInstruction = RecordsRequestPacket['instructions'][number];
type RecordsRequestContact = RecordsRequestPacket['contacts'][number];

const RECORDS_REQUEST_LAUNCH_STATE_CODE = 'TX';
const RECORDS_REQUEST_LAUNCH_STATE_NAME = 'Texas';
const EMAIL_ADDRESS_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function buildFormKey(form: RecordsWorkflowForm): string {
  return form.cachedContentUrl || form.url;
}

function normalizeInlineText(value: string | null | undefined): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getInstructionText(instruction: RecordsRequestInstruction | null): string {
  if (!instruction) return '';

  return normalizeInlineText(
    [instruction.value, instruction.details]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join(' '),
  );
}

function looksLikeSubmissionDestination(
  channel: 'email' | 'fax' | 'mail',
  instruction: RecordsRequestInstruction,
): boolean {
  const explicitValue = normalizeInlineText(instruction.value);
  const details = normalizeInlineText(instruction.details);
  const haystack = `${explicitValue} ${details}`.trim();

  if (!haystack) return false;

  switch (channel) {
    case 'email':
      return EMAIL_ADDRESS_PATTERN.test(haystack);
    case 'fax':
      return /\bfax\b/i.test(details) || /(?:\+?[\dA-Z][\dA-Z().\-\s]{6,})/.test(explicitValue);
    case 'mail':
      return /\bc\/o\b|p\.?o\.?\s*box\b|\d{1,6}\s+[A-Za-z0-9.#-]/i.test(haystack);
  }
}

function getSubmissionInstruction(
  instructions: RecordsRequestInstruction[],
  channel: 'email' | 'fax' | 'mail',
): RecordsRequestInstruction | null {
  return (
    instructions.find(
      (instruction) =>
        instruction.kind === 'submission_channel' &&
        instruction.channel === channel &&
        looksLikeSubmissionDestination(channel, instruction),
    ) ||
    instructions.find(
      (instruction) =>
        instruction.channel === channel &&
        looksLikeSubmissionDestination(channel, instruction),
    ) ||
    instructions.find(
      (instruction) =>
        instruction.kind === 'submission_channel' &&
        instruction.channel === channel &&
        Boolean(normalizeInlineText(instruction.value) || normalizeInlineText(instruction.details)),
    ) ||
    instructions.find(
      (instruction) =>
        instruction.channel === channel &&
        Boolean(normalizeInlineText(instruction.value) || normalizeInlineText(instruction.details)),
    ) ||
    null
  );
}

function getSubmissionInstructionValue(instruction: RecordsRequestInstruction | null): string {
  if (!instruction) return '';

  const explicitValue = instruction.value?.trim();
  if (explicitValue) {
    return explicitValue;
  }

  return instruction.details.replace(/^submit by (email|fax|mail):\s*/i, '').trim();
}

function extractEmailAddress(instruction: RecordsRequestInstruction | null): string | null {
  const match = getSubmissionInstructionValue(instruction).match(EMAIL_ADDRESS_PATTERN);

  return match?.[0] || null;
}

function getSupportInstruction(
  instructions: RecordsRequestInstruction[],
): RecordsRequestInstruction | null {
  return (
    instructions.find(
      (instruction) =>
        instruction.kind === 'support_contact' &&
        /questions|status|call us/i.test(getInstructionText(instruction)),
    ) ||
    instructions.find(
      (instruction) =>
        instruction.channel === 'phone' &&
        /questions|status|call us/i.test(getInstructionText(instruction)),
    ) ||
    null
  );
}

function getSupportInstructionValue(instruction: RecordsRequestInstruction | null): string {
  if (!instruction) return '';

  const explicitValue = normalizeInlineText(instruction.value);
  if (explicitValue) {
    return explicitValue;
  }

  return normalizeInlineText(instruction.details).replace(/^.*call us at\s*/i, '').trim();
}

function getPrimaryContactValue(
  contacts: RecordsRequestContact[],
  type: string,
  preferredPatterns: RegExp[] = [],
): string | null {
  const values = contacts
    .filter((contact) => contact.type === type)
    .map((contact) => normalizeInlineText(contact.value))
    .filter(Boolean);

  for (const pattern of preferredPatterns) {
    const matched = values.find((value) => pattern.test(value));
    if (matched) {
      return matched;
    }
  }

  return values[0] || null;
}

function formatMailingAddress(value: string | null): string | null {
  if (!value) return null;

  return normalizeInlineText(value)
    .replace(/\s+(?=c\/o\b)/i, '\n')
    .replace(/\s+(?=\d{1,6}\s+[A-Za-z0-9.#-])/, '\n')
    .replace(/\s+(?=[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b)/, '\n');
}

function formatPhoneDisplay(value: string | null): string | null {
  if (!value) return null;

  const trimmed = normalizeInlineText(value);
  if (!trimmed) return null;
  if (/[A-Za-z]/.test(trimmed) || /[().-]/.test(trimmed)) {
    return trimmed;
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  const normalizedDigits =
    digitsOnly.length === 11 && digitsOnly.startsWith('1') ? digitsOnly.slice(1) : digitsOnly;

  if (normalizedDigits.length !== 10) {
    return trimmed;
  }

  return `(${normalizedDigits.slice(0, 3)}) ${normalizedDigits.slice(3, 6)}-${normalizedDigits.slice(6)}`;
}

function getWorkflowStepTitle(step: RecordsRequestWorkflowStep): string {
  switch (step.kind) {
    case 'bio':
      return 'Build your request packet';
    case 'hospital':
      return 'Choose the hospital system';
    case 'question':
      return step.question.label;
    case 'id':
      return 'Add identification';
    case 'signature':
      return 'Add your signature';
    case 'submit':
      return 'Fill out the selected form';
  }
}

function getWorkflowStepDescription(
  step: RecordsRequestWorkflowStep,
): string {
  switch (step.kind) {
    case 'bio':
      return "We'll prefill what we can, collect anything missing, and prepare a PDF you can review or share.";
    case 'hospital':
      return `Search the ${RECORDS_REQUEST_LAUNCH_STATE_NAME} hospital system you want to request records from.`;
    case 'question':
      return step.question.helpText || '';
    case 'id':
      return 'Attach a photo ID when the workflow requires it, or add one optionally if you want it bundled into the packet.';
    case 'signature':
      return 'Draw the signature you want printed onto the selected form.';
    case 'submit':
      return 'Review the packet, create the completed PDF, and share it when you are ready.';
  }
}

export default function RecordsRequestScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<{
    systemId?: string;
    advanceTo?: string;
  }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { status: bioStatus, profile, hasProfile } = useBioProfile();
  const [currentStepId, setCurrentStepId] = useState('bio');
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedSearchQuery = normalizeHospitalSystemSearchQuery(searchQuery);
  const deferredSearchQuery = useDeferredValue(normalizedSearchQuery);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(deferredSearchQuery);
  const [systems, setSystems] = useState<HospitalSystemOption[]>([]);
  const [systemsLoading, setSystemsLoading] = useState(true);
  const [systemsError, setSystemsError] = useState<string | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<HospitalSystemOption | null>(null);
  const [packet, setPacket] = useState<RecordsRequestPacket | null>(null);
  const [packetLoading, setPacketLoading] = useState(false);
  const [packetError, setPacketError] = useState<string | null>(null);
  const [idAttachment, setIdAttachment] = useState<RecordsRequestIdAttachment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generatedPdfUri, setGeneratedPdfUri] = useState<string | null>(null);
  const [templatePrefetchState, setTemplatePrefetchState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [selectedFormKey, setSelectedFormKey] = useState<string | null>(null);
  const [prefetchedFormName, setPrefetchedFormName] = useState<string | null>(null);
  const [templatePrefetchError, setTemplatePrefetchError] = useState<string | null>(null);
  const [signatureFieldCount, setSignatureFieldCount] = useState(0);
  const [autofillAnswers, setAutofillAnswers] = useState<RecordsWorkflowAutofillAnswers>({});
  const [signature, setSignature] = useState<RecordsRequestUserSignature | null>(null);
  const [signaturePadActive, setSignaturePadActive] = useState(false);
  const [pdfPreviewFailed, setPdfPreviewFailed] = useState(false);
  const packetLoadRequestIdRef = useRef(0);
  const autoLoadedSystemIdRef = useRef<string | null>(null);
  const autoAdvancedWorkflowKeyRef = useRef<string | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const autofillAnswersRef = useRef<RecordsWorkflowAutofillAnswers>({});
  const requestedSystemId =
    typeof routeParams.systemId === 'string' ? routeParams.systemId.trim() : '';
  const requestedAdvanceTo =
    typeof routeParams.advanceTo === 'string' ? routeParams.advanceTo.trim().toLowerCase() : '';

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(deferredSearchQuery);
    }, HOSPITAL_SYSTEM_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [deferredSearchQuery]);

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    async function loadSystems() {
      if (!debouncedSearchQuery) {
        setSystems([]);
        setSystemsError(null);
        setSystemsLoading(false);
        return;
      }

      setSystemsLoading(true);
      setSystemsError(null);

      try {
        const results = await fetchHospitalSystems(debouncedSearchQuery, {
          signal: abortController.signal,
          stateCode: RECORDS_REQUEST_LAUNCH_STATE_CODE,
        });
        if (!cancelled) {
          setSystems(
            [...results].sort((left, right) => {
              const leftHasLogo = hasHospitalSystemLogo(left.name, left.domain);
              const rightHasLogo = hasHospitalSystemLogo(right.name, right.domain);

              if (leftHasLogo !== rightHasLogo) {
                return leftHasLogo ? -1 : 1;
              }

              return left.name.localeCompare(right.name);
            }),
          );
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        if (!cancelled) {
          setSystemsError(
            error instanceof Error ? error.message : 'Unable to load hospital systems right now.',
          );
        }
      } finally {
        if (!cancelled) {
          setSystemsLoading(false);
        }
      }
    }

    loadSystems();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [debouncedSearchQuery]);

  useEffect(() => {
    if (!packet || !packet.forms.some(isPdfBackedWorkflowForm)) {
      setTemplatePrefetchState('idle');
      setSelectedFormKey(null);
      setPrefetchedFormName(null);
      setTemplatePrefetchError(null);
      setSignatureFieldCount(0);
      return;
    }

    let cancelled = false;
    setTemplatePrefetchState('loading');
    setSelectedFormKey(null);
    setPrefetchedFormName(null);
    setTemplatePrefetchError(null);
    setSignatureFieldCount(0);

    prefetchRecordsRequestPdfTemplate(packet)
      .then((result) => {
        if (cancelled) return;
        setTemplatePrefetchState('ready');
        setSelectedFormKey(result.formKey);
        setPrefetchedFormName(result.formName);
        setSignatureFieldCount(result.signatureFieldCount);
      })
      .catch((error) => {
        if (cancelled) return;
        setTemplatePrefetchState('error');
        setTemplatePrefetchError(
          error instanceof Error ? error.message : 'Unable to cache the hospital PDF yet.',
        );
        setSignatureFieldCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [packet]);

  useEffect(() => {
    setAutofillAnswers({});
  }, [selectedFormKey]);

  useEffect(() => {
    setSignature(null);
  }, [selectedFormKey]);

  useEffect(() => {
    autofillAnswersRef.current = autofillAnswers;
  }, [autofillAnswers]);

  useEffect(() => {
    if (currentStepId !== 'signature') {
      setSignaturePadActive(false);
    }
  }, [currentStepId]);

  useEffect(() => {
    setPdfPreviewFailed(false);
  }, [generatedPdfUri]);

  const hasPdfForm = Boolean(packet?.forms.some(isPdfBackedWorkflowForm));
  const selectedPdfForm =
    packet?.forms.find(
      (form) => isPdfBackedWorkflowForm(form) && selectedFormKey && buildFormKey(form) === selectedFormKey,
    ) || null;
  const primaryDisplayForm = packet
    ? selectedPdfForm ||
      getPrimaryPdfForm(packet.forms, {
        preferredFormKey: selectedFormKey,
      })
    : null;
  const activeAutofillForm = selectedPdfForm || primaryDisplayForm;
  const allDynamicQuestions =
    activeAutofillForm?.autofill.supported && activeAutofillForm.autofill.questions.length > 0
      ? filterQuestionsForQuestionFlow(activeAutofillForm.autofill.questions, {
          cachedFacilityName: activeAutofillForm.cachedFacilityName,
        })
      : [];
  const dynamicQuestions = getVisibleAutofillQuestions(allDynamicQuestions, autofillAnswers);
  const hasSignatureStep = signatureFieldCount > 0;
  const workflowSteps = buildRecordsRequestWorkflowSteps(dynamicQuestions, {
    includeSignatureStep: hasSignatureStep,
  });
  const rawCurrentStepIndex = workflowSteps.findIndex((step) => step.id === currentStepId);
  const currentStepIndex = rawCurrentStepIndex >= 0 ? rawCurrentStepIndex : 0;
  const currentWorkflowStep = workflowSteps[currentStepIndex];
  const firstWorkflowStepId = workflowSteps[0]?.id || 'bio';
  const firstQuestionStepId = dynamicQuestions[0]
    ? getRecordsRequestQuestionStepId(dynamicQuestions[0].id)
    : null;
  const currentQuestionStep = currentWorkflowStep.kind === 'question' ? currentWorkflowStep : null;
  const currentQuestion = currentQuestionStep?.question || null;
  const currentQuestionAnswer = currentQuestion ? autofillAnswers[currentQuestion.id] : undefined;
  const packetReadyForContinue = Boolean(
    selectedSystem &&
      packet &&
      !packetLoading &&
      !packetError &&
      (!hasPdfForm || templatePrefetchState !== 'loading'),
  );
  const idStepCanContinue = Boolean(packet && (!packet.requiresPhotoId || idAttachment));
  const signatureStepCanContinue = hasSignatureStrokeInput(signature);
  const canGeneratePdf = hasPdfForm && templatePrefetchState !== 'loading';
  const formFillButtonLabel =
    dynamicQuestions.length > 0 || hasSignatureStep ? 'Fill Out Form' : 'Apply Bio To PDF';
  const hospitalContinueButtonLabel = !selectedSystem
    ? 'Select a hospital system'
    : packetLoading || templatePrefetchState === 'loading'
      ? 'Preparing form...'
      : dynamicQuestions.length > 0
        ? 'Continue to questions'
        : 'Continue to ID';
  const emailInstruction = packet ? getSubmissionInstruction(packet.instructions, 'email') : null;
  const faxInstruction = packet ? getSubmissionInstruction(packet.instructions, 'fax') : null;
  const mailInstruction = packet ? getSubmissionInstruction(packet.instructions, 'mail') : null;
  const supportInstruction = packet ? getSupportInstruction(packet.instructions) : null;
  const emailDestination = extractEmailAddress(emailInstruction);
  const packetEmailDestination =
    emailDestination ||
    (packet ? getPrimaryContactValue(packet.contacts, 'email', [/healthmark-group\.com/i]) : null) ||
    null;
  const packetFaxDestination =
    normalizeInlineText(getSubmissionInstructionValue(faxInstruction)) || null;
  const packetMailDestination =
    formatMailingAddress(getSubmissionInstructionValue(mailInstruction)) ||
    (packet
      ? formatMailingAddress(
          getPrimaryContactValue(packet.contacts, 'mailing_address', [
            /\bc\/o healthmark group\b/i,
            /westgrove/i,
          ]),
        )
      : null);
  const packetSupportPhone =
    formatPhoneDisplay(getSupportInstructionValue(supportInstruction)) ||
    (packet
      ? formatPhoneDisplay(
          getPrimaryContactValue(packet.contacts, 'phone', [/8448482794/, /844\.848\.BSWH/i]),
        )
      : null);
  const displayedEmailDestination =
    packetEmailDestination || normalizeInlineText(getSubmissionInstructionValue(emailInstruction)) || null;
  const displayedFaxDestination =
    packetFaxDestination || normalizeInlineText(getSubmissionInstructionValue(faxInstruction)) || null;
  const displayedMailDestination = packetMailDestination;
  const displayedSupportPhone = packetSupportPhone;
  const hasDeliveryInstructions = Boolean(
    displayedEmailDestination ||
      displayedFaxDestination ||
      displayedMailDestination ||
      displayedSupportPhone,
  );
  const isGeneratedSubmitStep = currentWorkflowStep.kind === 'submit' && Boolean(generatedPdfUri);
  const currentStepTitle =
    isGeneratedSubmitStep
      ? ''
      : currentWorkflowStep.kind === 'hospital' && selectedSystem
        ? selectedSystem.name
        : getWorkflowStepTitle(currentWorkflowStep);
  const currentStepDescription =
    currentWorkflowStep.kind === 'submit'
      ? isGeneratedSubmitStep
        ? ''
        : 'Generate the completed PDF, then send it exactly the way this hospital asks.'
      : currentWorkflowStep.kind === 'hospital' && selectedSystem
        ? ''
        : getWorkflowStepDescription(currentWorkflowStep);
  const currentQuestionIsDate = currentQuestion ? isDateAutofillQuestion(currentQuestion) : false;
  const nextWorkflowStep = workflowSteps[currentStepIndex + 1] || null;
  const compactHospitalSummary = packet
    ? dynamicQuestions.length > 0
      ? `${dynamicQuestions.length} question${dynamicQuestions.length === 1 ? '' : 's'}`
      : hasPdfForm
        ? 'No extra questions'
        : 'No fillable PDF yet'
    : null;
  const compactHospitalDetail = signatureFieldCount > 0 ? 'Signature later' : null;
  const compactHospitalStatus = [compactHospitalSummary, compactHospitalDetail]
    .filter(Boolean)
    .join(' • ');
  const useCompactProgressCard =
    (currentWorkflowStep.kind === 'hospital' && Boolean(selectedSystem)) || isGeneratedSubmitStep;
  const showHospitalDiscoveryMarquee = normalizedSearchQuery.length === 0;

  const generatePdf = async () => {
    if (!packet || !profile) return false;

    setSubmitting(true);
    try {
      const result = await generateRecordsRequestPdf({
        bioProfile: profile,
        packet,
        idAttachment,
        selectedFormKey,
        autofillAnswers,
        signature,
      });

      setGeneratedPdfUri(result.uri);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate the PDF.';
      Alert.alert('Generation Failed', message);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!requestedSystemId || !hasProfile || !profile) return;
    if (autoLoadedSystemIdRef.current === requestedSystemId) return;

    autoLoadedSystemIdRef.current = requestedSystemId;
    const requestId = packetLoadRequestIdRef.current + 1;
    packetLoadRequestIdRef.current = requestId;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCurrentStepId('hospital');
    setSearchQuery('');
    setSelectedSystem(null);
    setPacket(null);
    setPacketError(null);
    setGeneratedPdfUri(null);
    setPacketLoading(true);
    setSelectedFormKey(null);
    setTemplatePrefetchState('idle');
    setPrefetchedFormName(null);
    setTemplatePrefetchError(null);
    setSignatureFieldCount(0);
    setAutofillAnswers({});
    setSignature(null);

    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });

    async function loadRequestedSystem() {
      try {
        const nextPacket = await fetchRecordsRequestPacket(requestedSystemId);
        if (packetLoadRequestIdRef.current !== requestId) return;
        setSelectedSystem(nextPacket.hospitalSystem);
        setPacket(nextPacket);
      } catch (error) {
        if (packetLoadRequestIdRef.current !== requestId) return;
        autoLoadedSystemIdRef.current = null;
        const message =
          error instanceof Error ? error.message : 'Unable to load that hospital workflow.';
        setPacketError(message);
        Alert.alert('Workflow Unavailable', message);
      } finally {
        if (packetLoadRequestIdRef.current !== requestId) return;
        setPacketLoading(false);
      }
    }

    loadRequestedSystem();
  }, [hasProfile, profile, requestedSystemId]);

  useEffect(() => {
    if (rawCurrentStepIndex !== -1) return;

    const fallbackStepId = currentStepId.startsWith('question:')
      ? firstQuestionStepId || 'id'
      : firstWorkflowStepId;

    startTransition(() => {
      setCurrentStepId(fallbackStepId);
    });
  }, [currentStepId, firstQuestionStepId, firstWorkflowStepId, rawCurrentStepIndex]);

  useEffect(() => {
    if (requestedAdvanceTo !== 'questions' || !requestedSystemId) return;
    if (!packetReadyForContinue) return;

    const autoAdvanceKey = `${requestedSystemId}:questions`;
    if (autoAdvancedWorkflowKeyRef.current === autoAdvanceKey) return;
    autoAdvancedWorkflowKeyRef.current = autoAdvanceKey;

    startTransition(() => {
      setCurrentStepId(firstQuestionStepId || 'id');
    });
  }, [firstQuestionStepId, packetReadyForContinue, requestedAdvanceTo, requestedSystemId]);

  useEffect(() => {
    if (currentStepId.startsWith('question:') && dynamicQuestions.length === 0) {
      startTransition(() => {
        setCurrentStepId('id');
      });
    }
  }, [currentStepId, dynamicQuestions.length]);

  useEffect(() => {
    if (allDynamicQuestions.length === 0) return;

    const visibleQuestionIds = new Set(dynamicQuestions.map((question) => question.id));
    const allQuestionIds = new Set(allDynamicQuestions.map((question) => question.id));

    setAutofillAnswers((currentAnswers) => {
      let changed = false;
      const nextAnswers: RecordsWorkflowAutofillAnswers = { ...currentAnswers };

      for (const questionId of allQuestionIds) {
        if (visibleQuestionIds.has(questionId)) continue;
        if (!(questionId in nextAnswers)) continue;
        delete nextAnswers[questionId];
        changed = true;
      }

      return changed ? nextAnswers : currentAnswers;
    });
  }, [allDynamicQuestions, dynamicQuestions]);

  if (bioStatus === 'loading') {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={theme.colors.secondary} />
      </View>
    );
  }

  if (!hasProfile || !profile) {
    return (
      <Redirect
        href={{ pathname: '/(tabs)/profile/medical-info', params: { returnTo: '/records-request' } }}
        withAnchor
      />
    );
  }

  const handleSelectSystem = async (system: HospitalSystemOption) => {
    const requestId = packetLoadRequestIdRef.current + 1;
    packetLoadRequestIdRef.current = requestId;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedSystem(system);
    setPacket(null);
    setPacketError(null);
    setGeneratedPdfUri(null);
    setTemplatePrefetchState('idle');
    setPrefetchedFormName(null);
    setTemplatePrefetchError(null);
    setSignatureFieldCount(0);
    setSignature(null);
    setPacketLoading(true);
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });

    try {
      const nextPacket = await fetchRecordsRequestPacket(system.id);
      if (packetLoadRequestIdRef.current !== requestId) return;
      setPacket(nextPacket);
    } catch (error) {
      if (packetLoadRequestIdRef.current !== requestId) return;
      const message =
        error instanceof Error ? error.message : 'Unable to load that hospital workflow.';
      setPacketError(message);
      Alert.alert('Workflow Unavailable', message);
    } finally {
      if (packetLoadRequestIdRef.current !== requestId) return;
      setPacketLoading(false);
    }
  };

  const handleChangeSelectedSystem = () => {
    packetLoadRequestIdRef.current += 1;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSearchQuery('');
    setSelectedSystem(null);
    setPacket(null);
    setPacketError(null);
    setGeneratedPdfUri(null);
    setPacketLoading(false);
    setSelectedFormKey(null);
    setTemplatePrefetchState('idle');
    setPrefetchedFormName(null);
    setTemplatePrefetchError(null);
    setSignatureFieldCount(0);
    setAutofillAnswers({});
    setSignature(null);
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });
  };

  const searchIsPending = deferredSearchQuery !== debouncedSearchQuery;

  const handleCaptureId = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera Access', 'Camera permission is required to attach a photo ID.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset?.uri || !asset.base64) {
        Alert.alert('Image Unavailable', 'Please retake the photo so it can be attached.');
        return;
      }

      setIdAttachment({
        uri: asset.uri,
        base64Data: asset.base64,
        mimeType: asset.mimeType || 'image/jpeg',
        source: 'camera',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to capture a photo.';
      Alert.alert('Camera Error', message);
    }
  };

  const handlePickIdFromLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset?.uri || !asset.base64) {
        Alert.alert('Image Unavailable', 'Please choose an image that can be attached.');
        return;
      }

      setIdAttachment({
        uri: asset.uri,
        base64Data: asset.base64,
        mimeType: asset.mimeType || 'image/jpeg',
        source: 'library',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open your photo library.';
      Alert.alert('Photo Library Error', message);
    }
  };

  const handleGeneratePdf = async () => {
    await generatePdf();
  };

  const handleContinueToSubmit = async () => {
    if (generatedPdfUri || !canGeneratePdf) {
      goToNextStep();
      return;
    }

    const didGeneratePdf = await generatePdf();
    if (didGeneratePdf) {
      goToNextStep();
    }
  };

  const handleOpenGeneratedPdf = async () => {
    if (!generatedPdfUri) return;

    try {
      await Linking.openURL(generatedPdfUri);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open the PDF.';
      Alert.alert('Open Failed', message);
    }
  };

  const handleSharePdf = async () => {
    if (!generatedPdfUri || !packet) return;

    try {
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        throw new Error('Sharing is unavailable on this device.');
      }

      await Sharing.shareAsync(generatedPdfUri, {
        dialogTitle: `${packet.hospitalSystem.name} records request`,
        UTI: 'com.adobe.pdf',
        mimeType: 'application/pdf',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open the share sheet.';
      Alert.alert('Share Failed', message);
    }
  };

  const handleEmailPdf = async () => {
    if (!generatedPdfUri || !packet) return;

    if (!packetEmailDestination) {
      Alert.alert('Email Unavailable', 'No hospital email destination was extracted for this form.');
      return;
    }

    try {
      const emailSubject = `${packet.hospitalSystem.name} medical records request`;
      const emailBody = 'Attached is the completed records request PDF.';
      const composerAvailable = await MailComposer.isAvailableAsync();
      if (!composerAvailable) {
        Alert.alert(
          'Email Unavailable',
          'Email compose with the PDF attached requires Apple Mail to be set up on this iPhone. Use Share to send the PDF with Gmail, Outlook, or another mail app.',
        );
        return;
      }

      await MailComposer.composeAsync({
        recipients: [packetEmailDestination],
        subject: emailSubject,
        body: emailBody,
        attachments: [generatedPdfUri],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open the email composer.';
      Alert.alert('Email Failed', message);
    }
  };

  const handleStartOver = () => {
    setCurrentStepId('bio');
    setGeneratedPdfUri(null);
    setSignature(null);
  };

  const handleEditBio = () => {
    router.push({
      pathname: '/(tabs)/profile/medical-info',
      params: { returnTo: '/records-request' },
    });
  };
  const goToStep = (nextStepId: string) => {
    startTransition(() => setCurrentStepId(nextStepId));
  };

  const goToStepByIndex = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= workflowSteps.length) return;
    goToStep(workflowSteps[targetIndex].id);
  };

  const goToPreviousStep = () => {
    if (currentQuestion) {
      const previousQuestionId = getPreviousAutofillQuestionId(
        allDynamicQuestions,
        currentQuestion.id,
        autofillAnswersRef.current,
      );

      if (previousQuestionId) {
        goToStep(getRecordsRequestQuestionStepId(previousQuestionId));
        return;
      }

      goToStep('hospital');
      return;
    }

    if (currentWorkflowStep.kind === 'hospital' && selectedSystem) {
      handleChangeSelectedSystem();
      goToStepByIndex(currentStepIndex - 1);
      return;
    }

    goToStepByIndex(currentStepIndex - 1);
  };

  const goToNextStep = () => {
    goToStepByIndex(currentStepIndex + 1);
  };

  const getNextWorkflowStepIdForAnswers = (
    currentQuestionId: string,
    answers: RecordsWorkflowAutofillAnswers,
  ) => {
    const nextQuestionId = getNextAutofillQuestionId(allDynamicQuestions, currentQuestionId, answers);
    return nextQuestionId ? getRecordsRequestQuestionStepId(nextQuestionId) : 'id';
  };

  const handleContinueFromHospital = () => {
    if (!packetReadyForContinue) return;
    goToStep(firstQuestionStepId || 'id');
  };

  const handleContinueFromQuestion = () => {
    if (!currentQuestion) return;

    const latestAnswers = autofillAnswersRef.current;
    const validationMessage = validateAutofillAnswers([currentQuestion], latestAnswers);
    if (validationMessage) {
      Alert.alert('Answer Required', validationMessage);
      return;
    }

    goToStep(getNextWorkflowStepIdForAnswers(currentQuestion.id, latestAnswers));
  };

  const handleContinueFromSignature = () => {
    if (!hasSignatureStrokeInput(signature)) {
      Alert.alert('Signature Required', 'Please add your signature before continuing.');
      return;
    }

    void handleContinueToSubmit();
  };

  const handleContinueFromId = () => {
    if (!idStepCanContinue) return;

    if (nextWorkflowStep?.kind === 'submit') {
      void handleContinueToSubmit();
      return;
    }

    goToNextStep();
  };

  const updateShortTextAnswer = (questionId: string, value: string) => {
    setAutofillAnswers((currentAnswers) => {
      const nextAnswers = {
        ...currentAnswers,
        [questionId]: value,
      };
      autofillAnswersRef.current = nextAnswers;
      return nextAnswers;
    });
  };

  const updateSingleSelectAnswer = (questionId: string, optionId: string) => {
    setAutofillAnswers((currentAnswers) => {
      const nextAnswers = {
        ...currentAnswers,
        [questionId]: optionId,
      };
      autofillAnswersRef.current = nextAnswers;
      return nextAnswers;
    });
  };

  const toggleMultiSelectAnswer = (questionId: string, optionId: string) => {
    setAutofillAnswers((currentAnswers) => {
      const existing = Array.isArray(currentAnswers[questionId]) ? currentAnswers[questionId] : [];
      const nextValue = existing.includes(optionId)
        ? existing.filter((value) => value !== optionId)
        : [...existing, optionId];

      const nextAnswers = {
        ...currentAnswers,
        [questionId]: nextValue,
      };
      autofillAnswersRef.current = nextAnswers;
      return nextAnswers;
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollViewRef}
        scrollEnabled={!signaturePadActive}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 14,
            paddingBottom: insets.bottom + 28,
          },
        ]}
        keyboardDismissMode="interactive"
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.headerBackButton, pressed && styles.headerBackButtonPressed]}
          >
            <Ionicons name="chevron-back" size={26} color={theme.colors.secondary} />
          </Pressable>
          <Text style={styles.headerTitle}>New Records Request</Text>
          <View style={styles.backButtonSpacer} />
        </View>

        {currentWorkflowStep.kind === 'bio' ? (
          <View style={styles.stepperCard}>
            <Text style={styles.eyebrow}>Guided Workflow</Text>
            <Text style={styles.heroTitle}>{currentStepTitle}</Text>
            <Text style={styles.heroSubtitle}>{currentStepDescription}</Text>
          </View>
        ) : isGeneratedSubmitStep ? (
          <View style={[styles.progressCard, styles.progressCardCompact]}>
            <View style={styles.generatedProgressCardHeader}>
              <View style={styles.generatedProgressCopy}>
                <Text style={styles.progressEyebrow}>
                  Step {currentStepIndex + 1} of {workflowSteps.length}
                </Text>
                <Text style={styles.progressTitle}>Filled PDF</Text>
                <Text style={styles.progressSubtitle}>Share or email the filled PDF.</Text>
              </View>
              <Pressable
                onPress={handleOpenGeneratedPdf}
                style={({ pressed }) => [
                  styles.pdfOpenButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.pdfOpenButtonText}>Open</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[styles.progressCard, useCompactProgressCard && styles.progressCardCompact]}>
            <Text style={styles.progressEyebrow}>
              Step {currentStepIndex + 1} of {workflowSteps.length}
            </Text>
            {currentStepTitle ? (
              <Text
                style={[styles.progressTitle, useCompactProgressCard && styles.progressTitleCompact]}
              >
                {currentStepTitle}
              </Text>
            ) : null}
            {currentStepDescription ? (
              <Text style={styles.progressSubtitle}>{currentStepDescription}</Text>
            ) : null}
            {currentQuestionStep && (
              <Text style={styles.progressMeta}>
                Question {currentQuestionStep.questionIndex + 1} of {dynamicQuestions.length}
              </Text>
            )}
          </View>
        )}

        {currentWorkflowStep.kind === 'bio' && (
          <View style={styles.sectionCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit your bio information"
              hitSlop={8}
              onPress={handleEditBio}
              style={({ pressed }) => [styles.bioPill, pressed && styles.bioPillPressed]}
            >
              <View style={styles.bioPillContent}>
                <View style={styles.bioPillIconWrap}>
                  <IconUser size={18} color={theme.colors.approvalText} strokeWidth={2} />
                </View>
                <Text style={styles.bioPillText}>Your Bio</Text>
              </View>

              <View style={styles.bioPillAction}>
                <IconPencil size={18} color={theme.colors.approvalText} strokeWidth={2} />
              </View>
            </Pressable>

            <Pressable
              onPress={goToNextStep}
              style={({ pressed }) => [
                styles.primaryButton,
                styles.fullWidthButton,
                pressed && styles.primaryButtonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </Pressable>
          </View>
        )}

        {currentWorkflowStep.kind === 'hospital' && (
          <View style={styles.sectionCard}>
            {!selectedSystem ? (
              <>
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={`Search supported ${RECORDS_REQUEST_LAUNCH_STATE_NAME} hospital systems`}
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={styles.searchInput}
                  autoCapitalize="words"
                  returnKeyType="search"
                />

                {showHospitalDiscoveryMarquee ? (
                  <TexasHospitalLogoMarquee />
                ) : systemsLoading || searchIsPending ? (
                  <View style={styles.inlineLoading}>
                    <ActivityIndicator size="small" color={theme.colors.secondary} />
                    <Text style={styles.inlineLoadingText}>
                      {searchIsPending ? 'Searching systems...' : 'Loading systems...'}
                    </Text>
                  </View>
                ) : systemsError ? (
                  <View style={styles.errorCard}>
                    <Text style={styles.errorTitle}>Unable to load systems</Text>
                    <Text style={styles.errorBody}>{systemsError}</Text>
                  </View>
                ) : (
                  <View style={styles.systemList}>
                    {systems.map((system) => {
                      return (
                        <Pressable
                          key={system.id}
                          accessibilityRole="button"
                          onPress={() => handleSelectSystem(system)}
                          testID={`records-request-system-${system.id}`}
                          style={({ pressed }) => [
                            styles.systemCard,
                            pressed && styles.systemCardPressed,
                          ]}
                        >
                          <HospitalSystemLogo
                            systemName={system.name}
                            systemDomain={system.domain}
                            width={92}
                            height={44}
                          />
                          <View style={styles.systemTextWrap}>
                            <Text style={styles.systemName}>{system.name}</Text>
                            <Text style={styles.systemMeta}>
                              {[system.domain, system.state].filter(Boolean).join(' • ')}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}

                    {systems.length === 0 && (
                      <Text style={styles.emptyStateText}>
                        No supported {RECORDS_REQUEST_LAUNCH_STATE_NAME} hospital systems matched that
                        search yet.
                      </Text>
                    )}
                  </View>
                )}
              </>
            ) : null}

            {selectedSystem && (
              <View style={styles.selectionSummary}>
                <View style={styles.selectionSystemPreview}>
                  <HospitalSystemLogo
                    systemName={selectedSystem.name}
                    systemDomain={selectedSystem.domain}
                    width={92}
                    height={44}
                  />
                  <View style={styles.systemTextWrap}>
                    <Text style={styles.selectionSummaryName}>{selectedSystem.name}</Text>
                    <Text style={styles.systemMeta}>
                      {[selectedSystem.domain, selectedSystem.state].filter(Boolean).join(' • ')}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={handleChangeSelectedSystem}
                  disabled={packetLoading}
                  style={({ pressed }) => [
                    styles.changeSelectionButton,
                    pressed && styles.changeSelectionButtonPressed,
                    packetLoading && styles.disabledButton,
                  ]}
                >
                  <Text style={styles.changeSelectionButtonText}>
                    Change system
                  </Text>
                </Pressable>
                {packetLoading && (
                  <View style={styles.inlineLoading}>
                    <ActivityIndicator size="small" color={theme.colors.secondary} />
                    <Text style={styles.inlineLoadingText}>Loading workflow packet...</Text>
                  </View>
                )}
                {packetError && <Text style={styles.errorInlineText}>{packetError}</Text>}
                {packet && (
                  <>
                    {templatePrefetchState === 'loading' && (
                      <Text style={styles.selectionSummaryMeta}>
                        Preparing form...
                      </Text>
                    )}
                    {templatePrefetchState === 'ready' && (
                      <Text style={styles.selectionFormTitle}>
                        {primaryDisplayForm ? 'Form ready' : 'Workflow ready'}
                      </Text>
                    )}
                    {templatePrefetchState === 'ready' && compactHospitalStatus && (
                      <Text style={styles.selectionSummaryMeta}>
                        {compactHospitalStatus}
                      </Text>
                    )}
                    {templatePrefetchState === 'idle' && !packetLoading && (
                      <Text style={styles.selectionSummaryMeta}>
                        {primaryDisplayForm ? 'Form ready' : 'Workflow ready'}
                      </Text>
                    )}
                    {templatePrefetchState === 'error' && templatePrefetchError && (
                      <Text style={styles.errorInlineText}>{templatePrefetchError}</Text>
                    )}
                  </>
                )}
              </View>
            )}

            <View style={styles.hospitalActionRow}>
              <Pressable
                onPress={goToPreviousStep}
                style={({ pressed }) => [
                  styles.secondaryIconButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Ionicons name="chevron-back" size={22} color={theme.colors.secondary} />
              </Pressable>

              <Pressable
                onPress={handleContinueFromHospital}
                testID="records-request-hospital-continue"
                disabled={!packetReadyForContinue}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.hospitalPrimaryButton,
                  (!packetReadyForContinue || pressed) && styles.primaryButtonPressed,
                  !packetReadyForContinue && styles.disabledButton,
                ]}
              >
                <Text
                  style={styles.primaryButtonText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.92}
                >
                  {hospitalContinueButtonLabel}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {currentQuestionStep && currentQuestion && (
          <View style={styles.sectionCard}>
            {currentQuestion.kind === 'short_text' ? (
              <TextInput
                value={typeof currentQuestionAnswer === 'string' ? currentQuestionAnswer : ''}
                onChangeText={(value) =>
                  updateShortTextAnswer(
                    currentQuestion.id,
                    currentQuestionIsDate ? formatDateAutofillAnswerInput(value) : value,
                  )
                }
                placeholder={currentQuestionIsDate ? 'MM/DD/YYYY' : 'Type your answer'}
                placeholderTextColor={theme.colors.inputPlaceholder}
                style={styles.answerInput}
                autoCapitalize={currentQuestionIsDate ? 'none' : 'sentences'}
                keyboardType={currentQuestionIsDate ? 'number-pad' : 'default'}
                autoCorrect={false}
                maxLength={currentQuestionIsDate ? 10 : undefined}
              />
            ) : (
              <View style={styles.optionList}>
                {currentQuestion.options.map((option) => {
                  const isSelected =
                    currentQuestion.kind === 'single_select'
                      ? currentQuestionAnswer === option.id
                      : Array.isArray(currentQuestionAnswer) &&
                        currentQuestionAnswer.includes(option.id);

                  return (
                    <Pressable
                      key={option.id}
                      onPress={() =>
                        currentQuestion.kind === 'single_select'
                          ? updateSingleSelectAnswer(currentQuestion.id, option.id)
                          : toggleMultiSelectAnswer(currentQuestion.id, option.id)
                      }
                      style={({ pressed }) => [
                        styles.optionChip,
                        isSelected && styles.optionChipSelected,
                        pressed && styles.optionChipPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionChipText,
                          isSelected && styles.optionChipTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View style={styles.actionRow}>
              <Pressable
                onPress={goToPreviousStep}
                style={({ pressed }) => [
                  styles.secondaryIconButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Ionicons name="chevron-back" size={24} color={theme.colors.secondary} />
              </Pressable>

              <Pressable
                onPress={handleContinueFromQuestion}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              >
                {nextWorkflowStep?.kind === 'signature' ? (
                  <View style={styles.primaryButtonContent}>
                    <IconSignature
                      size={18}
                      color={theme.colors.primaryForeground}
                      strokeWidth={2.2}
                    />
                    <Text style={styles.primaryButtonText}>Continue to Signature</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {nextWorkflowStep?.kind === 'id' ? 'Continue to ID' : 'Next Question'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {currentWorkflowStep.kind === 'id' && packet && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Add identification</Text>
            <Text style={styles.sectionBody}>
              {packet.requiresPhotoId
                ? 'This workflow explicitly calls for a legible photo ID, so attach one before continuing.'
                : 'This workflow does not explicitly require a photo ID, but you can still attach one if you want it bundled into the packet.'}
            </Text>

            <View style={styles.requirementCard}>
              <Text style={styles.requirementTitle}>{packet.hospitalSystem.name}</Text>
              <Text style={styles.requirementBody}>
                Photo ID requirement: {packet.requiresPhotoId ? 'Required' : 'Optional'}
              </Text>
              {packet.instructions
                .filter((instruction) => /photo|ident/i.test(`${instruction.label || ''} ${instruction.details}`))
                .slice(0, 1)
                .map((instruction) => (
                  <Text key={instruction.sequenceNo} style={styles.requirementFootnote}>
                    {instruction.details}
                  </Text>
                ))}
            </View>

            <View style={styles.utilityActionRow}>
              <Pressable
                onPress={handleCaptureId}
                style={({ pressed }) => [
                  styles.utilityActionButton,
                  pressed && styles.deliveryActionButtonPressed,
                ]}
              >
                <View style={styles.utilityActionIconWrap}>
                  <Ionicons name="camera-outline" size={22} color={theme.colors.secondary} />
                </View>
                <Text style={styles.utilityActionLabel}>Take Photo</Text>
              </Pressable>

              <Pressable
                onPress={handlePickIdFromLibrary}
                style={({ pressed }) => [
                  styles.utilityActionButton,
                  pressed && styles.deliveryActionButtonPressed,
                ]}
              >
                <View style={styles.utilityActionIconWrap}>
                  <Ionicons name="images-outline" size={22} color={theme.colors.secondary} />
                </View>
                <Text style={styles.utilityActionLabel}>Choose Photos</Text>
              </Pressable>
            </View>

            {idAttachment && (
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>Attached ID</Text>
                <Image source={{ uri: idAttachment.uri }} style={styles.previewImage} />
                <Text style={styles.previewMeta}>
                  Added from {idAttachment.source === 'camera' ? 'camera' : 'photo library'}
                </Text>
              </View>
            )}

            <View style={styles.actionRow}>
              <Pressable
                onPress={goToPreviousStep}
                style={({ pressed }) => [
                  styles.secondaryIconButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Ionicons name="chevron-back" size={24} color={theme.colors.secondary} />
              </Pressable>

              <Pressable
                accessibilityLabel={
                  nextWorkflowStep?.kind === 'signature'
                    ? 'Continue to signature'
                    : undefined
                }
                onPress={handleContinueFromId}
                disabled={!idStepCanContinue || submitting}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (!idStepCanContinue || submitting || pressed) && styles.primaryButtonPressed,
                  (!idStepCanContinue || submitting) && styles.disabledButton,
                ]}
              >
                {nextWorkflowStep?.kind === 'signature' ? (
                  <View style={styles.primaryIconOnlyButtonContent}>
                    <IconSignature
                      size={24}
                      color={theme.colors.primaryForeground}
                      strokeWidth={2}
                    />
                  </View>
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {submitting
                      ? 'Preparing PDF...'
                      : packet.requiresPhotoId
                        ? 'Continue to Review'
                        : 'Review Packet'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {currentWorkflowStep.kind === 'signature' && (
          <View style={styles.sectionCard}>
            <Text style={styles.signatureHint}>
              Sign once below and we&apos;ll place it directly onto the final form.
            </Text>

            <SignaturePad
              value={signature}
              onChange={setSignature}
              onInteractionStart={() => setSignaturePadActive(true)}
              onInteractionEnd={() => setSignaturePadActive(false)}
            />

            <Pressable onPress={() => setSignature(null)} style={styles.signatureClearButton}>
              <Text style={styles.signatureClearButtonText}>Clear signature</Text>
            </Pressable>

            <View style={styles.actionRow}>
              <Pressable
                onPress={goToPreviousStep}
                style={({ pressed }) => [
                  styles.secondaryIconButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Ionicons name="chevron-back" size={24} color={theme.colors.secondary} />
              </Pressable>

              <Pressable
                onPress={handleContinueFromSignature}
                disabled={!signatureStepCanContinue || submitting}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (!signatureStepCanContinue || submitting || pressed) && styles.primaryButtonPressed,
                  (!signatureStepCanContinue || submitting) && styles.disabledButton,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {submitting ? 'Preparing PDF...' : 'Review Packet'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {currentWorkflowStep.kind === 'submit' && packet && (
          <View style={generatedPdfUri ? styles.generatedSubmitSection : styles.sectionCard}>
            {!generatedPdfUri ? (
              <>
                <Text style={styles.sectionTitle}>Create the filled PDF</Text>
                <Text style={styles.sectionBody}>
                  Generate the completed PDF, then send it exactly the way this hospital asks.
                </Text>
              </>
            ) : null}

            {generatedPdfUri && (
              <View style={styles.pdfPreviewCard}>
                {Platform.OS === 'ios' && !pdfPreviewFailed ? (
                  <View style={styles.pdfFrame}>
                    <WebView
                      key={generatedPdfUri}
                      source={{ uri: generatedPdfUri }}
                      style={styles.pdfWebView}
                      allowingReadAccessToURL={generatedPdfUri}
                      originWhitelist={['*']}
                      onError={() => setPdfPreviewFailed(true)}
                    />
                  </View>
                ) : (
                  <View style={styles.pdfFallback}>
                    <Ionicons
                      name="document-text-outline"
                      size={26}
                      color={theme.colors.secondary}
                    />
                    <Text style={styles.pdfFallbackText}>
                      Open the filled PDF to review the exact document you’re about to send.
                    </Text>
                    <Pressable
                      onPress={handleOpenGeneratedPdf}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        styles.fullWidthButton,
                        pressed && styles.secondaryButtonPressed,
                      ]}
                    >
                      <Text style={styles.secondaryButtonText}>Open PDF</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {!generatedPdfUri && (
              <View style={styles.reviewSection}>
                <Text style={styles.reviewHeader}>Official form</Text>
                {primaryDisplayForm ? (
                  <Pressable
                    key={`${primaryDisplayForm.name}:${primaryDisplayForm.url}`}
                    onPress={() =>
                      Linking.openURL(primaryDisplayForm.cachedContentUrl || primaryDisplayForm.url)
                    }
                    style={({ pressed }) => [styles.linkRow, pressed && styles.systemCardPressed]}
                  >
                    <Text style={styles.linkText}>{primaryDisplayForm.name}</Text>
                    <Text style={styles.linkMeta}>
                      {primaryDisplayForm.cachedContentUrl ? 'CACHED PDF' : 'OFFICIAL LINK'}
                    </Text>
                  </Pressable>
                ) : packet.forms.length > 0 ? (
                  packet.forms.slice(0, 1).map((form) => (
                    <Pressable
                      key={`${form.name}:${form.url}`}
                      onPress={() => Linking.openURL(form.cachedContentUrl || form.url)}
                      style={({ pressed }) => [styles.linkRow, pressed && styles.systemCardPressed]}
                    >
                      <Text style={styles.linkText}>{form.name}</Text>
                      <Text style={styles.linkMeta}>
                        {form.cachedContentUrl ? 'CACHED PDF' : 'OFFICIAL LINK'}
                      </Text>
                    </Pressable>
                  ))
                ) : (
                  <Text style={styles.reviewMuted}>
                    No official form URLs were attached to this system.
                  </Text>
                )}
              </View>
            )}

            {!hasPdfForm && (
              <View style={styles.reviewSection}>
                <Text style={styles.reviewHeader}>Form filling</Text>
                <Text style={styles.reviewMuted}>
                  No fillable hospital PDF is available for this system yet. You can still review the
                  workflow details above and open any official links manually.
                </Text>
              </View>
            )}

            {hasPdfForm && templatePrefetchState === 'loading' && (
              <View style={styles.reviewSection}>
                <Text style={styles.reviewHeader}>Preparing form</Text>
                <Text style={styles.reviewMuted}>
                  Fetching the selected hospital PDF now so it&apos;s ready for one-tap filling.
                </Text>
              </View>
            )}

            <View style={styles.deliveryCard}>
              <Text style={styles.deliveryEyebrow}>Sending Instructions</Text>
              {displayedEmailDestination ? (
                <View style={styles.deliveryRow}>
                  <View style={styles.deliveryIcon}>
                    <Ionicons name="mail-outline" size={18} color={theme.colors.secondary} />
                  </View>
                  <View style={styles.deliveryTextWrap}>
                    <Text style={styles.deliveryLabel}>Email</Text>
                    <Text style={styles.deliveryValue}>{displayedEmailDestination}</Text>
                  </View>
                </View>
              ) : null}
              {displayedFaxDestination ? (
                <View style={styles.deliveryRow}>
                  <View style={styles.deliveryIcon}>
                    <Ionicons name="print-outline" size={18} color={theme.colors.secondary} />
                  </View>
                  <View style={styles.deliveryTextWrap}>
                    <Text style={styles.deliveryLabel}>Fax</Text>
                    <Text style={styles.deliveryValue}>{displayedFaxDestination}</Text>
                  </View>
                </View>
              ) : null}
              {displayedMailDestination ? (
                <View style={styles.deliveryRow}>
                  <View style={styles.deliveryIcon}>
                    <Ionicons name="business-outline" size={18} color={theme.colors.secondary} />
                  </View>
                  <View style={styles.deliveryTextWrap}>
                    <Text style={styles.deliveryLabel}>Mail</Text>
                    <Text style={styles.deliveryValue}>{displayedMailDestination}</Text>
                  </View>
                </View>
              ) : null}
              {displayedSupportPhone ? (
                <View style={styles.deliveryRow}>
                  <View style={styles.deliveryIcon}>
                    <Ionicons name="call-outline" size={18} color={theme.colors.secondary} />
                  </View>
                  <View style={styles.deliveryTextWrap}>
                    <Text style={styles.deliveryLabel}>Questions / status</Text>
                    <Text style={styles.deliveryValue}>{displayedSupportPhone}</Text>
                  </View>
                </View>
              ) : null}
              {!hasDeliveryInstructions ? (
                <Text style={styles.deliveryHint}>No clear send instructions were recovered yet.</Text>
              ) : null}
            </View>

            {generatedPdfUri && (
              <View style={styles.deliveryActionRow}>
                <Pressable
                  onPress={handleSharePdf}
                  style={({ pressed }) => [
                    styles.deliveryActionButton,
                    pressed && styles.deliveryActionButtonPressed,
                  ]}
                >
                  <View style={styles.deliveryActionIconWrap}>
                    <Ionicons
                      name="share-social-outline"
                      size={20}
                      color={theme.colors.secondary}
                    />
                  </View>
                  <Text style={styles.deliveryActionLabel}>Share</Text>
                </Pressable>

              <Pressable
                onPress={handleEmailPdf}
                disabled={!packetEmailDestination}
                style={({ pressed }) => [
                  styles.deliveryActionButton,
                  (!packetEmailDestination || pressed) && styles.deliveryActionButtonPressed,
                  !packetEmailDestination && styles.deliveryActionButtonDisabled,
                ]}
              >
                  <View style={styles.deliveryActionIconWrap}>
                    <Ionicons name="mail-outline" size={20} color={theme.colors.secondary} />
                  </View>
                  <Text
                    style={[
                      styles.deliveryActionLabel,
                      !packetEmailDestination && styles.deliveryActionLabelDisabled,
                    ]}
                  >
                    Email
                  </Text>
                </Pressable>

                <View style={[styles.deliveryActionButton, styles.deliveryActionButtonDisabled]}>
                  <View style={styles.deliveryActionIconWrap}>
                    <Ionicons name="print-outline" size={20} color={theme.colors.textMuted} />
                  </View>
                  <Text style={[styles.deliveryActionLabel, styles.deliveryActionLabelDisabled]}>
                    Fax
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.actionColumn}>
              {!generatedPdfUri ? (
                <Pressable
                  onPress={handleGeneratePdf}
                  disabled={submitting || !canGeneratePdf}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.fullWidthButton,
                    (pressed || submitting || !canGeneratePdf) && styles.primaryButtonPressed,
                    !canGeneratePdf && styles.disabledButton,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>
                    {submitting
                      ? 'Filling PDF...'
                      : canGeneratePdf
                        ? templatePrefetchState === 'error'
                          ? `Retry ${formFillButtonLabel}`
                          : formFillButtonLabel
                        : hasPdfForm
                          ? 'Fetching Form...'
                          : 'No Fillable PDF Available Yet'}
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.generatedFooterRow}>
                  <Pressable
                    onPress={goToPreviousStep}
                    style={({ pressed }) => [
                      styles.secondaryIconButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                  >
                    <Ionicons name="chevron-back" size={24} color={theme.colors.secondary} />
                  </Pressable>
                  <Pressable
                    onPress={handleStartOver}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      styles.generatedSecondaryButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>Start Over</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {!generatedPdfUri && (
              <View style={styles.actionRow}>
                <Pressable
                  onPress={goToPreviousStep}
                  style={({ pressed }) => [
                    styles.secondaryIconButton,
                    pressed && styles.secondaryButtonPressed,
                  ]}
                >
                  <Ionicons name="chevron-back" size={24} color={theme.colors.secondary} />
                </Pressable>

                <Pressable
                  onPress={handleStartOver}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.primaryButtonPressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>Start Over</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = createThemedStyles((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSubtle,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundSubtle,
  },
  content: {
    paddingHorizontal: 20,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackButtonPressed: {
    opacity: 0.72,
  },
  backButtonSpacer: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  stepperCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 10,
  },
  progressCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  progressCardCompact: {
    paddingVertical: 16,
    gap: 6,
  },
  eyebrow: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  heroSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    lineHeight: 23,
  },
  progressEyebrow: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  progressTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  progressTitleCompact: {
    fontSize: 20,
    lineHeight: 25,
  },
  progressSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  progressMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 16,
  },
  generatedSubmitSection: {
    gap: 16,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  sectionBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  bioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.approvalBorder,
    minHeight: 56,
  },
  bioPillPressed: {
    opacity: 0.9,
  },
  bioPillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bioPillIconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  bioPillText: {
    color: theme.colors.approvalText,
    fontSize: 16,
    fontWeight: '700',
  },
  bioPillAction: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: 16,
    flexShrink: 0,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  hospitalActionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  utilityActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionColumn: {
    gap: 12,
  },
  generatedFooterRow: {
    flexDirection: 'row',
    gap: 12,
  },
  generatedProgressCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  generatedProgressCopy: {
    flex: 1,
    gap: 8,
  },
  inlineTextButton: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  inlineTextButtonText: {
    color: theme.colors.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  hospitalPrimaryButton: {
    minWidth: 0,
  },
  generatedSecondaryButton: {
    flex: 1,
  },
  primaryButtonPressed: {
    opacity: 0.86,
  },
  primaryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryIconOnlyButtonContent: {
    width: '100%',
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: theme.colors.primaryForeground,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.secondarySoft,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
  },
  secondaryButtonPressed: {
    opacity: 0.88,
  },
  secondaryButtonText: {
    color: theme.colors.secondary,
    fontSize: 16,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.45,
  },
  fullWidthButton: {
    flex: 0,
  },
  searchInput: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: theme.colors.text,
    fontSize: 16,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inlineLoadingText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  errorCard: {
    backgroundColor: theme.colors.dangerSoft,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    gap: 6,
  },
  errorTitle: {
    color: theme.colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  errorBody: {
    color: theme.colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  systemList: {
    gap: 10,
  },
  systemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  systemCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  systemCardPressed: {
    opacity: 0.86,
  },
  systemTextWrap: {
    flex: 1,
    gap: 4,
  },
  systemName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  systemMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  emptyStateText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 8,
  },
  selectionSummary: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 20,
    padding: 14,
    gap: 10,
  },
  selectionSummaryName: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  selectionSystemPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  selectionSummaryMeta: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 19,
  },
  selectionFormTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  changeSelectionButton: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  changeSelectionButtonPressed: {
    opacity: 0.72,
  },
  changeSelectionButtonText: {
    color: theme.colors.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  errorInlineText: {
    color: theme.colors.danger,
    fontSize: 14,
  },
  secondaryIconButton: {
    width: 96,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.secondarySoft,
    borderRadius: 20,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
    flexShrink: 0,
  },
  utilityActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 18,
    paddingHorizontal: 10,
  },
  utilityActionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.secondarySoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  utilityActionLabel: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  requirementCard: {
    backgroundColor: theme.colors.warningSoft,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    gap: 8,
  },
  requirementTitle: {
    color: theme.colors.warning,
    fontSize: 18,
    fontWeight: '700',
  },
  requirementBody: {
    color: theme.colors.warning,
    fontSize: 15,
    fontWeight: '600',
  },
  requirementFootnote: {
    color: theme.colors.warning,
    fontSize: 14,
    lineHeight: 20,
  },
  previewCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  previewTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  previewImage: {
    width: '100%',
    height: 210,
    borderRadius: 18,
    backgroundColor: theme.colors.border,
  },
  previewMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  answerInput: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: theme.colors.text,
    fontSize: 16,
  },
  signatureHint: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  signatureClearButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  signatureClearButtonText: {
    color: theme.colors.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  optionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionChip: {
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  optionChipSelected: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  optionChipPressed: {
    opacity: 0.86,
  },
  optionChipText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  optionChipTextSelected: {
    color: theme.colors.primary,
  },
  reviewSection: {
    gap: 8,
  },
  reviewHeader: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  reviewText: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  reviewMuted: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  deliveryCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  deliveryEyebrow: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  deliveryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  deliveryIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.secondarySoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  deliveryTextWrap: {
    flex: 1,
    gap: 4,
  },
  deliveryLabel: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  deliveryValue: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  deliveryHint: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  deliveryActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  deliveryActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  deliveryActionButtonPressed: {
    opacity: 0.86,
  },
  deliveryActionButtonDisabled: {
    opacity: 0.48,
  },
  deliveryActionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.secondarySoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  deliveryActionLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  deliveryActionLabelDisabled: {
    color: theme.colors.textMuted,
  },
  pdfPreviewCard: {
    marginHorizontal: -20,
  },
  pdfOpenButton: {
    backgroundColor: theme.colors.secondarySoft,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
  },
  pdfOpenButtonText: {
    color: theme.colors.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  pdfFrame: {
    overflow: 'hidden',
    backgroundColor: theme.colors.backgroundSubtle,
    aspectRatio: 8.5 / 11,
  },
  pdfWebView: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSubtle,
  },
  pdfFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    marginHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 22,
    gap: 12,
  },
  pdfFallbackText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  linkText: {
    color: theme.colors.secondary,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  linkMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  instructionBullet: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '700',
    width: 14,
  },
  instructionText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  answerSummaryRow: {
    gap: 4,
    paddingVertical: 2,
  },
  answerSummaryLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  successCard: {
    backgroundColor: theme.colors.successSoft,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.success,
    gap: 10,
  },
  successTitle: {
    color: theme.colors.success,
    fontSize: 16,
    fontWeight: '700',
  },
  successBody: {
    color: theme.colors.success,
    fontSize: 14,
    lineHeight: 20,
  },
}));
