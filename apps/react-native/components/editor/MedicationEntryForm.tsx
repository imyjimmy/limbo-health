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

interface MedicationEntryFormProps {
  dirPath: string;
  onSave: (payload: { name: string; dosage: string; frequency: string }) => Promise<void>;
  onCancel: () => void;
}

const FREQUENCY_PRESETS = [
  'Once daily',
  'Twice daily',
  'Every 6 hours',
  'As needed',
] as const;

export function MedicationEntryForm({ dirPath, onSave, onCancel }: MedicationEntryFormProps) {
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = useMemo(
    () => name.trim().length > 0 && dosage.trim().length > 0 && frequency.trim().length > 0,
    [name, dosage, frequency],
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
      Alert.alert('Missing Fields', 'Please fill out name, dosage, and frequency.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        dosage: dosage.trim(),
        frequency: frequency.trim(),
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
        <Text style={styles.title}>Add Medication</Text>

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
          <TextInput
            style={styles.input}
            value={dosage}
            onChangeText={setDosage}
            placeholder="500 mg"
            placeholderTextColor="#9AA0A6"
            autoCapitalize="none"
            returnKeyType="next"
            testID="medication-dosage-input"
          />
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
            returnKeyType="done"
            testID="medication-frequency-input"
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
});
