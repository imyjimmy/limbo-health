// components/binder/NewFolderModal.tsx
// Modal for creating a new subfolder (e.g., a new condition).
// Name (required), icon (optional), color (optional).

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

const EMOJI_OPTIONS = [
  '❤️‍🩹', '🩺', '🧪', '💊', '💉', '⚠️', '🔬', '📷', '📄',
  '🦴', '🧠', '👁️', '🦷', '👂', '🫁', '🫀', '🩻', '🩹',
  '🏥', '🚑', '💊', '🧬', '🦠', '🩸', '🌡️', '😷', '🤒',
];

const COLOR_OPTIONS = [
  '#E74C3C', '#E67E22', '#F1C40F', '#27AE60', '#16A085',
  '#4A90D9', '#5B6ABF', '#8E44AD', '#7F8C8D', '#566573',
];

interface NewFolderModalProps {
  visible: boolean;
  title: string; // e.g. "New Condition"
  defaultEmoji?: string;
  defaultColor?: string;
  onConfirm: (name: string, emoji: string, color: string) => void;
  onCancel: () => void;
}

export function NewFolderModal({
  visible,
  title,
  defaultEmoji = '📁',
  defaultColor = '#7F8C8D',
  onConfirm,
  onCancel,
}: NewFolderModalProps) {
  const [name, setName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState(defaultEmoji);
  const [selectedColor, setSelectedColor] = useState(defaultColor);

  const handleConfirm = () => {
    if (!name.trim()) return;
    onConfirm(name.trim(), selectedEmoji, selectedColor);
    setName('');
    setSelectedEmoji(defaultEmoji);
    setSelectedColor(defaultColor);
  };

  const handleCancel = () => {
    setName('');
    setSelectedEmoji(defaultEmoji);
    setSelectedColor(defaultColor);
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={handleConfirm} disabled={!name.trim()}>
            <Text style={[styles.doneText, !name.trim() && styles.doneDisabled]}>
              Done
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
          {/* Preview */}
          <View style={styles.previewRow}>
            <View style={[styles.previewIcon, { backgroundColor: selectedColor + '22' }]}>
              <Text style={styles.previewEmoji}>{selectedEmoji}</Text>
            </View>
            <Text style={styles.previewName} numberOfLines={1}>
              {name || 'Name...'}
            </Text>
          </View>

          {/* Name input */}
          <Text style={styles.sectionLabel}>Name</Text>
          <TextInput
            style={styles.nameInput}
            placeholder="e.g. Back Acne"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="done"
          />

          {/* Icon picker */}
          <Text style={styles.sectionLabel}>Icon</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pickerRow}
            contentContainerStyle={styles.pickerContent}
          >
            {EMOJI_OPTIONS.map((e, i) => (
              <TouchableOpacity
                key={`${e}-${i}`}
                style={[
                  styles.emojiOption,
                  selectedEmoji === e && styles.emojiSelected,
                ]}
                onPress={() => setSelectedEmoji(e)}
              >
                <Text style={styles.emojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Color picker */}
          <Text style={styles.sectionLabel}>Color</Text>
          <View style={styles.colorRow}>
            {COLOR_OPTIONS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.colorOption,
                  { backgroundColor: c },
                  selectedColor === c && styles.colorSelected,
                ]}
                onPress={() => setSelectedColor(c)}
              />
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  cancelText: {
    fontSize: 16,
    color: '#666',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  doneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  doneDisabled: {
    color: '#ccc',
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  previewIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewEmoji: {
    fontSize: 24,
  },
  previewName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  nameInput: {
    fontSize: 17,
    color: '#1a1a1a',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerRow: {
    maxHeight: 52,
  },
  pickerContent: {
    gap: 8,
    paddingVertical: 4,
  },
  emojiOption: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiSelected: {
    backgroundColor: '#E0EDFF',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  emojiText: {
    fontSize: 22,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 4,
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: '#1a1a1a',
  },
});
