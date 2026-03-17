// components/renderers/MedicationSummary.tsx
// Read-only medication card with optional inline editing.
// Extracted from the entry detail screen ([...entryPath].tsx).

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  LayoutAnimation,
} from 'react-native';
import type { RendererProps } from '../registry/componentRegistry';
import { createThemedStyles, useTheme, useThemedStyles } from '../../theme';
import {
  buildMedicationMarkdown,
  parseMedicationEntry,
} from '../../core/markdown/medicationEntry';
import { DOSAGE_PRESETS, FREQUENCY_PRESETS } from '../../core/medication/options';
import { extractTitle } from '../../core/binder/DocumentModel';

function isDosagePreset(value: string) {
  return DOSAGE_PRESETS.includes(value as (typeof DOSAGE_PRESETS)[number]);
}

function runTransitionAnimation() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

export function MedicationSummary({
  doc,
  editing = false,
  onSave,
  onCancelEdit,
  onRequestEdit,
  saving = false,
  saveRef,
}: RendererProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const title = extractTitle(doc);
  const medicationEntry = parseMedicationEntry(doc.value);
  const fields = medicationEntry?.fields;

  const [draft, setDraft] = useState({
    name: fields?.name || title,
    dosage: fields?.dosage || '',
    frequency: fields?.frequency || '',
    startDate: fields?.startDate || '',
    stopDate: fields?.stopDate || '',
  });
  const [dosageMenuOpen, setDosageMenuOpen] = useState(false);
  const [showCustomDosageInput, setShowCustomDosageInput] = useState(() => {
    const d = fields?.dosage || '';
    return d.length > 0 && !isDosagePreset(d);
  });

  // Reset draft when the doc changes externally (e.g. after save)
  useEffect(() => {
    if (editing) return;
    const nextDosage = fields?.dosage || '';
    setDraft({
      name: fields?.name || title,
      dosage: nextDosage,
      frequency: fields?.frequency || '',
      startDate: fields?.startDate || '',
      stopDate: fields?.stopDate || '',
    });
    setShowCustomDosageInput(nextDosage.length > 0 && !isDosagePreset(nextDosage));
    setDosageMenuOpen(false);
  }, [
    editing,
    fields?.dosage,
    fields?.frequency,
    fields?.name,
    fields?.startDate,
    fields?.stopDate,
    title,
  ]);

  const handleSave = useCallback(async () => {
    if (!onSave) return;

    const name = draft.name.trim();
    const dosage = draft.dosage.trim();
    const frequency = draft.frequency.trim();
    const startDate = draft.startDate.trim();
    const stopDate = draft.stopDate.trim();

    if (!name || !dosage || !frequency || !startDate) {
      Alert.alert('Missing Fields', 'Please fill out name, dosage, frequency, and start date.');
      return;
    }

    const updatedDoc = {
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
      renderer: 'MedicationSummary',
      editor: 'MedicationForm',
    };

    await onSave(updatedDoc);
  }, [doc, draft, onSave]);

  // Expose save handler so the parent header Save button can trigger it
  useEffect(() => {
    if (saveRef) {
      saveRef.current = editing ? handleSave : null;
    }
    return () => {
      if (saveRef) saveRef.current = null;
    };
  }, [editing, handleSave, saveRef]);

  return (
    <View style={styles.medicationSummary}>
      {editing ? (
        <TextInput
          style={styles.medicationNameInput}
          value={draft.name}
          onChangeText={(name) => setDraft((prev) => ({ ...prev, name }))}
          placeholder="Medication Name"
          placeholderTextColor={theme.colors.inputPlaceholder}
          autoCapitalize="words"
        />
      ) : (
        <TouchableOpacity
          style={styles.medicationNameShell}
          onPress={onRequestEdit}
          activeOpacity={0.7}
          disabled={!onRequestEdit}
        >
          <Text style={styles.medicationName}>
            {fields?.name || title}
          </Text>
        </TouchableOpacity>
      )}

      {/* Dosage */}
      <View style={styles.medicationRow}>
        <Text style={styles.medicationLabel}>Dosage</Text>
        {editing ? (
          <>
            <TouchableOpacity
              style={styles.selectInput}
              onPress={() => setDosageMenuOpen((open) => !open)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.selectInputText,
                  !draft.dosage && !showCustomDosageInput && styles.selectInputPlaceholder,
                ]}
              >
                {draft.dosage || (showCustomDosageInput ? 'Custom dosage' : 'Select dosage')}
              </Text>
              <Text style={styles.selectChevron}>▾</Text>
            </TouchableOpacity>
            {dosageMenuOpen ? (
              <View style={styles.inlinePicker}>
                {DOSAGE_PRESETS.map((preset) => {
                  const selected = draft.dosage === preset;
                  return (
                    <TouchableOpacity
                      key={preset}
                      style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                      onPress={() => {
                        setDraft((prev) => ({ ...prev, dosage: preset }));
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
                    setDraft((prev) => ({
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
                value={draft.dosage}
                onChangeText={(dosage) => setDraft((prev) => ({ ...prev, dosage }))}
                placeholder="Type custom dosage"
                placeholderTextColor={theme.colors.inputPlaceholder}
                autoCapitalize="none"
              />
            ) : null}
          </>
        ) : (
          <TouchableOpacity
            style={styles.medicationValueShell}
            onPress={onRequestEdit}
            activeOpacity={0.7}
            disabled={!onRequestEdit}
          >
            <Text style={styles.medicationValue}>
              {fields?.dosage || '—'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Frequency */}
      <View style={styles.medicationRow}>
        <Text style={styles.medicationLabel}>Frequency</Text>
        {editing ? (
          <>
            <View style={styles.frequencyRow}>
              {FREQUENCY_PRESETS.map((preset) => {
                const selected = draft.frequency === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.presetChip, selected && styles.presetChipSelected]}
                    onPress={() => setDraft((prev) => ({ ...prev, frequency: preset }))}
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
              value={draft.frequency}
              onChangeText={(frequency) => setDraft((prev) => ({ ...prev, frequency }))}
              placeholder="Or type custom frequency"
              placeholderTextColor={theme.colors.inputPlaceholder}
              autoCapitalize="none"
            />
          </>
        ) : (
          <TouchableOpacity
            style={styles.medicationValueShell}
            onPress={onRequestEdit}
            activeOpacity={0.7}
            disabled={!onRequestEdit}
          >
            <Text style={styles.medicationValue}>
              {fields?.frequency || '—'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Start Date */}
      <View style={styles.medicationRow}>
        <Text style={styles.medicationLabel}>Started</Text>
        {editing ? (
          <TextInput
            style={styles.medicationInput}
            value={draft.startDate}
            onChangeText={(startDate) => setDraft((prev) => ({ ...prev, startDate }))}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.colors.inputPlaceholder}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
        ) : (
          <TouchableOpacity
            style={styles.medicationValueShell}
            onPress={onRequestEdit}
            activeOpacity={0.7}
            disabled={!onRequestEdit}
          >
            <Text style={styles.medicationValue}>
              {fields?.startDate || '—'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stop Date */}
      <View style={styles.medicationRow}>
        <Text style={styles.medicationLabel}>Stopped</Text>
        {editing ? (
          <TextInput
            style={styles.medicationInput}
            value={draft.stopDate}
            onChangeText={(stopDate) => setDraft((prev) => ({ ...prev, stopDate }))}
            placeholder="YYYY-MM-DD (optional)"
            placeholderTextColor={theme.colors.inputPlaceholder}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
        ) : (
          <TouchableOpacity
            style={styles.medicationValueShell}
            onPress={onRequestEdit}
            activeOpacity={0.7}
            disabled={!onRequestEdit}
          >
            <Text style={styles.medicationValue}>
              {fields?.stopDate || '—'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const createStyles = createThemedStyles((theme) => ({
  medicationSummary: {
    gap: 10,
  },
  medicationName: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
  },
  medicationNameShell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
  },
  medicationNameInput: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.inputBackground,
  },
  medicationRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  medicationLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  medicationValue: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
  },
  medicationValueShell: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
    minHeight: 40,
    justifyContent: 'center',
  },
  medicationInput: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '500',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: theme.colors.inputBackground,
  },
  selectInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: theme.colors.inputBackground,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inlinePicker: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.inputBorder,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: theme.colors.surface,
  },
  selectInputText: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '500',
  },
  selectInputPlaceholder: {
    color: theme.colors.inputPlaceholder,
    fontWeight: '400',
  },
  selectChevron: {
    color: theme.colors.textMuted,
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
    borderColor: theme.colors.inputBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: theme.colors.surface,
  },
  presetChipSelected: {
    borderColor: theme.colors.secondary,
    backgroundColor: theme.colors.secondarySoft,
  },
  presetText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  presetTextSelected: {
    color: theme.colors.secondary,
    fontWeight: '600',
  },
  pickerRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  pickerRowSelected: {
    backgroundColor: theme.colors.secondarySoft,
  },
  pickerRowText: {
    fontSize: 15,
    color: theme.colors.text,
  },
  pickerRowTextSelected: {
    color: theme.colors.secondary,
    fontWeight: '600',
  },
}));
