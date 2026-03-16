// components/editor/AttachmentList.tsx
//
// Displays and manages attachment references (sidecar .enc files) for a note.
// This component manages the `children` array of the MedicalDocument — specifically
// children with metadata.type === 'attachment_ref'.
//
// Each attachment shows as a thumbnail/chip. The "Add" buttons invoke pickers
// (photo, file, audio) and feed results through the compression + sidecar pipeline.

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
} from 'react-native';
import type { MedicalDocument } from '../../types/document';
import { createThemedStyles, useThemedStyles } from '../../theme';

// Icons — using text placeholders for now, replace with @tabler/icons-react-native
const ICONS = {
  photo: '📷',
  file: '📎',
  audio: '🎙',
  remove: '✕',
} as const;

export interface PendingSidecar {
  /** Temporary ID for UI key */
  id: string;
  /** The base64-encoded binary data (ready for sidecar encryption) */
  base64Data: string;
  /** Original size in bytes before base64 */
  sizeBytes: number;
  /** File format: jpeg, png, pdf, mp3, m4a, etc. */
  format: string;
  /** Generated sidecar filename: 2026-02-15-photo.enc */
  sidecarFilename: string;
  /** Local URI for thumbnail preview (photos only) */
  previewUri?: string;
}

interface AttachmentListProps {
  /** Current list of pending sidecars to be written on save */
  attachments: PendingSidecar[];
  /** Existing attachment children from the document */
  existingAttachments?: MedicalDocument[];
  /** Called when user adds a new attachment */
  onAdd: (attachment: PendingSidecar) => void;
  /** Called when user removes an attachment by ID */
  onRemove: (id: string) => void;
  /** Called when user removes an existing attachment by index */
  onRemoveExisting?: (index: number) => void;
  /** Capture a photo via camera — provided by parent (hook-based) */
  onCapturePhoto?: () => Promise<PendingSidecar | null>;
  /** Start inline audio recording flow */
  onRecordAudio?: () => void;
}

export function AttachmentList({
  attachments,
  existingAttachments = [],
  onAdd,
  onRemove,
  onRemoveExisting,
  onCapturePhoto,
  onRecordAudio,
}: AttachmentListProps) {
  const styles = useThemedStyles(createStyles);

  const handleAddPhoto = async () => {
    if (!onCapturePhoto) return;
    const result = await onCapturePhoto();
    if (result) onAdd(result);
  };

  const handleAddFile = async () => {
    // TODO: invoke expo-document-picker → read → base64 → create PendingSidecar
    Alert.alert('Add File', 'Document picker will be wired here');
  };

  const handleAddAudio = async () => {
    if (!onRecordAudio) {
      Alert.alert('Record Audio', 'Audio recorder is unavailable here.');
      return;
    }
    onRecordAudio();
  };

  const confirmRemove = (id: string, filename: string) => {
    Alert.alert(
      'Remove Attachment',
      `Remove ${filename}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => onRemove(id) },
      ],
    );
  };

  const renderAttachment = ({ item }: { item: PendingSidecar }) => (
    <View style={styles.attachmentChip}>
      {item.previewUri ? (
        <Image source={{ uri: item.previewUri }} style={styles.thumbnail} />
      ) : (
        <View style={styles.fileBadge}>
          <Text style={styles.fileBadgeText}>{item.format.toUpperCase()}</Text>
        </View>
      )}
      <Text style={styles.attachmentName} numberOfLines={1}>
        {item.sidecarFilename}
      </Text>
      <TouchableOpacity
        onPress={() => confirmRemove(item.id, item.sidecarFilename)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.removeButton}>{ICONS.remove}</Text>
      </TouchableOpacity>
    </View>
  );

  const hasAny = existingAttachments.length > 0 || attachments.length > 0;

  return (
    <View style={styles.container}>
      {hasAny && (
        <View style={styles.listContent}>
          <FlatList
            data={[
              ...existingAttachments.map((child, i) => ({
                type: 'existing' as const,
                key: `existing-${i}`,
                child,
                index: i,
              })),
              ...attachments.map((att) => ({
                type: 'pending' as const,
                key: att.id,
                att,
              })),
            ]}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => {
              if (item.type === 'existing') {
                const c = item.child;
                const idx = item.index!;
                const fmt = c.metadata.format?.toUpperCase() ?? 'FILE';
                return (
                  <View style={styles.existingAttachmentChip}>
                    <View style={styles.fileBadge}>
                      <Text style={styles.fileBadgeText}>{fmt}</Text>
                    </View>
                    {onRemoveExisting && (
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            'Remove Attachment',
                            `Remove ${c.value}?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Remove', style: 'destructive', onPress: () => onRemoveExisting(idx) },
                            ],
                          );
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.existingRemoveButton}
                      >
                        <Text style={styles.removeButton}>{ICONS.remove}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }
              return renderAttachment({ item: item.att! });
            }}
            horizontal
            showsHorizontalScrollIndicator={false}
          />
        </View>
      )}
      <View style={styles.addButtons}>
        <TouchableOpacity style={styles.addButton} onPress={handleAddPhoto}>
          <Text style={styles.addButtonIcon}>{ICONS.photo}</Text>
          <Text style={styles.addButtonLabel}>Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addButton} onPress={handleAddFile}>
          <Text style={styles.addButtonIcon}>{ICONS.file}</Text>
          <Text style={styles.addButtonLabel}>File</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addButton} onPress={handleAddAudio}>
          <Text style={styles.addButtonIcon}>{ICONS.audio}</Text>
          <Text style={styles.addButtonLabel}>Audio</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Build the `children` array entries from pending sidecars.
 * Called at save time to assemble the MedicalDocument.
 */
export function buildAttachmentChildren(attachments: PendingSidecar[]): MedicalDocument[] {
  return attachments.map((att) => ({
    value: att.sidecarFilename,
    metadata: {
      type: 'attachment_ref',
      format: att.format,
      encoding: 'base64',
      originalSizeBytes: att.sizeBytes,
      created: new Date().toISOString(),
    },
    children: [],
  }));
}

const createStyles = createThemedStyles((theme) => ({
  container: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 8,
    padding: 4,
    gap: 8,
    maxWidth: 200,
  },
  existingAttachmentChip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 8,
    padding: 4,
    gap: 2,
    maxWidth: 200,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: 4,
  },
  fileBadge: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: theme.colors.secondarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.secondary,
  },
  attachmentName: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  removeButton: {
    fontSize: 16,
    color: theme.colors.textMuted,
    paddingLeft: 4,
  },
  existingRemoveButton: {
    paddingTop: 2,
  },
  addButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 4,
  },
  addButtonIcon: {
    fontSize: 16,
  },
  addButtonLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
}));
