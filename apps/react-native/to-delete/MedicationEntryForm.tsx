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
import { DOSAGE_PRESETS, FREQUENCY_PRESETS } from '../../core/medication/options';

interface MedicationEntryFormProps {
  dirPath: string;
  onSave: (payload: {
    name: string;
    dosage: string;
    frequency: string;
    startDate: string;
    stopDate?: string;
  }) => Promise<void>;
  onCancel: () => void;
  initialValues?: Partial<{
    name: string;
    dosage: string;
    frequency: string;
    startDate: string;
    stopDate: string;
  }>;
  mode?: 'create' | 'edit';
}

function isDosagePreset(value: string) {
  return DOSAGE_PRESETS.includes(value as (typeof DOSAGE_PRESETS)[number]);
}

export function MedicationEntryForm({
  dirPath,
  onSave,
  onCancel,
  initialValues,
  mode = 'create',
}: MedicationEntryFormProps) {
  const [name, setName] = useState(() => initialValues?.name ?? '');
  const [dosage, setDosage] = useState(() => initialValues?.dosage ?? '');
  const [frequency, setFrequency] = useState(() => initialValues?.frequency ?? '');
  const [startDate, setStartDate] = useState(() => initialValues?.startDate ?? '');
  const [stopDate, setStopDate] = useState(() => initialValues?.stopDate ?? '');
  const [saving, setSaving] = useState(false);
  const [dosageMenuOpen, setDosageMenuOpen] = useState(false);
  const [showCustomDosageInput, setShowCustomDosageInput] = useState(() => {
    const initialDosage = initialValues?.dosage?.trim() ?? '';
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
      await onSave({
        name: name.trim(),
        dosage: dosage.trim(),
        frequency: frequency.trim(),
        startDate: startDate.trim(),
        stopDate: stopDate.trim() || undefined,
      });
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
            <ActivityIndicator size="small" color="#007AFF" />
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
            placeholderTextColor="#9AA0A6"
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
              placeholderTextColor="#9AA0A6"
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
            placeholderTextColor="#9AA0A6"
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
            placeholderTextColor="#9AA0A6"
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
            placeholderTextColor="#9AA0A6"
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E5E7',
    backgroundColor: '#FAFAFA',
  },
  cancelText: {
    fontSize: 16,
    color: '#666',
  },
  headerPath: {
    flex: 1,
    marginHorizontal: 10,
    textAlign: 'center',
    fontSize: 13,
    color: '#889099',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  saveTextDisabled: {
    color: '#B8BDC6',
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    marginBottom: 18,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5C6570',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D8DDE3',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#FFF',
  },
  selectInput: {
    borderWidth: 1,
    borderColor: '#D8DDE3',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  inlinePicker: {
    borderWidth: 1,
    borderColor: '#D8DDE3',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: '#FFF',
  },
  selectInputText: {
    fontSize: 16,
    color: '#111',
    fontWeight: '500',
  },
  selectInputPlaceholder: {
    color: '#9AA0A6',
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
});
