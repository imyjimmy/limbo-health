// components/editors/MedicationForm.tsx
// Full-screen medication creation/editing form.
// Produces a complete MedicalDocument — callers just persist it.
// Moved from components/editor/MedicationEntryForm.tsx.

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { EditorProps } from '../registry/componentRegistry';
import { createThemedStyles, useTheme, useThemedStyles } from '../../theme';
import { DOSAGE_PRESETS, FREQUENCY_PRESETS } from '../../core/medication/options';
import {
  buildMedicationMarkdown,
  parseMedicationEntry,
} from '../../core/markdown/medicationEntry';

function isDosagePreset(value: string) {
  return DOSAGE_PRESETS.includes(value as (typeof DOSAGE_PRESETS)[number]);
}

export function MedicationForm({
  mode,
  doc,
  dirPath,
  categoryType,
  onSave,
  onCancel,
}: EditorProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  // Derive initial values from existing doc in edit mode
  const initialFields = useMemo(() => {
    if (mode !== 'edit' || !doc) return null;
    const parsed = parseMedicationEntry(doc.value);
    return parsed.fields;
  }, [mode, doc]);

  const [name, setName] = useState(() => initialFields?.name ?? '');
  const [dosage, setDosage] = useState(() => initialFields?.dosage ?? '');
  const [frequency, setFrequency] = useState(() => initialFields?.frequency ?? '');
  const [startDate, setStartDate] = useState(() => initialFields?.startDate ?? '');
  const [stopDate, setStopDate] = useState(() => initialFields?.stopDate ?? '');
  const [saving, setSaving] = useState(false);
  const [dosageMenuOpen, setDosageMenuOpen] = useState(false);
  const [showCustomDosageInput, setShowCustomDosageInput] = useState(() => {
    const initialDosage = initialFields?.dosage?.trim() ?? '';
    return initialDosage.length > 0 && !isDosagePreset(initialDosage);
  });

  const canSave = useMemo(
    () =>
      name.trim().length > 0 &&
      dosage.trim().length > 0 &&
      frequency.trim().length > 0 &&
      startDate.trim().length > 0,
    [name, dosage, frequency, startDate],
  );

  const confirmCancel = () => {
    Alert.alert(
      'Discard Medication?',
      'Your changes will be lost.',
      [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onCancel },
      ],
    );
  };

  const handleSave = async () => {
    if (!canSave) {
      Alert.alert('Missing Fields', 'Please fill out name, dosage, frequency, and start date.');
      return;
    }

    setSaving(true);
    try {
      const trimmedName = name.trim();
      const trimmedDosage = dosage.trim();
      const trimmedFrequency = frequency.trim();
      const trimmedStartDate = startDate.trim();
      const trimmedStopDate = stopDate.trim() || undefined;

      const timestamp = new Date().toISOString();
      const markdown = buildMedicationMarkdown({
        name: trimmedName,
        dosage: trimmedDosage,
        frequency: trimmedFrequency,
        startDate: trimmedStartDate,
        stopDate: trimmedStopDate,
      });

      const resultDoc = {
        value: markdown,
        metadata: {
          ...(doc?.metadata ?? {}),
          type: categoryType || 'medication',
          created: doc?.metadata?.created ?? timestamp,
          updated: timestamp,
          tags: categoryType ? [categoryType] : [],
        },
        children: doc?.children ?? [],
        renderer: 'MedicationSummary',
        editor: 'MedicationForm',
      };

      await onSave(resultDoc, []);
    } catch (error) {
      console.error('Medication save failed:', error);
      Alert.alert('Save Failed', 'Could not save medication. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={confirmCancel} disabled={saving} testID="medication-cancel">
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerPath} numberOfLines={1}>
          {dirPath}
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={saving || !canSave} testID="medication-save">
          {saving ? (
            <ActivityIndicator size="small" color={theme.colors.secondary} />
          ) : (
            <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.body}>
        <Text style={styles.title}>
          {mode === 'edit' ? 'Edit Medication' : 'Add Medication'}
        </Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Medication Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Tylenol (Acetaminophen)"
            placeholderTextColor={theme.colors.inputPlaceholder}
            autoCapitalize="words"
            returnKeyType="next"
            testID="medication-name-input"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Dosage</Text>
          <TouchableOpacity
            style={styles.selectInput}
            onPress={() => setDosageMenuOpen((open) => !open)}
            activeOpacity={0.7}
            testID="medication-dosage-select"
          >
            <Text
              style={[
                styles.selectInputText,
                !dosage && !showCustomDosageInput && styles.selectInputPlaceholder,
              ]}
            >
              {dosage || (showCustomDosageInput ? 'Custom dosage' : 'Select dosage')}
            </Text>
            <Text style={styles.selectChevron}>▾</Text>
          </TouchableOpacity>
          {dosageMenuOpen ? (
            <View style={styles.inlinePicker}>
              {DOSAGE_PRESETS.map((preset) => {
                const selected = dosage === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                    onPress={() => {
                      setDosage(preset);
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
                  if (isDosagePreset(dosage)) {
                    setDosage('');
                  }
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
              style={styles.input}
              value={dosage}
              onChangeText={setDosage}
              placeholder="Type custom dosage"
              placeholderTextColor={theme.colors.inputPlaceholder}
              autoCapitalize="none"
              returnKeyType="next"
              testID="medication-dosage-input"
            />
          ) : null}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Frequency</Text>
          <View style={styles.frequencyRow}>
            {FREQUENCY_PRESETS.map((preset) => {
              const selected = frequency === preset;
              return (
                <TouchableOpacity
                  key={preset}
                  style={[styles.presetChip, selected && styles.presetChipSelected]}
                  onPress={() => setFrequency(preset)}
                  activeOpacity={0.7}
                  testID={`medication-frequency-${preset.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <Text style={[styles.presetText, selected && styles.presetTextSelected]}>
                    {preset}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={styles.input}
            value={frequency}
            onChangeText={setFrequency}
            placeholder="Every 6 hours as needed"
            placeholderTextColor={theme.colors.inputPlaceholder}
            autoCapitalize="none"
            returnKeyType="next"
            testID="medication-frequency-input"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Started</Text>
          <TextInput
            style={styles.input}
            value={startDate}
            onChangeText={setStartDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.colors.inputPlaceholder}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            returnKeyType="next"
            testID="medication-start-date-input"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Stopped (Optional)</Text>
          <TextInput
            style={styles.input}
            value={stopDate}
            onChangeText={setStopDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.colors.inputPlaceholder}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            testID="medication-stop-date-input"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = createThemedStyles((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  cancelText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  headerPath: {
    flex: 1,
    marginHorizontal: 10,
    textAlign: 'center',
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.secondary,
  },
  saveTextDisabled: {
    color: theme.colors.textMuted,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 18,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.inputBackground,
  },
  selectInput: {
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: theme.colors.inputBackground,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  inlinePicker: {
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderRadius: 12,
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
