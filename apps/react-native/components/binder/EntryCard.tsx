// components/binder/EntryCard.tsx

import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import type { DirEntry } from '../../core/binder/DirectoryReader';

interface EntryCardProps {
  item: DirEntry;
  onPress: (entry: DirEntry) => void;
  onLongPress?: (entry: DirEntry) => void;
  onDragHandleLongPress?: () => void;
}

export function EntryCard({
  item,
  onPress,
  onLongPress,
  onDragHandleLongPress,
}: EntryCardProps) {
  const longPressRef = React.useRef(false);
  const preview = item.preview;
  const title = preview?.title ?? item.name.replace('.json', '');
  const medicationName = preview?.medicationName ?? title;
  const isMedicationSummary =
    !!preview?.medicationName;
  const dateStr = preview?.created
    ? formatDate(preview.created)
    : extractDateFromFilename(item.name);
  const typeLabel = preview?.type ? formatType(preview.type, preview.format) : '';
  const dragBarColor = onDragHandleLongPress ? '#6B7280' : '#C5CCD7';

  const handlePress = () => {
    if (longPressRef.current) {
      longPressRef.current = false;
      return;
    }
    onPress(item);
  };

  const handleLongPress = () => {
    longPressRef.current = true;
    onLongPress?.(item);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.mainPressArea}
        onPress={handlePress}
        onLongPress={onLongPress ? handleLongPress : undefined}
        delayLongPress={250}
        activeOpacity={0.6}
        testID={`entry-card-${item.name}`}
      >
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {isMedicationSummary ? medicationName : title}
          </Text>
          {preview?.hasChildren && (
            <View style={styles.attachmentBadge}>
              <Text style={styles.attachmentIcon}>📎</Text>
            </View>
          )}
        </View>

        <View style={styles.metaRow}>
          {isMedicationSummary ? (
            <>
              {preview?.medicationDosage ? (
                <View style={styles.medicationPill}>
                  <Text style={styles.medicationPillText}>{preview.medicationDosage}</Text>
                </View>
              ) : null}
              {preview?.medicationFrequency ? (
                <Text style={styles.medicationFrequency} numberOfLines={1}>
                  {preview.medicationFrequency}
                </Text>
              ) : null}
            </>
          ) : typeLabel ? (
            <View style={styles.typePill}>
              <Text style={styles.typeText}>{typeLabel}</Text>
            </View>
          ) : null}
          {dateStr ? <Text style={styles.date}>{dateStr}</Text> : null}
          {preview?.provider ? (
            <Text style={styles.provider} numberOfLines={1}>
              {preview.provider}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.dragHandle}
        onLongPress={onDragHandleLongPress}
        delayLongPress={120}
        activeOpacity={0.7}
        disabled={!onDragHandleLongPress}
        testID={`entry-drag-handle-${item.name}`}
      >
        <View style={styles.dragBars}>
          <View style={[styles.dragBar, { backgroundColor: dragBarColor }]} />
          <View style={[styles.dragBar, { backgroundColor: dragBarColor }]} />
          <View style={[styles.dragBar, { backgroundColor: dragBarColor }]} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function extractDateFromFilename(name: string): string {
  const match = name.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? formatDate(match[1]) : '';
}

function formatType(type: string, format?: string): string {
  if (type === 'attachment_ref') {
    const audioFormats = ['m4a', 'mp3', 'wav', 'aac', 'ogg'];
    if (format && audioFormats.includes(format)) return 'Recording';
    return 'Photo';
  }
  const map: Record<string, string> = {
    visit: 'Visit',
    lab: 'Lab',
    condition: 'Condition',
    medication: 'Medication',
    immunization: 'Immunization',
    allergy: 'Allergy',
    procedure: 'Procedure',
    'patient-info': 'Patient Info',
  };
  return map[type] ?? type;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    minHeight: 64,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
    flexDirection: 'row',
    alignItems: 'center',
  },
  mainPressArea: {
    flex: 1,
    paddingVertical: 2,
    paddingRight: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
    flex: 1,
  },
  attachmentBadge: {
    marginLeft: 6,
  },
  attachmentIcon: {
    fontSize: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typePill: {
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  medicationPill: {
    backgroundColor: '#eaf2ff',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  medicationPillText: {
    fontSize: 12,
    color: '#0f4fa8',
    fontWeight: '600',
  },
  medicationFrequency: {
    fontSize: 13,
    color: '#3b4b5e',
    flexShrink: 1,
  },
  date: {
    fontSize: 13,
    color: '#888',
  },
  provider: {
    fontSize: 13,
    color: '#888',
    flex: 1,
  },
  dragHandle: {
    width: 30,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  dragBars: {
    width: 14,
    height: 12,
    justifyContent: 'space-between',
  },
  dragBar: {
    width: '100%',
    height: 2,
    borderRadius: 1,
  },
});
