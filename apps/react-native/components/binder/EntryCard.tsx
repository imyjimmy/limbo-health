// components/binder/EntryCard.tsx

import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import type { DirEntry } from '../../core/binder/DirectoryReader';

interface EntryCardProps {
  item: DirEntry;
  onPress: (entry: DirEntry) => void;
}

export function EntryCard({ item, onPress }: EntryCardProps) {
  const preview = item.preview;
  const title = preview?.title ?? item.name.replace('.json', '');
  const dateStr = preview?.created
    ? formatDate(preview.created)
    : extractDateFromFilename(item.name);
  const typeLabel = preview?.type ? formatType(preview.type, preview.format) : '';

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(item)}
      activeOpacity={0.6}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {preview?.hasChildren && (
          <View style={styles.attachmentBadge}>
            <Text style={styles.attachmentIcon}>📎</Text>
          </View>
        )}
      </View>

      <View style={styles.metaRow}>
        {typeLabel ? (
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
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
  date: {
    fontSize: 13,
    color: '#888',
  },
  provider: {
    fontSize: 13,
    color: '#888',
    flex: 1,
  },
});
