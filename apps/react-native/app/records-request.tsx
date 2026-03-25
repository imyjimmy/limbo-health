import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';
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
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HospitalSystemLogo,
  hasHospitalSystemLogo,
} from '../components/records/HospitalSystemLogo';
import { SignaturePad } from '../components/records/SignaturePad';
import { fetchHospitalSystems, fetchRecordsRequestPacket } from '../core/recordsWorkflow/api';
import {
  buildRecordsRequestWorkflowSteps,
  formatDateAutofillAnswerInput,
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
  prefetchRecordsRequestPdfTemplate,
} from '../core/recordsWorkflow/pdf';
import {
  HOSPITAL_SYSTEM_SEARCH_DEBOUNCE_MS,
  normalizeHospitalSystemSearchQuery,
} from '../core/recordsWorkflow/search';
import { useCamera } from '../hooks/useCamera';
import { useBioProfile } from '../providers/BioProfileProvider';
import { createThemedStyles, useTheme, useThemedStyles } from '../theme';
import { formatMaskedMailingAddress } from '../types/bio';
import type {
  HospitalSystemOption,
  RecordsRequestIdAttachment,
  RecordsRequestPacket,
  RecordsRequestUserSignature,
  RecordsWorkflowAutofillQuestion,
  RecordsWorkflowForm,
} from '../types/recordsRequest';

