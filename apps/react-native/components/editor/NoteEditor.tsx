// components/editor/NoteEditor.tsx

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  RichText,
  Toolbar,
  useEditorBridge,
  TenTapStartKit,
} from '@10play/tentap-editor';
import { editorHtml } from '../../editor-web/build/editorHtml';
import { MarkdownBridge } from '../../core/editor/MarkdownBridge';
import {
  AttachmentList,
  buildAttachmentChildren,
  type PendingSidecar,
} from './AttachmentList';
import type { MedicalDocument } from '../../types/document';

interface NoteEditorProps {
  /** Directory path where the note will be saved, e.g. "visits/" or "conditions/back-acne/" */
  dirPath: string;
  /** Category type for metadata, e.g. "visit", "lab", "condition" */
  categoryType: string;
  /** Existing document when editing (undefined for new notes) */
  initialDoc?: MedicalDocument;
  /** Called with the assembled document + sidecars when user saves */
  onSave: (doc: MedicalDocument, sidecars: PendingSidecar[]) => Promise<void>;
  /** Called when user cancels / goes back */
  onCancel: () => void;
}

export function NoteEditor({
  dirPath,
  categoryType,
  initialDoc,
  onSave,
  onCancel,
}: NoteEditorProps) {
  const [title, setTitle] = useState(() => {
    if (initialDoc?.value) {
      const match = initialDoc.value.match(/^#\s+(.+)$/m);
      return match ? match[1] : '';
    }
    return '';
  });

  const [attachments, setAttachments] = useState<PendingSidecar[]>([]);
  const [saving, setSaving] = useState(false);

  const editor = useEditorBridge({
    customSource: editorHtml,
    autofocus: !initialDoc,
    avoidIosKeyboard: true,
    bridgeExtensions: [...TenTapStartKit, MarkdownBridge],
  });

  // Load existing markdown content after editor mounts
  useEffect(() => {
    if (initialDoc?.value) {
      const bodyMarkdown = initialDoc.value.replace(/^#\s+.+\n*/, '').trim();
      if (bodyMarkdown) {
        // Small delay to ensure WebView is ready
        setTimeout(() => {
          editor.setMarkdown(bodyMarkdown);
        }, 300);
      }
    }
  }, []);

  const handleAddAttachment = useCallback((attachment: PendingSidecar) => {
    setAttachments((prev) => [...prev, attachment]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Title Required', 'Please enter a title for this note.');
      return;
    }

    setSaving(true);
    try {
      // Get markdown directly from the editor — no HTML conversion
      const bodyMarkdown = await editor.getMarkdown();
      const fullMarkdown = `# ${title.trim()}\n\n${bodyMarkdown}`;

      const existingNonAttachmentChildren = (initialDoc?.children ?? []).filter(
        (c) =>
          c.metadata.type !== 'attachment_ref' && c.metadata.type !== 'attachment',
      );
      const newAttachmentChildren = buildAttachmentChildren(attachments);

      const doc: MedicalDocument = {
        value: fullMarkdown,
        metadata: {
          type: categoryType,
          created: initialDoc?.metadata.created ?? new Date().toISOString(),
          updated: new Date().toISOString(),
          tags: initialDoc?.metadata.tags ?? [],
        },
        children: [...existingNonAttachmentChildren, ...newAttachmentChildren],
      };

      await onSave(doc, attachments);
    } catch (error) {
      console.error('Save failed:', error);
      Alert.alert('Save Failed', 'Could not save note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmCancel = () => {
    Alert.alert(
      'Discard Note?',
      'Your changes will be lost.',
      [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onCancel },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={confirmCancel} disabled={saving}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerPath} numberOfLines={1}>
          {dirPath}
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Title input */}
      <TextInput
        style={styles.titleInput}
        placeholder="Note title..."
        placeholderTextColor="#999"
        value={title}
        onChangeText={setTitle}
        returnKeyType="next"
        editable={!saving}
      />

      {/* Rich text editor */}
      <View style={styles.editorContainer}>
        <RichText editor={editor} />
      </View>

      {/* Attachments */}
      <AttachmentList
        attachments={attachments}
        onAdd={handleAddAttachment}
        onRemove={handleRemoveAttachment}
      />

      {/* Toolbar pinned above keyboard */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={{ backgroundColor: 'red', padding: 4 }}>
          <Toolbar editor={editor} />
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
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  cancelText: {
    fontSize: 16,
    color: '#666',
  },
  headerPath: {
    fontSize: 13,
    color: '#999',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  saveText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  titleInput: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  editorContainer: {
    flex: 1,
  },
  keyboardAvoidingView: {
    position: 'absolute',
    width: '100%',
    bottom: 0,
  },
});