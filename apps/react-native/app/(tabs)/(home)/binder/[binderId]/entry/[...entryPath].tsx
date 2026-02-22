// app/binder/[binderId]/entry/[...entryPath].tsx
// Entry detail screen: decrypt a .json document, render markdown, show children.

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { DebugOverlay } from '../../../../../../components/binder/DebugOverlay';
import type { MedicalDocument } from '../../../../../../types/document';
import { extractTitle } from '../../../../../../core/binder/DocumentModel';
import { BinderService } from '../../../../../../core/binder/BinderService';
import { useAuthContext } from '../../../../../../providers/AuthProvider';
import { useCryptoContext } from '../../../../../../providers/CryptoProvider';
import { parseMarkdownFrontMatter } from '../../../../../../core/markdown/frontmatter';
import {
  buildMedicationMarkdown,
  parseMedicationEntry,
} from '../../../../../../core/markdown/medicationEntry';
import { DOSAGE_PRESETS, FREQUENCY_PRESETS } from '../../../../../../core/medication/options';

function isDosagePreset(value: string) {
  return DOSAGE_PRESETS.includes(value as (typeof DOSAGE_PRESETS)[number]);
}

export default function EntryDetailScreen() {
  const { binderId, entryPath } = useLocalSearchParams<{
    binderId: string;
    entryPath: string[];
  }>();

  // Reconstruct path: could be catch-all array segments
  const rawPath = Array.isArray(entryPath)
    ? entryPath.join('/')
    : (entryPath ?? '');

  const [doc, setDoc] = useState<MedicalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingMedication, setEditingMedication] = useState(false);
  const [savingMedication, setSavingMedication] = useState(false);
  const [dosageMenuOpen, setDosageMenuOpen] = useState(false);
  const [showCustomDosageInput, setShowCustomDosageInput] = useState(false);
  const [medicationDraft, setMedicationDraft] = useState({
    name: '',
    dosage: '',
    frequency: '',
    startDate: '',
    stopDate: '',
  });

  const { state: authState } = useAuthContext();
  const { masterConversationKey } = useCryptoContext();
  const jwt = authState.status === 'authenticated' ? authState.jwt : null;

  const binderService = useMemo(() => {
    if (!masterConversationKey || !jwt || !binderId) return null;
    return new BinderService(
      {
        repoId: binderId,
        repoDir: `binders/${binderId}`,
        auth: { type: 'jwt' as const, token: jwt },
        author: {
          name: authState.metadata?.name || authState.googleProfile?.name || 'Limbo Health',
          email: authState.googleProfile?.email || 'app@limbo.health',
        },
      },
      masterConversationKey,
    );
  }, [binderId, masterConversationKey, jwt, authState.metadata?.name, authState.googleProfile?.name, authState.googleProfile?.email]);

  const router = useRouter();

  // Re-read document when screen regains focus (e.g., after editing)
  const [refreshCounter, setRefreshCounter] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setRefreshCounter((c) => c + 1);
    }, [])
  );

  useEffect(() => {
    if (!binderService || !rawPath) {
      setLoading(false);
      setError('Not ready');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await binderService.readEntry(rawPath);
        if (!cancelled) {
          setDoc(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to decrypt';
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [binderService, rawPath, refreshCounter]);

  const title = doc ? extractTitle(doc) : 'Entry';
  const displayBody = doc ? parseMarkdownFrontMatter(doc.value).body : '';
  const medicationEntry = doc ? parseMedicationEntry(doc.value) : null;
  const medicationFields = medicationEntry?.fields;
  const useMedicationAssetView = !!doc && (
    doc.editor === 'medication' ||
    (doc.metadata.type === 'medication' && !!medicationEntry?.isMedicationEntry)
  );

  useEffect(() => {
    if (!useMedicationAssetView || editingMedication) return;
    const nextDosage = medicationFields?.dosage || '';
    setMedicationDraft({
      name: medicationFields?.name || title,
      dosage: nextDosage,
      frequency: medicationFields?.frequency || '',
      startDate: medicationFields?.startDate || '',
      stopDate: medicationFields?.stopDate || '',
    });
    setShowCustomDosageInput(nextDosage.length > 0 && !isDosagePreset(nextDosage));
    setDosageMenuOpen(false);
  }, [
    editingMedication,
    medicationFields?.dosage,
    medicationFields?.frequency,
    medicationFields?.name,
    medicationFields?.startDate,
    medicationFields?.stopDate,
    title,
    useMedicationAssetView,
  ]);

  const handleEdit = useCallback(() => {
    if (useMedicationAssetView) {
      const nextDosage = medicationFields?.dosage || '';
      setMedicationDraft({
        name: medicationFields?.name || title,
        dosage: nextDosage,
        frequency: medicationFields?.frequency || '',
        startDate: medicationFields?.startDate || '',
        stopDate: medicationFields?.stopDate || '',
      });
      setShowCustomDosageInput(nextDosage.length > 0 && !isDosagePreset(nextDosage));
      setDosageMenuOpen(false);
      setEditingMedication(true);
      return;
    }

    router.push({
      pathname: '/(tabs)/(home)/binder/[binderId]/entry/edit',
      params: { binderId: binderId!, entryPath: rawPath },
    });
  }, [
    binderId,
    medicationFields?.dosage,
    medicationFields?.frequency,
    medicationFields?.name,
    medicationFields?.startDate,
    medicationFields?.stopDate,
    rawPath,
    router,
    title,
    useMedicationAssetView,
  ]);

  const handleCancelMedicationEdit = useCallback(() => {
    setEditingMedication(false);
    setDosageMenuOpen(false);
    const nextDosage = medicationFields?.dosage || '';
    setShowCustomDosageInput(nextDosage.length > 0 && !isDosagePreset(nextDosage));
    setMedicationDraft({
      name: medicationFields?.name || title,
      dosage: nextDosage,
      frequency: medicationFields?.frequency || '',
      startDate: medicationFields?.startDate || '',
      stopDate: medicationFields?.stopDate || '',
    });
  }, [
    medicationFields?.dosage,
    medicationFields?.frequency,
    medicationFields?.name,
    medicationFields?.startDate,
    medicationFields?.stopDate,
    title,
  ]);

  const handleSaveMedicationInPlace = useCallback(async () => {
    if (!doc || !binderService) return;

    const name = medicationDraft.name.trim();
    const dosage = medicationDraft.dosage.trim();
    const frequency = medicationDraft.frequency.trim();
    const startDate = medicationDraft.startDate.trim();
    const stopDate = medicationDraft.stopDate.trim();

    if (!name || !dosage || !frequency || !startDate) {
      Alert.alert('Missing Fields', 'Please fill out name, dosage, frequency, and start date.');
      return;
    }

    const updatedDoc: MedicalDocument = {
      ...doc,
      value: buildMedicationMarkdown({
        name,
        dosage,
        frequency,
        startDate,
        stopDate: stopDate || undefined,
      }),
      metadata: {
        ...doc.metadata,
        type: 'medication',
        updated: new Date().toISOString(),
      },
      renderer: 'medication',
      editor: 'medication',
    };

    setSavingMedication(true);
    try {
      await binderService.updateEntry(rawPath, updatedDoc);
      setDoc(updatedDoc);
      setDosageMenuOpen(false);
      setEditingMedication(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save medication';
      Alert.alert('Save Failed', message);
    } finally {
      setSavingMedication(false);
    }
  }, [
    binderService,
    doc,
    medicationDraft.dosage,
    medicationDraft.frequency,
    medicationDraft.name,
    medicationDraft.startDate,
    medicationDraft.stopDate,
    rawPath,
  ]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Decrypting...</Text>
        </View>
      </>
    );
  }

  if (error || !doc) {
    return (
      <>
        <Stack.Screen options={{ title: 'Error' }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Document not found'}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            useMedicationAssetView && editingMedication ? (
              <View style={styles.headerActions}>
                <TouchableOpacity onPress={handleCancelMedicationEdit} disabled={savingMedication}>
                  <Text style={styles.headerCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveMedicationInPlace} disabled={savingMedication}>
                  <Text style={styles.headerSave}>{savingMedication ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={handleEdit}>
                <Text style={styles.headerSave}>Edit</Text>
              </TouchableOpacity>
            )
          ),
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {/* Metadata bar */}
        <View style={styles.metaBar}>
          <Text style={styles.metaType}>{doc.metadata.type}</Text>
          <Text style={styles.metaDate}>
            {new Date(doc.metadata.created).toLocaleDateString()}
          </Text>
          {doc.metadata.updated && doc.metadata.updated !== doc.metadata.created ? (
            <Text style={styles.metaDate}>
              Updated {new Date(doc.metadata.updated).toLocaleDateString()}
            </Text>
          ) : null}
          {doc.metadata.provider ? (
            <Text style={styles.metaProvider}>{doc.metadata.provider}</Text>
          ) : null}
        </View>

        {/* Markdown body -- plain text for now, swap with MarkdownRenderer later */}
        <View style={styles.bodyContainer}>
          {useMedicationAssetView ? (
            <View style={styles.medicationSummary}>
              {editingMedication ? (
                <TextInput
                  style={styles.medicationNameInput}
                  value={medicationDraft.name}
                  onChangeText={(name) => setMedicationDraft((prev) => ({ ...prev, name }))}
                  placeholder="Medication Name"
                  placeholderTextColor="#8a95a4"
                  autoCapitalize="words"
                />
              ) : (
                <Text style={styles.medicationName}>
                  {medicationFields?.name || title}
                </Text>
              )}
              <View style={styles.medicationRow}>
                <Text style={styles.medicationLabel}>Dosage</Text>
                {editingMedication ? (
                  <>
                    <TouchableOpacity
                      style={styles.selectInput}
                      onPress={() => setDosageMenuOpen((open) => !open)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.selectInputText,
                          !medicationDraft.dosage && !showCustomDosageInput && styles.selectInputPlaceholder,
                        ]}
                      >
                        {medicationDraft.dosage || (showCustomDosageInput ? 'Custom dosage' : 'Select dosage')}
                      </Text>
                      <Text style={styles.selectChevron}>▾</Text>
                    </TouchableOpacity>
                    {dosageMenuOpen ? (
                      <View style={styles.inlinePicker}>
                        {DOSAGE_PRESETS.map((preset) => {
                          const selected = medicationDraft.dosage === preset;
                          return (
                            <TouchableOpacity
                              key={preset}
                              style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                              onPress={() => {
                                setMedicationDraft((prev) => ({ ...prev, dosage: preset }));
                                setShowCustomDosageInput(false);
                                setDosageMenuOpen(false);
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.pickerRowText, selected && styles.pickerRowTextSelected]}>
                                {preset}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        <TouchableOpacity
                          style={[styles.pickerRow, showCustomDosageInput && styles.pickerRowSelected]}
                          onPress={() => {
                            setShowCustomDosageInput(true);
                            setDosageMenuOpen(false);
                            setMedicationDraft((prev) => ({
                              ...prev,
                              dosage: isDosagePreset(prev.dosage) ? '' : prev.dosage,
                            }));
                          }}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.pickerRowText,
                              showCustomDosageInput && styles.pickerRowTextSelected,
                            ]}
                          >
                            Custom dosage...
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    {showCustomDosageInput ? (
                      <TextInput
                        style={styles.medicationInput}
                        value={medicationDraft.dosage}
                        onChangeText={(dosage) => setMedicationDraft((prev) => ({ ...prev, dosage }))}
                        placeholder="Type custom dosage"
                        placeholderTextColor="#8a95a4"
                        autoCapitalize="none"
                      />
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.medicationValue}>
                    {medicationFields?.dosage || '—'}
                  </Text>
                )}
              </View>
              <View style={styles.medicationRow}>
                <Text style={styles.medicationLabel}>Frequency</Text>
                {editingMedication ? (
                  <>
                    <View style={styles.frequencyRow}>
                      {FREQUENCY_PRESETS.map((preset) => {
                        const selected = medicationDraft.frequency === preset;
                        return (
                          <TouchableOpacity
                            key={preset}
                            style={[styles.presetChip, selected && styles.presetChipSelected]}
                            onPress={() => setMedicationDraft((prev) => ({ ...prev, frequency: preset }))}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.presetText, selected && styles.presetTextSelected]}>
                              {preset}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <TextInput
                      style={styles.medicationInput}
                      value={medicationDraft.frequency}
                      onChangeText={(frequency) => setMedicationDraft((prev) => ({ ...prev, frequency }))}
                      placeholder="Or type custom frequency"
                      placeholderTextColor="#8a95a4"
                      autoCapitalize="none"
                    />
                  </>
                ) : (
                  <Text style={styles.medicationValue}>
                    {medicationFields?.frequency || '—'}
                  </Text>
                )}
              </View>
              <View style={styles.medicationRow}>
                <Text style={styles.medicationLabel}>Started</Text>
                {editingMedication ? (
                  <TextInput
                    style={styles.medicationInput}
                    value={medicationDraft.startDate}
                    onChangeText={(startDate) => setMedicationDraft((prev) => ({ ...prev, startDate }))}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#8a95a4"
                    autoCapitalize="none"
                    keyboardType="numbers-and-punctuation"
                  />
                ) : (
                  <Text style={styles.medicationValue}>
                    {medicationFields?.startDate || '—'}
                  </Text>
                )}
              </View>
              <View style={styles.medicationRow}>
                <Text style={styles.medicationLabel}>Stopped</Text>
                {editingMedication ? (
                  <TextInput
                    style={styles.medicationInput}
                    value={medicationDraft.stopDate}
                    onChangeText={(stopDate) => setMedicationDraft((prev) => ({ ...prev, stopDate }))}
                    placeholder="YYYY-MM-DD (optional)"
                    placeholderTextColor="#8a95a4"
                    autoCapitalize="none"
                    keyboardType="numbers-and-punctuation"
                  />
                ) : (
                  <Text style={styles.medicationValue}>
                    {medicationFields?.stopDate || '—'}
                  </Text>
                )}
              </View>
            </View>
          ) : (
            <Text style={styles.bodyText}>{displayBody}</Text>
          )}
        </View>

        {/* Children (addendums, attachments) */}
        {doc.children.length > 0 && (
          <View style={styles.childrenSection}>
            <Text style={styles.childrenHeader}>
              {doc.children.length} attachment{doc.children.length > 1 ? 's' : ''}
            </Text>
            {doc.children.map((child, idx) => (
              <ChildCard key={idx} child={child} index={idx} />
            ))}
          </View>
        )}
      </ScrollView>

      <DebugOverlay
        data={doc}
        loadExtra={() =>
          binderService?.listAllFiles() ?? Promise.resolve([])
        }
        extraLabel="All Files"
      />
    </>
  );
}

function ChildCard({
  child,
  index,
}: {
  child: MedicalDocument;
  index: number;
}) {
  const isAttachment =
    child.metadata.type === 'attachment' ||
    child.metadata.type === 'attachment_ref';
  const label = isAttachment
    ? `${child.metadata.format?.toUpperCase() ?? 'File'} attachment`
    : extractTitle(child);

  return (
    <View style={styles.childCard}>
      <Text style={styles.childIndex}>{index + 1}</Text>
      <View style={styles.childContent}>
        <Text style={styles.childLabel}>{label}</Text>
        {isAttachment && child.metadata.originalSizeBytes ? (
          <Text style={styles.childMeta}>
            {formatBytes(child.metadata.originalSizeBytes)}
          </Text>
        ) : null}
        {!isAttachment ? (
          <Text style={styles.childPreview} numberOfLines={2}>
            {child.value.slice(0, 120)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fafafa' },
  content: { paddingBottom: 40 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: { marginTop: 12, fontSize: 14, color: '#888' },
  errorText: { fontSize: 15, color: '#c00', textAlign: 'center' },
  headerActions: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  headerSave: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerCancel: {
    color: '#7e8795',
    fontSize: 15,
    fontWeight: '500',
  },
  metaBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  metaType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a73e8',
    textTransform: 'uppercase',
  },
  metaDate: { fontSize: 12, color: '#888' },
  metaProvider: { fontSize: 12, color: '#888' },
  bodyContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 8,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
  },
  medicationSummary: {
    gap: 10,
  },
  medicationName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1b2635',
  },
  medicationNameInput: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1b2635',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d6deea',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  medicationRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#dde4ed',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f8fbff',
  },
  medicationLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5a6a82',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  medicationValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#14243a',
  },
  medicationInput: {
    fontSize: 16,
    color: '#14243a',
    fontWeight: '500',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d3dce9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  selectInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d3dce9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inlinePicker: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d3dce9',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  selectInputText: {
    fontSize: 16,
    color: '#14243a',
    fontWeight: '500',
  },
  selectInputPlaceholder: {
    color: '#8a95a4',
    fontWeight: '400',
  },
  selectChevron: {
    color: '#7f8792',
    fontSize: 16,
  },
  frequencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  presetChip: {
    borderWidth: 1,
    borderColor: '#D8DDE3',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FFF',
  },
  presetChipSelected: {
    borderColor: '#87B8F9',
    backgroundColor: '#EAF3FF',
  },
  presetText: {
    color: '#4F5A67',
    fontSize: 13,
    fontWeight: '500',
  },
  presetTextSelected: {
    color: '#0B63CE',
    fontWeight: '600',
  },
  pickerRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e8e8e8',
  },
  pickerRowSelected: {
    backgroundColor: '#EAF3FF',
  },
  pickerRowText: {
    fontSize: 15,
    color: '#222',
  },
  pickerRowTextSelected: {
    color: '#0B63CE',
    fontWeight: '600',
  },
  childrenSection: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  childrenHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  childCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
  },
  childIndex: {
    width: 24,
    fontSize: 14,
    fontWeight: '600',
    color: '#aaa',
  },
  childContent: { flex: 1 },
  childLabel: { fontSize: 14, fontWeight: '500', color: '#333' },
  childMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  childPreview: { fontSize: 13, color: '#666', marginTop: 4 },
});
