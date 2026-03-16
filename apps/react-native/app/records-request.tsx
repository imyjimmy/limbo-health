import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
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
  StyleSheet,
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
import { generateRecordsRequestPdf } from '../core/recordsWorkflow/pdf';
import { useCamera } from '../hooks/useCamera';
import { useBioProfile } from '../providers/BioProfileProvider';
import { formatMailingAddress } from '../types/bio';
import type {
  HospitalSystemOption,
  RecordsRequestIdAttachment,
  RecordsRequestPacket,
} from '../types/recordsRequest';

const STEPS = ['Bio', 'Hospital', 'ID', 'Submit'];

function formatMethodLabel(method: string): string {
  return method
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export default function RecordsRequestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { capture } = useCamera();
  const { status: bioStatus, profile, hasProfile } = useBioProfile();
  const [currentStep, setCurrentStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
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

  useEffect(() => {
    let cancelled = false;

    async function loadSystems() {
      setSystemsLoading(true);
      setSystemsError(null);

      try {
        const results = await fetchHospitalSystems();
        if (!cancelled) {
          setSystems(results);
        }
      } catch (error) {
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
    };
  }, []);

  const filteredSystems = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    if (!query) return systems;

    return systems.filter((system) => {
      return [system.name, system.domain ?? '', system.state]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [deferredSearchQuery, systems]);

  if (bioStatus === 'loading') {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#2563EB" />
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
      });

      setGeneratedPdfUri(result.uri);
      Alert.alert(
        'Filled PDF Ready',
        `Filled ${result.formName} with ${result.filledFieldCount} bio field${result.filledFieldCount === 1 ? '' : 's'}.`,
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

  const goToStep = (nextStep: number) => {
    startTransition(() => setCurrentStep(nextStep));
  };

  const packetReadyForContinue = Boolean(selectedSystem && packet && !packetLoading && !packetError);
  const idStepCanContinue = Boolean(packet && (!packet.requiresPhotoId || idAttachment));

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
            whether ID is needed, and generate a PDF you can review or share.
          </Text>
          <View style={styles.stepperWrap}>
            <RequestStepper steps={STEPS} currentStep={currentStep} />
          </View>
        </View>

        {currentStep === 0 && (
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
                onPress={() => goToStep(1)}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
              >
                <Text style={styles.primaryButtonText}>Looks Correct</Text>
              </Pressable>
            </View>
          </View>
        )}

        {currentStep === 1 && (
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
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
              autoCapitalize="words"
              returnKeyType="search"
            />

            {systemsLoading ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.inlineLoadingText}>Loading systems...</Text>
              </View>
            ) : systemsError ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Unable to load systems</Text>
                <Text style={styles.errorBody}>{systemsError}</Text>
              </View>
            ) : (
              <View style={styles.systemList}>
                {filteredSystems.map((system) => {
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

                {filteredSystems.length === 0 && (
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
                    <ActivityIndicator size="small" color="#2563EB" />
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
                  </>
                )}
              </View>
            )}

            <View style={styles.actionRow}>
              <Pressable
                onPress={() => goToStep(0)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>

              <Pressable
                onPress={() => goToStep(2)}
                disabled={!packetReadyForContinue}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (!packetReadyForContinue || pressed) && styles.primaryButtonPressed,
                  !packetReadyForContinue && styles.disabledButton,
                ]}
              >
                <Text style={styles.primaryButtonText}>Continue to ID</Text>
              </Pressable>
            </View>
          </View>
        )}

        {currentStep === 2 && packet && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Step 3: Add identification</Text>
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
                onPress={() => goToStep(1)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>

              <Pressable
                onPress={() => goToStep(3)}
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

        {currentStep === 3 && packet && (
          <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Step 4: Review and generate PDF</Text>
          <Text style={styles.sectionBody}>
            We&apos;ll fill the selected hospital PDF locally on this device using your personal info
            and append your ID image as an extra page if you attached one.
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
                    onPress={() => Linking.openURL(form.url)}
                    style={({ pressed }) => [styles.linkRow, pressed && styles.systemCardPressed]}
                  >
                    <Text style={styles.linkText}>{form.name}</Text>
                    <Text style={styles.linkMeta}>{form.format?.toUpperCase() || 'LINK'}</Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.reviewMuted}>No official form URLs were attached to this system.</Text>
              )}
            </View>

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
                disabled={submitting}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.fullWidthButton,
                  (pressed || submitting) && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {submitting ? 'Filling PDF...' : 'Generate Filled Hospital PDF'}
                </Text>
              </Pressable>

              {generatedPdfUri && (
                <View style={styles.successCard}>
                  <Text style={styles.successTitle}>Filled PDF generated</Text>
                  <Text style={styles.successBody}>
                    Your filled hospital form is ready to share, review, or save elsewhere on your device.
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
                onPress={() => goToStep(2)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setCurrentStep(0);
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
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
    color: '#2563EB',
    fontSize: 15,
    fontWeight: '600',
  },
  backButtonSpacer: {
    minWidth: 56,
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '700',
  },
  stepperCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  eyebrow: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#0F172A',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  heroSubtitle: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 23,
  },
  stepperWrap: {
    marginTop: 6,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 16,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  sectionBody: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
  },
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  summaryLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  summaryValue: {
    color: '#0F172A',
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
    backgroundColor: '#0F766E',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  primaryButtonPressed: {
    opacity: 0.86,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  secondaryButtonPressed: {
    opacity: 0.88,
  },
  secondaryButtonText: {
    color: '#1D4ED8',
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
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#0F172A',
    fontSize: 16,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inlineLoadingText: {
    color: '#475569',
    fontSize: 14,
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 6,
  },
  errorTitle: {
    color: '#991B1B',
    fontSize: 15,
    fontWeight: '700',
  },
  errorBody: {
    color: '#B91C1C',
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
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  systemCardSelected: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  systemCardPressed: {
    opacity: 0.86,
  },
  systemTextWrap: {
    flex: 1,
    gap: 4,
  },
  systemName: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  systemMeta: {
    color: '#64748B',
    fontSize: 13,
  },
  emptyStateText: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 8,
  },
  selectionSummary: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  selectionSummaryTitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  selectionSummaryName: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '700',
  },
  selectionSummaryMeta: {
    color: '#475569',
    fontSize: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodBadge: {
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  methodBadgeText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
  },
  errorInlineText: {
    color: '#B91C1C',
    fontSize: 14,
  },
  requirementCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: 8,
  },
  requirementTitle: {
    color: '#92400E',
    fontSize: 18,
    fontWeight: '700',
  },
  requirementBody: {
    color: '#78350F',
    fontSize: 15,
    fontWeight: '600',
  },
  requirementFootnote: {
    color: '#92400E',
    fontSize: 14,
    lineHeight: 20,
  },
  previewCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  previewTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  previewImage: {
    width: '100%',
    height: 210,
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
  },
  previewMeta: {
    color: '#64748B',
    fontSize: 13,
  },
  reviewSection: {
    gap: 8,
  },
  reviewHeader: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  reviewText: {
    color: '#0F172A',
    fontSize: 15,
    lineHeight: 22,
  },
  reviewMuted: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  linkText: {
    color: '#1D4ED8',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  linkMeta: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  instructionBullet: {
    color: '#0F766E',
    fontSize: 14,
    fontWeight: '700',
    width: 14,
  },
  instructionText: {
    flex: 1,
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
  },
  successCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 10,
  },
  successTitle: {
    color: '#065F46',
    fontSize: 16,
    fontWeight: '700',
  },
  successBody: {
    color: '#047857',
    fontSize: 14,
    lineHeight: 20,
  },
});
