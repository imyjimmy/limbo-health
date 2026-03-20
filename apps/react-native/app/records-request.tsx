import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
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
import { HospitalSystemLogo } from '../components/records/HospitalSystemLogo';
import { RequestStepper } from '../components/records/RequestStepper';
import { fetchHospitalSystems, fetchRecordsRequestPacket } from '../core/recordsWorkflow/api';
import {
  buildRecordsRequestSteps,
  validateAutofillAnswers,
  type RecordsRequestStepKey,
  type RecordsWorkflowAutofillAnswers,
} from '../core/recordsWorkflow/autofill';
import {
  generateRecordsRequestPdf,
  prefetchRecordsRequestPdfTemplate,
} from '../core/recordsWorkflow/pdf';
import {
  HOSPITAL_SYSTEM_SEARCH_DEBOUNCE_MS,
  normalizeHospitalSystemSearchQuery,
} from '../core/recordsWorkflow/search';
import { useCamera } from '../hooks/useCamera';
import { useBioProfile } from '../providers/BioProfileProvider';
import { createThemedStyles, useTheme, useThemedStyles } from '../theme';
import { formatMailingAddress } from '../types/bio';
import type {
  HospitalSystemOption,
  RecordsRequestIdAttachment,
  RecordsRequestPacket,
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

export default function RecordsRequestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { capture } = useCamera();
  const { status: bioStatus, profile, hasProfile } = useBioProfile();
  const [currentStep, setCurrentStep] = useState<RecordsRequestStepKey>('bio');
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
  const [autofillAnswers, setAutofillAnswers] = useState<RecordsWorkflowAutofillAnswers>({});

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
          setSystems(results);
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
      return;
    }

    let cancelled = false;
    setTemplatePrefetchState('loading');
    setSelectedFormKey(null);
    setPrefetchedFormName(null);
    setTemplatePrefetchError(null);

    prefetchRecordsRequestPdfTemplate(packet)
      .then((result) => {
        if (cancelled) return;
        setTemplatePrefetchState('ready');
        setSelectedFormKey(result.formKey);
        setPrefetchedFormName(result.formName);
      })
      .catch((error) => {
        if (cancelled) return;
        setTemplatePrefetchState('error');
        setTemplatePrefetchError(
          error instanceof Error ? error.message : 'Unable to cache the hospital PDF yet.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [packet]);

  useEffect(() => {
    setAutofillAnswers({});
  }, [selectedFormKey]);

  const hasPdfForm = Boolean(packet?.forms.some((form) => form.format === 'pdf'));
  const selectedPdfForm =
    packet?.forms.find(
      (form) => form.format === 'pdf' && selectedFormKey && buildFormKey(form) === selectedFormKey,
    ) || null;
  const dynamicQuestions =
    selectedPdfForm?.autofill.supported && selectedPdfForm.autofill.questions.length > 0
      ? selectedPdfForm.autofill.questions
      : [];
  const workflowSteps = buildRecordsRequestSteps(dynamicQuestions.length > 0);
  const currentStepIndex = Math.max(
    workflowSteps.findIndex((step) => step.key === currentStep),
    0,
  );
  const packetReadyForContinue = Boolean(
    selectedSystem &&
      packet &&
      !packetLoading &&
      !packetError &&
      (!hasPdfForm || templatePrefetchState !== 'loading'),
  );
  const idStepCanContinue = Boolean(packet && (!packet.requiresPhotoId || idAttachment));
  const canGeneratePdf = hasPdfForm && templatePrefetchState !== 'loading';
  const formFillButtonLabel = dynamicQuestions.length > 0 ? 'Fill Out Form' : 'Apply Bio To PDF';

  useEffect(() => {
    if (currentStep === 'form' && dynamicQuestions.length === 0) {
      setCurrentStep('id');
    }
  }, [currentStep, dynamicQuestions.length]);

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
    setSelectedSystem(system);
    setPacket(null);
    setPacketError(null);
    setGeneratedPdfUri(null);
    setTemplatePrefetchState('idle');
    setPrefetchedFormName(null);
    setTemplatePrefetchError(null);
    setPacketLoading(true);

    try {
      const nextPacket = await fetchRecordsRequestPacket(system.id);
      setPacket(nextPacket);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load that hospital workflow.';
      setPacketError(message);
      Alert.alert('Workflow Unavailable', message);
    } finally {
      setPacketLoading(false);
    }
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
      });

      setGeneratedPdfUri(result.uri);
      const appliedSummary =
        dynamicQuestions.length > 0
          ? 'Applied your bio and form answers'
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
        message: generatedPdfUri,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to share the PDF.';
      Alert.alert('Share Failed', message);
    }
  };

  const goToStep = (nextStep: RecordsRequestStepKey) => {
    startTransition(() => setCurrentStep(nextStep));
  };

  const handleContinueFromHospital = () => {
    if (!packetReadyForContinue) return;
    goToStep(dynamicQuestions.length > 0 ? 'form' : 'id');
  };

  const handleContinueFromForm = () => {
    const validationMessage = validateAutofillAnswers(dynamicQuestions, autofillAnswers);
    if (validationMessage) {
      Alert.alert('Answer Required', validationMessage);
      return;
    }

    goToStep('id');
  };

  const updateShortTextAnswer = (questionId: string, value: string) => {
    setAutofillAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionId]: value,
    }));
  };

  const updateSingleSelectAnswer = (questionId: string, optionId: string) => {
    setAutofillAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionId]: optionId,
    }));
  };

  const toggleMultiSelectAnswer = (questionId: string, optionId: string) => {
    setAutofillAnswers((currentAnswers) => {
      const existing = Array.isArray(currentAnswers[questionId]) ? currentAnswers[questionId] : [];
      const nextValue = existing.includes(optionId)
        ? existing.filter((value) => value !== optionId)
        : [...existing, optionId];

      return {
        ...currentAnswers,
        [questionId]: nextValue,
      };
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
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

        <View style={styles.stepperCard}>
          <Text style={styles.eyebrow}>Guided Workflow</Text>
          <Text style={styles.heroTitle}>Build a ready-to-send request packet.</Text>
          <Text style={styles.heroSubtitle}>
            We&apos;ll confirm your bio details, pull the selected hospital system workflow, check
            whether ID is needed, ask any form-specific questions we can confidently detect, and
            generate a PDF you can review or share.
          </Text>
          <View style={styles.stepperWrap}>
            <RequestStepper
              steps={workflowSteps.map((step) => step.label)}
              currentStep={currentStepIndex}
            />
          </View>
        </View>

        {currentStep === 'bio' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Step 1: Verify your personal info</Text>
            <Text style={styles.sectionBody}>
              This information will be used to prefill your medical-records request packet.
            </Text>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Full name</Text>
              <Text style={styles.summaryValue}>{profile.fullName}</Text>

              <Text style={styles.summaryLabel}>Date of birth</Text>
              <Text style={styles.summaryValue}>{profile.dateOfBirth}</Text>

              <Text style={styles.summaryLabel}>Mailing address</Text>
              <Text style={styles.summaryValue}>{formatMailingAddress(profile)}</Text>
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
                onPress={() => goToStep('hospital')}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              >
                <Text style={styles.primaryButtonText}>Looks Correct</Text>
              </Pressable>
            </View>
          </View>
        )}

        {currentStep === 'hospital' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Step 2: Choose the hospital system</Text>
            <Text style={styles.sectionBody}>
              Search the Texas system you want to request records from. We&apos;ll pull its workflow
              packet from the records API.
            </Text>

            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search hospital systems"
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
                  const isSelected = selectedSystem?.id === system.id;
                  return (
                    <Pressable
                      key={system.id}
                      onPress={() => handleSelectSystem(system)}
                      style={({ pressed }) => [
                        styles.systemCard,
                        isSelected && styles.systemCardSelected,
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
                  <Text style={styles.emptyStateText}>No hospital systems matched that search.</Text>
                )}
              </View>
            )}

            {selectedSystem && (
              <View style={styles.selectionSummary}>
                <Text style={styles.selectionSummaryTitle}>Selected system</Text>
                <Text style={styles.selectionSummaryName}>{selectedSystem.name}</Text>
                {packetLoading && (
                  <View style={styles.inlineLoading}>
                    <ActivityIndicator size="small" color={theme.colors.secondary} />
                    <Text style={styles.inlineLoadingText}>Loading workflow packet...</Text>
                  </View>
                )}
                {packetError && <Text style={styles.errorInlineText}>{packetError}</Text>}
                {packet && (
                  <>
                    <View style={styles.badgeRow}>
                      {(packet.medicalWorkflow?.availableMethods || []).map((method) => (
                        <View key={method} style={styles.methodBadge}>
                          <Text style={styles.methodBadgeText}>{formatMethodLabel(method)}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.selectionSummaryMeta}>
                      {packet.forms.length > 0
                        ? `${packet.forms.length} official form link${packet.forms.length === 1 ? '' : 's'} found`
                        : 'No official form links attached'}
                    </Text>
                    {templatePrefetchState === 'loading' && (
                      <Text style={styles.selectionSummaryMeta}>
                        Fetching the hospital PDF into memory for faster filling...
                      </Text>
                    )}
                    {templatePrefetchState === 'ready' && prefetchedFormName && (
                      <>
                        <Text style={styles.selectionSummaryMeta}>
                          Cached {prefetchedFormName} and kept it ready in memory.
                        </Text>
                        <Text style={styles.selectionSummaryMeta}>
                          {dynamicQuestions.length > 0
                            ? `Detected ${dynamicQuestions.length} additional form question${dynamicQuestions.length === 1 ? '' : 's'} for the next step.`
                            : 'No additional form questions were detected for this PDF.'}
                        </Text>
                      </>
                    )}
                    {templatePrefetchState === 'error' && templatePrefetchError && (
                      <Text style={styles.errorInlineText}>{templatePrefetchError}</Text>
                    )}
                  </>
                )}
              </View>
            )}

            <View style={styles.actionRow}>
              <Pressable
                onPress={() => goToStep('bio')}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>

              <Pressable
                onPress={handleContinueFromHospital}
                disabled={!packetReadyForContinue}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (!packetReadyForContinue || pressed) && styles.primaryButtonPressed,
                  !packetReadyForContinue && styles.disabledButton,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {dynamicQuestions.length > 0 ? 'Continue to Form Questions' : 'Continue to ID'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {currentStep === 'form' && packet && selectedPdfForm && dynamicQuestions.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              Step 3: Answer questions from {selectedPdfForm.name}
            </Text>
            <Text style={styles.sectionBody}>
              We detected high-confidence questions in the selected hospital form. Your answers
              here will be written back into that same PDF when you fill it.
            </Text>

            <View style={styles.requirementCard}>
              <Text style={styles.requirementTitle}>Selected form</Text>
              <Text style={styles.requirementBody}>{selectedPdfForm.name}</Text>
              <Text style={styles.requirementFootnote}>
                Autofill mode: {selectedPdfForm.autofill.mode || 'unknown'}
              </Text>
            </View>

            <View style={styles.questionList}>
              {dynamicQuestions.map((question) => {
                const currentAnswer = autofillAnswers[question.id];

                return (
                  <View key={question.id} style={styles.questionCard}>
                    <Text style={styles.questionLabel}>
                      {question.label}
                      {question.required ? ' *' : ''}
                    </Text>
                    {question.helpText ? (
                      <Text style={styles.questionHelp}>{question.helpText}</Text>
                    ) : null}

                    {question.kind === 'short_text' ? (
                      <TextInput
                        value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                        onChangeText={(value) => updateShortTextAnswer(question.id, value)}
                        placeholder="Type your answer"
                        placeholderTextColor={theme.colors.inputPlaceholder}
                        style={styles.answerInput}
                        autoCapitalize="sentences"
                      />
                    ) : (
                      <View style={styles.optionList}>
                        {question.options.map((option) => {
                          const isSelected =
                            question.kind === 'single_select'
                              ? currentAnswer === option.id
                              : Array.isArray(currentAnswer) && currentAnswer.includes(option.id);

                          return (
                            <Pressable
                              key={option.id}
                              onPress={() =>
                                question.kind === 'single_select'
                                  ? updateSingleSelectAnswer(question.id, option.id)
                                  : toggleMultiSelectAnswer(question.id, option.id)
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
                  </View>
                );
              })}
            </View>

            <View style={styles.actionRow}>
              <Pressable
                onPress={() => goToStep('hospital')}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>

              <Pressable
                onPress={handleContinueFromForm}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              >
                <Text style={styles.primaryButtonText}>Continue to ID</Text>
              </Pressable>
            </View>
          </View>
        )}

        {currentStep === 'id' && packet && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              Step {dynamicQuestions.length > 0 ? 4 : 3}: Add identification
            </Text>
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
                onPress={() => goToStep(dynamicQuestions.length > 0 ? 'form' : 'hospital')}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>

              <Pressable
                onPress={() => goToStep('submit')}
                disabled={!idStepCanContinue}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (!idStepCanContinue || pressed) && styles.primaryButtonPressed,
                  !idStepCanContinue && styles.disabledButton,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {packet.requiresPhotoId ? 'Continue to Submit' : 'Review Packet'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {currentStep === 'submit' && packet && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              Step {dynamicQuestions.length > 0 ? 5 : 4}: Fill out the selected form
            </Text>
            <Text style={styles.sectionBody}>
              The selected hospital PDF is fetched on this device first. When you tap below, we
              apply your bio to the correct fields, write any answers from the previous step back
              into the form, and append your ID image as an extra page if you attached one.
            </Text>

            <View style={styles.reviewSection}>
              <Text style={styles.reviewHeader}>Bio info</Text>
              <Text style={styles.reviewText}>{profile.fullName}</Text>
              <Text style={styles.reviewText}>{profile.dateOfBirth}</Text>
              <Text style={styles.reviewText}>{formatMailingAddress(profile)}</Text>
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
              <Text style={styles.reviewHeader}>Official forms</Text>
              {packet.forms.length > 0 ? (
                packet.forms.map((form) => (
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

            {selectedPdfForm && (
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
                    Your hospital PDF now has your bio{dynamicQuestions.length > 0 ? ' and form answers' : ''} applied and is ready to share, review, or save elsewhere on your device.
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
                onPress={() => goToStep('id')}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setCurrentStep('bio');
                  setGeneratedPdfUri(null);
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
  stepperWrap: {
    marginTop: 6,
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
  summaryLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  summaryValue: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  actionRow: {
    flexDirection: 'row',
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
    padding: 16,
    gap: 8,
  },
  selectionSummaryTitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  selectionSummaryName: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  selectionSummaryMeta: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodBadge: {
    backgroundColor: theme.colors.secondarySoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  methodBadgeText: {
    color: theme.colors.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  errorInlineText: {
    color: theme.colors.danger,
    fontSize: 14,
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
  questionList: {
    gap: 12,
  },
  questionCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  questionLabel: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  questionHelp: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
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
