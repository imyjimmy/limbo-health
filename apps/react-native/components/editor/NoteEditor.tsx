// components/editor/NoteEditor.tsx

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
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
import { useCamera } from '../../hooks/useCamera';
import { InlineRecorderBar } from '../audio/InlineRecorderBar';
import { encode as b64encode } from '../../core/crypto/base64';
import type { AudioRecordingResult } from '../../hooks/useAudioRecorder';
import { parseMarkdownFrontMatter } from '../../core/markdown/frontmatter';

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
  const parsedInitialValue = parseMarkdownFrontMatter(initialDoc?.value ?? '');
  const initialFrontMatterRaw = parsedInitialValue.hasFrontMatter
    ? parsedInitialValue.raw
    : null;
  const initialMarkdownBody = parsedInitialValue.hasFrontMatter
    ? parsedInitialValue.body
    : (initialDoc?.value ?? '');

  const [title, setTitle] = useState(() => {
    if (initialMarkdownBody) {
      const match = initialMarkdownBody.match(/^#\s+(.+)$/m);
      return match ? match[1] : '';
    }
    return '';
  });

  const [attachments, setAttachments] = useState<PendingSidecar[]>([]);

  // Existing attachment children from the document, mutable so user can remove
  const [existingAttachments, setExistingAttachments] = useState(() =>
    (initialDoc?.children ?? []).filter(
      (c) => c.metadata.type === 'attachment_ref' || c.metadata.type === 'attachment',
    ),
  );
  const [saving, setSaving] = useState(false);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // When editing, hide the editor until existing content is loaded to avoid "Write something..." flash
  const isEditing = !!initialDoc?.value;
  const [editorReady, setEditorReady] = useState(!isEditing);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const editor = useEditorBridge({
    customSource: editorHtml,
    autofocus: !initialDoc,
    avoidIosKeyboard: true,
    bridgeExtensions: [...TenTapStartKit, MarkdownBridge],
  });

  // --- Load existing content into the editor after WebView is ready ---
  // On iOS, RichText forces a WebView reload (key change workaround), so there
  // are always TWO WebView loads. We track loads via the onLoad callback and
  // call setMarkdown after the final load + a short delay for tiptap to init.
  const loadCountRef = useRef(0);
  const hasSetContent = useRef(false);
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEditorLoad = useCallback(() => {
    loadCountRef.current += 1;
    if (hasSetContent.current) return;
    if (!initialMarkdownBody) return;

    const targetLoads = Platform.OS === 'ios' ? 2 : 1;
    if (loadCountRef.current < targetLoads) return;

    const bodyMarkdown = initialMarkdownBody.replace(/^#\s+.+\n*/, '').trim();
    if (!bodyMarkdown) { setEditorReady(true); return; }

    // Clear any prior timer (shouldn't happen, but be safe)
    if (contentTimerRef.current) clearTimeout(contentTimerRef.current);

    // Wait for tiptap to initialize after WebView finishes loading
    contentTimerRef.current = setTimeout(() => {
      if (!hasSetContent.current) {
        editor.setMarkdown(bodyMarkdown);
        hasSetContent.current = true;
        setEditorReady(true);
      }
    }, 400);
  }, [editor, initialMarkdownBody]);

  const { capture } = useCamera();

  const handleCapturePhoto = useCallback(async (): Promise<PendingSidecar | null> => {
    const result = await capture();
    if (!result) return null;
    const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const id = `photo-${Date.now()}`;
    return {
      id,
      base64Data: result.base64Data,
      sizeBytes: result.sizeBytes,
      format: 'jpeg',
      sidecarFilename: `${now}-photo.enc`,
      previewUri: result.uri,
    };
  }, [capture]);

  const handleAddAttachment = useCallback((attachment: PendingSidecar) => {
    setAttachments((prev) => [...prev, attachment]);
  }, []);

  const handleRecordAudio = useCallback(() => {
    setRecordingAudio(true);
  }, []);

  const handleAudioComplete = useCallback(async (result: AudioRecordingResult) => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const id = `audio-${Date.now()}`;
    const pending: PendingSidecar = {
      id,
      base64Data: b64encode(result.binaryData),
      sizeBytes: result.sizeBytes,
      format: 'm4a',
      sidecarFilename: `${stamp}-recording.m4a.enc`,
    };
    setAttachments((prev) => [...prev, pending]);
    setRecordingAudio(false);
  }, []);

  const handleAudioCancel = useCallback(async () => {
    setRecordingAudio(false);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleRemoveExisting = useCallback((index: number) => {
    setExistingAttachments((prev) => prev.filter((_, i) => i !== index));
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
      const fullMarkdownWithoutFrontMatter = `# ${title.trim()}\n\n${bodyMarkdown}`;
      const fullMarkdown = initialFrontMatterRaw
        ? `${initialFrontMatterRaw}\n\n${fullMarkdownWithoutFrontMatter}`
        : fullMarkdownWithoutFrontMatter;

      const existingNonAttachmentChildren = (initialDoc?.children ?? []).filter(
        (c) =>
          c.metadata.type !== 'attachment_ref' && c.metadata.type !== 'attachment',
      );
      const newAttachmentChildren = buildAttachmentChildren(attachments);

      const doc: MedicalDocument = {
        value: fullMarkdown,
        metadata: {
          ...(initialDoc?.metadata ?? {}),
          type: categoryType,
          created: initialDoc?.metadata.created ?? new Date().toISOString(),
          updated: new Date().toISOString(),
          tags: initialDoc?.metadata.tags ?? [],
        },
        children: [
          ...existingNonAttachmentChildren,
          ...existingAttachments,
          ...newAttachmentChildren,
        ],
        renderer: initialDoc?.renderer,
        editor: initialDoc?.editor,
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
        <TouchableOpacity onPress={confirmCancel} disabled={saving} testID="editor-cancel">
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerPath} numberOfLines={1}>
          {dirPath}
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} testID="editor-save">
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
        testID="editor-title"
      />

      {/* Rich text editor */}
      <View style={styles.editorContainer}>
        <RichText editor={editor} onLoad={handleEditorLoad} />
        {!editorReady && (
          <View style={styles.editorOverlay}>
            <ActivityIndicator size="small" color="#999" />
          </View>
        )}
      </View>

      {/* Attachments: below editor when keyboard hidden, above toolbar when typing */}
      {!keyboardVisible && (
        <AttachmentList
          attachments={attachments}
          existingAttachments={existingAttachments}
          onAdd={handleAddAttachment}
          onRemove={handleRemoveAttachment}
          onRemoveExisting={handleRemoveExisting}
          onCapturePhoto={handleCapturePhoto}
          onRecordAudio={handleRecordAudio}
        />
      )}

      {/* Toolbar pinned above keyboard */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        {keyboardVisible && (
          <AttachmentList
            attachments={attachments}
            existingAttachments={existingAttachments}
            onAdd={handleAddAttachment}
            onRemove={handleRemoveAttachment}
            onCapturePhoto={handleCapturePhoto}
            onRecordAudio={handleRecordAudio}
          />
        )}
        {recordingAudio && (
          <View style={styles.recorderRow}>
            <InlineRecorderBar
              onComplete={handleAudioComplete}
              onCancel={handleAudioCancel}
            />
          </View>
        )}
        <Toolbar editor={editor} />
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
    position: 'relative',
  },
  editorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardAvoidingView: {
    position: 'absolute',
    width: '100%',
    bottom: 0,
  },
  recorderRow: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
});
