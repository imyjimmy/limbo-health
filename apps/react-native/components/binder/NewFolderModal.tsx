// components/binder/NewFolderModal.tsx
// Modal for creating a new subfolder (e.g., a new condition).
// Name (required), icon (optional), color (optional).

import React, { useEffect, useMemo, useState } from 'react';
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
import {
  ALLOWED_FOLDER_COLORS,
  DEFAULT_FOLDER_COLOR,
  FOLDER_EMOJI_OPTIONS,
} from './folderAppearance';
import { BinderSpine } from './BinderSpine';

interface NewFolderModalProps {
  visible: boolean;
  title: string; // e.g. "New Condition"
  initialName?: string;
  defaultEmoji?: string;
  defaultColor?: string;
  onConfirm: (name: string, emoji: string, color: string) => void;
  onCancel: () => void;
}

export function NewFolderModal({
  visible,
  title,
  initialName = '',
  defaultEmoji = '📁',
  defaultColor = DEFAULT_FOLDER_COLOR,
  onConfirm,
  onCancel,
}: NewFolderModalProps) {
  const [name, setName] = useState(initialName);
  const [selectedEmoji, setSelectedEmoji] = useState(defaultEmoji);
  const [selectedColor, setSelectedColor] = useState(defaultColor);

  const colorOptions = useMemo(
    () => (ALLOWED_FOLDER_COLORS.includes(defaultColor) ? ALLOWED_FOLDER_COLORS : [defaultColor, ...ALLOWED_FOLDER_COLORS]),
    [defaultColor],
  );

  useEffect(() => {
    if (!visible) return;
    setName(initialName);
    setSelectedEmoji(defaultEmoji);
    setSelectedColor(defaultColor);
  }, [visible, initialName, defaultEmoji, defaultColor]);

  const trimmedName = name.trim();

  const handleConfirm = () => {
    if (!trimmedName) return;
    onConfirm(trimmedName, selectedEmoji, selectedColor);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerSide} onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity
            style={[styles.headerSide, styles.doneButton, !trimmedName && styles.doneButtonDisabled]}
            onPress={handleConfirm}
            disabled={!trimmedName}
            activeOpacity={0.8}
          >
            <Text style={[styles.doneText, !trimmedName && styles.doneTextDisabled]}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.previewCard}>
            <View style={styles.previewPaper} pointerEvents="none">
              <View style={[styles.previewRule, styles.previewRuleTop]} />
              <View style={[styles.previewRule, styles.previewRuleMid]} />
              <View style={[styles.previewRule, styles.previewRuleBottom]} />
              <View style={styles.previewMargin} />
            </View>
            <BinderSpine
              style={styles.previewSpine}
              width={14}
              holeSize={6}
              interval={8}
              verticalPadding={9}
              minVisibleHoles={3}
            />
            <View style={styles.previewRow}>
              <View style={[styles.previewIcon, { backgroundColor: selectedColor + '2B' }]}>
                <Text style={styles.previewEmoji}>{selectedEmoji}</Text>
              </View>
              <View style={styles.previewTextCol}>
                <Text style={styles.previewName} numberOfLines={1}>
                  {trimmedName || 'Name...'}
                </Text>
                <Text style={styles.previewCaption}>Folder preview</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Name</Text>
          <View style={styles.sectionCard}>
            <TextInput
              style={styles.nameInput}
              placeholder="Folder name"
              placeholderTextColor="#8D95A3"
              value={name}
              onChangeText={setName}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="done"
            />
          </View>

          <Text style={styles.sectionLabel}>Icon</Text>
          <View style={styles.sectionCard}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.pickerRow}
              contentContainerStyle={styles.pickerContent}
            >
              {FOLDER_EMOJI_OPTIONS.map((emojiOption, index) => (
                <TouchableOpacity
                  key={`${emojiOption}-${index}`}
                  style={[
                    styles.emojiOption,
                    selectedEmoji === emojiOption && styles.emojiSelected,
                  ]}
                  onPress={() => setSelectedEmoji(emojiOption)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.emojiText}>{emojiOption}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <Text style={styles.sectionLabel}>Color</Text>
          <View style={styles.sectionCard}>
            <View style={styles.colorRow}>
              {colorOptions.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color },
                    selectedColor === color && styles.colorSelected,
                  ]}
                  onPress={() => setSelectedColor(color)}
                  activeOpacity={0.85}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF1F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(42, 56, 78, 0.16)',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  headerSide: {
    minWidth: 76,
    paddingVertical: 4,
  },
  cancelText: {
    fontSize: 17,
    color: '#5D6674',
    fontWeight: '500',
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    color: '#1F2D3D',
  },
  doneButton: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 122, 255, 0.42)',
    backgroundColor: 'rgba(229, 240, 255, 0.7)',
  },
  doneButtonDisabled: {
    borderColor: 'rgba(141, 149, 163, 0.28)',
    backgroundColor: 'rgba(141, 149, 163, 0.14)',
  },
  doneText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#006FEC',
  },
  doneTextDisabled: {
    color: '#9BA4B3',
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
  },
  bodyContent: {
    paddingTop: 14,
    paddingBottom: 28,
  },
  previewCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#FEFCF6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(74, 63, 52, 0.22)',
    marginBottom: 8,
    shadowColor: '#203040',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  previewPaper: {
    ...StyleSheet.absoluteFillObject,
  },
  previewRule: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(105, 154, 205, 0.2)',
  },
  previewRuleTop: {
    top: 24,
  },
  previewRuleMid: {
    top: 48,
  },
  previewRuleBottom: {
    top: 72,
  },
  previewMargin: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 44,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(212, 95, 110, 0.34)',
  },
  previewSpine: {
    // BinderSpine provides geometry and paint.
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  previewIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(74, 63, 52, 0.16)',
  },
  previewEmoji: {
    fontSize: 26,
  },
  previewTextCol: {
    flex: 1,
  },
  previewName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1D2B3A',
  },
  previewCaption: {
    marginTop: 4,
    fontSize: 13,
    color: '#6D7787',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#707B89',
    textTransform: 'uppercase',
    letterSpacing: 0.75,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(42, 56, 78, 0.14)',
    padding: 10,
  },
  nameInput: {
    fontSize: 18,
    color: '#1D2B3A',
    backgroundColor: 'rgba(243, 246, 250, 0.9)',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(42, 56, 78, 0.14)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerRow: {
    maxHeight: 52,
  },
  pickerContent: {
    gap: 8,
    paddingVertical: 2,
    paddingRight: 4,
  },
  emojiOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EEF1F5',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(42, 56, 78, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiSelected: {
    borderWidth: 2,
    borderColor: '#007AFF',
    backgroundColor: '#E6F0FF',
  },
  emojiText: {
    fontSize: 22,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    paddingVertical: 2,
  },
  colorOption: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(42, 56, 78, 0.2)',
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: '#1D2B3A',
    shadowColor: '#1D2B3A',
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
});