function formatMethodLabel(method: string): string {
  return method
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function buildFormKey(form: RecordsWorkflowForm): string {
  return form.cachedContentUrl || form.url;
}

function getAutofillAnswerLabel(
  question: RecordsWorkflowAutofillQuestion,
  answers: RecordsWorkflowAutofillAnswers,
): string {
  const answer = answers[question.id];

  if (question.kind === 'short_text') {
    return typeof answer === 'string' ? answer.trim() : '';
  }

  if (question.kind === 'single_select') {
    if (typeof answer !== 'string') return '';
    return question.options.find((option) => option.id === answer)?.label || '';
  }

  if (!Array.isArray(answer)) return '';

  return question.options
    .filter((option) => answer.includes(option.id))
    .map((option) => option.label)
    .join(', ');
}

function getWorkflowStepTitle(step: RecordsRequestWorkflowStep): string {
  switch (step.kind) {
    case 'bio':
      return 'Build a ready-to-send request packet.';
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
      return "We'll use your saved info, guide you through any extra form questions, add ID if needed, and prepare a PDF you can review or share.";
    case 'hospital':
      return 'Search the hospital system you want to request records from.';
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
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { capture } = useCamera();
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
  const packetLoadRequestIdRef = useRef(0);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const autofillAnswersRef = useRef<RecordsWorkflowAutofillAnswers>({});

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
      setSystemsLoading(true);
      setSystemsError(null);

      try {
        const results = await fetchHospitalSystems(debouncedSearchQuery, {
          signal: abortController.signal,
        });
        if (!cancelled) {
          setSystems(
            [...results].sort((left, right) => {
              const leftHasLogo = hasHospitalSystemLogo(left.name);
              const rightHasLogo = hasHospitalSystemLogo(right.name);

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
    if (!packet || !packet.forms.some((form) => form.format === 'pdf')) {
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

  const hasPdfForm = Boolean(packet?.forms.some((form) => form.format === 'pdf'));
  const selectedPdfForm =
    packet?.forms.find(
      (form) => form.format === 'pdf' && selectedFormKey && buildFormKey(form) === selectedFormKey,
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
      ? activeAutofillForm.autofill.questions
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
  const currentStepTitle =
    currentWorkflowStep.kind === 'hospital' && selectedSystem
      ? selectedSystem.name
      : getWorkflowStepTitle(currentWorkflowStep);
  const currentStepDescription =
    currentWorkflowStep.kind === 'hospital' && selectedSystem
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
  const useCompactProgressCard = currentWorkflowStep.kind === 'hospital' && Boolean(selectedSystem);

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
        href={{ pathname: '/bio-setup', params: { returnTo: '/records-request' } }}
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
  };

  const searchIsPending = deferredSearchQuery !== debouncedSearchQuery;

  const handleCaptureId = async () => {
    try {
      const result = await capture();
      if (!result) return;

      setIdAttachment({
        uri: result.uri,
        base64Data: result.base64Data,
        mimeType: 'image/jpeg',
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
    if (!packet) return;

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
      const hasSignature = hasSignatureStrokeInput(signature);
      const appliedSummary =
        dynamicQuestions.length > 0 || hasSignature
          ? `Applied your bio${dynamicQuestions.length > 0 ? ', form answers' : ''}${hasSignature ? dynamicQuestions.length > 0 ? ', and signature' : ' and signature' : ''}`
          : 'Applied your bio';
      Alert.alert(
        'Form Ready',
        `${appliedSummary} to ${result.formName} and filled ${result.filledFieldCount} field${result.filledFieldCount === 1 ? '' : 's'}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate the PDF.';
      Alert.alert('Generation Failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSharePdf = async () => {
    if (!generatedPdfUri || !packet) return;

    try {
      await Share.share({
        title: `${packet.hospitalSystem.name} records request`,
        url: generatedPdfUri,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to share the PDF.';
      Alert.alert('Share Failed', message);
    }
  };

  const goToStep = (nextStepId: string) => {
    startTransition(() => setCurrentStepId(nextStepId));
  };

  const goToStepByIndex = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= workflowSteps.length) return;
    goToStep(workflowSteps[targetIndex].id);
  };

  const goToPreviousStep = () => {
    goToStepByIndex(currentStepIndex - 1);
  };

  const goToNextStep = () => {
    goToStepByIndex(currentStepIndex + 1);
  };

  const getNextWorkflowStepIdForAnswers = (
    currentQuestionId: string,
    answers: RecordsWorkflowAutofillAnswers,
  ) => {
    const nextVisibleQuestions = getVisibleAutofillQuestions(allDynamicQuestions, answers);
    const nextSteps = buildRecordsRequestWorkflowSteps(nextVisibleQuestions, {
      includeSignatureStep: hasSignatureStep,
    });
    const currentQuestionStepId = getRecordsRequestQuestionStepId(currentQuestionId);
    const nextIndex = nextSteps.findIndex((step) => step.id === currentQuestionStepId);

    if (nextIndex === -1) {
      return nextSteps[0]?.id || 'bio';
    }

    return nextSteps[nextIndex + 1]?.id || 'submit';
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
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
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
        ) : (
          <View style={[styles.progressCard, useCompactProgressCard && styles.progressCardCompact]}>
            <Text style={styles.progressEyebrow}>
              Step {currentStepIndex + 1} of {workflowSteps.length}
            </Text>
            <Text
              style={[styles.progressTitle, useCompactProgressCard && styles.progressTitleCompact]}
            >
              {currentStepTitle}
            </Text>
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
            <Text style={styles.sectionTitle}>Use your saved bio info</Text>
            <Text style={styles.sectionBody}>
              We&apos;ll use your saved profile to prefill the request packet on this device. If
              anything changed, you can edit it before continuing.
            </Text>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryPlaceholderTitle}>My Bio Info</Text>
              <Text style={styles.summaryPlaceholderBody}>
                Ready to prefill your name, contact details, and mailing address without showing
                them on this screen.
              </Text>
            </View>

            <View style={styles.actionRow}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/bio-setup',
                    params: { returnTo: '/records-request' },
                  })
                }
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Edit Personal Info</Text>
              </Pressable>

              <Pressable
                onPress={goToNextStep}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              >
                <Text style={styles.primaryButtonText}>Continue</Text>
              </Pressable>
            </View>
          </View>
        )}

        {currentWorkflowStep.kind === 'hospital' && (
          <View style={styles.sectionCard}>
            {!selectedSystem ? (
              <>
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search supported hospital systems"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={styles.searchInput}
                  autoCapitalize="words"
                  returnKeyType="search"
                />

                {systemsLoading || searchIsPending ? (
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
                          onPress={() => handleSelectSystem(system)}
                          style={({ pressed }) => [
                            styles.systemCard,
                            pressed && styles.systemCardPressed,
                          ]}
                        >
                          <HospitalSystemLogo systemName={system.name} width={92} height={44} />
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
                        No supported hospital systems matched that search yet.
                      </Text>
                    )}
                  </View>
                )}
              </>
            ) : null}

            {selectedSystem && (
              <View style={styles.selectionSummary}>
                <View style={styles.selectionSystemPreview}>
                  <HospitalSystemLogo systemName={selectedSystem.name} width={92} height={44} />
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
                  {dynamicQuestions.length > 0 ? 'Continue to questions' : 'Continue to ID'}
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
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>

              <Pressable
                onPress={handleContinueFromQuestion}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              >
                <Text style={styles.primaryButtonText}>
                  {nextWorkflowStep?.kind === 'id'
                    ? 'Continue to ID'
                    : nextWorkflowStep?.kind === 'signature'
                      ? 'Continue to Signature'
                      : 'Next Question'}
                </Text>
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

            <View style={styles.actionColumn}>
              <Pressable
                onPress={handleCaptureId}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.fullWidthButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Take Photo</Text>
              </Pressable>

              <Pressable
                onPress={handlePickIdFromLibrary}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.fullWidthButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Choose From Photos</Text>
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
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>

              <Pressable
                onPress={goToNextStep}
                disabled={!idStepCanContinue}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (!idStepCanContinue || pressed) && styles.primaryButtonPressed,
                  !idStepCanContinue && styles.disabledButton,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {nextWorkflowStep?.kind === 'signature'
                    ? 'Continue to Signature'
                    : packet.requiresPhotoId
                      ? 'Continue to Review'
                      : 'Review Packet'}
                </Text>
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
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>

              <Pressable
                onPress={handleContinueFromSignature}
                disabled={!signatureStepCanContinue}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (!signatureStepCanContinue || pressed) && styles.primaryButtonPressed,
                  !signatureStepCanContinue && styles.disabledButton,
                ]}
              >
                <Text style={styles.primaryButtonText}>Review Packet</Text>
              </Pressable>
            </View>
          </View>
        )}

        {currentWorkflowStep.kind === 'submit' && packet && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Fill out the selected form</Text>
            <Text style={styles.sectionBody}>
              When you tap below, we fill the selected hospital form with your saved info, any
              answers you provided, your signature when needed, and append your ID image if you
              attached one.
            </Text>

            <View style={styles.reviewSection}>
              <Text style={styles.reviewHeader}>Bio info</Text>
              <Text style={styles.reviewText}>{profile.fullName}</Text>
              <Text style={styles.reviewText}>{profile.dateOfBirth}</Text>
              {profile.phoneNumber ? <Text style={styles.reviewText}>{profile.phoneNumber}</Text> : null}
              {profile.email ? <Text style={styles.reviewText}>{profile.email}</Text> : null}
              <Text style={styles.reviewText}>{formatMaskedMailingAddress(profile)}</Text>
            </View>

            <View style={styles.reviewSection}>
              <Text style={styles.reviewHeader}>Hospital system</Text>
              <Text style={styles.reviewText}>{packet.hospitalSystem.name}</Text>
              <Text style={styles.reviewMuted}>
                {(packet.medicalWorkflow?.availableMethods || [])
                  .map(formatMethodLabel)
                  .join(' • ') || 'Workflow methods pending'}
              </Text>
            </View>

            <View style={styles.reviewSection}>
              <Text style={styles.reviewHeader}>Official form</Text>
              {primaryDisplayForm ? (
                <Pressable
                  key={`${primaryDisplayForm.name}:${primaryDisplayForm.url}`}
                  onPress={() => Linking.openURL(primaryDisplayForm.cachedContentUrl || primaryDisplayForm.url)}
                  style={({ pressed }) => [styles.linkRow, pressed && styles.systemCardPressed]}
                >
                  <Text style={styles.linkText}>{primaryDisplayForm.name}</Text>
                  <Text style={styles.linkMeta}>
                    {primaryDisplayForm.cachedContentUrl
                      ? 'CACHED PDF'
                      : primaryDisplayForm.format?.toUpperCase() || 'LINK'}
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
                      {form.cachedContentUrl
                        ? 'CACHED PDF'
                        : form.format?.toUpperCase() || 'LINK'}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.reviewMuted}>No official form URLs were attached to this system.</Text>
              )}
            </View>

            {selectedPdfForm && primaryDisplayForm && selectedPdfForm.name !== primaryDisplayForm.name && (
              <View style={styles.reviewSection}>
                <Text style={styles.reviewHeader}>Selected autofill form</Text>
                <Text style={styles.reviewText}>{selectedPdfForm.name}</Text>
                <Text style={styles.reviewMuted}>
                  {selectedPdfForm.autofill.mode
                    ? `Autofill mode: ${selectedPdfForm.autofill.mode}`
                    : 'Autofill mode pending'}
                </Text>
              </View>
            )}

            {dynamicQuestions.length > 0 && (
              <View style={styles.reviewSection}>
                <Text style={styles.reviewHeader}>Form answers</Text>
                {dynamicQuestions.map((question) => {
                  const answerLabel = getAutofillAnswerLabel(question, autofillAnswers);

                  return (
                    <View key={question.id} style={styles.answerSummaryRow}>
                      <Text style={styles.answerSummaryLabel}>{question.label}</Text>
                      <Text style={styles.reviewMuted}>{answerLabel || 'No answer recorded'}</Text>
                    </View>
                  );
                })}
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

            <View style={styles.reviewSection}>
              <Text style={styles.reviewHeader}>Instructions</Text>
              {packet.instructions.slice(0, 4).map((instruction) => (
                <View key={`${instruction.sequenceNo}:${instruction.details}`} style={styles.instructionRow}>
                  <Text style={styles.instructionBullet}>{instruction.sequenceNo || '•'}</Text>
                  <Text style={styles.instructionText}>{instruction.details}</Text>
                </View>
              ))}
            </View>

            <View style={styles.reviewSection}>
              <Text style={styles.reviewHeader}>ID attachment</Text>
              <Text style={styles.reviewMuted}>
                {idAttachment
                  ? `Included from ${idAttachment.source === 'camera' ? 'camera' : 'photo library'}`
                  : 'No ID image attached'}
              </Text>
            </View>

            {hasSignatureStep && (
              <View style={styles.reviewSection}>
                <Text style={styles.reviewHeader}>Signature</Text>
                <Text style={styles.reviewMuted}>
                  {hasSignatureStrokeInput(signature) ? 'Included on the form' : 'No signature captured'}
                </Text>
              </View>
            )}

            <View style={styles.actionColumn}>
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

              {generatedPdfUri && (
                <View style={styles.successCard}>
                  <Text style={styles.successTitle}>Filled form ready</Text>
                  <Text style={styles.successBody}>
                    Your hospital PDF now has your bio
                    {dynamicQuestions.length > 0 ? ', form answers' : ''}
                    {hasSignatureStrokeInput(signature) ? ', and signature' : ''}
                    {' '}applied and is ready to share, review, or save elsewhere on your device.
                  </Text>
                  <Pressable
                    onPress={handleSharePdf}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      styles.fullWidthButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>Share PDF</Text>
                  </Pressable>
                </View>
              )}
            </View>

            <View style={styles.actionRow}>
              <Pressable
                onPress={goToPreviousStep}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setCurrentStepId('bio');
                  setGeneratedPdfUri(null);
                  setSignature(null);
                }}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              >
                <Text style={styles.primaryButtonText}>Start Over</Text>
              </Pressable>
            </View>
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
  backButton: {
    minWidth: 56,
    paddingVertical: 8,
  },
  backButtonText: {
    color: theme.colors.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  backButtonSpacer: {
    minWidth: 56,
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
  summaryCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  summaryPlaceholderTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  summaryPlaceholderBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
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
  actionColumn: {
    gap: 12,
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
  primaryButtonPressed: {
    opacity: 0.86,
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
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.secondarySoft,
    borderRadius: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
    flexShrink: 0,
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
