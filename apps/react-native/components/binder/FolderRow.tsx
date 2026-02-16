// components/binder/FolderRow.tsx

import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import type { DirFolder } from '../../core/binder/DirectoryReader';

interface FolderRowProps {
  item: DirFolder;
  onPress: (folder: DirFolder) => void;
}

export function FolderRow({ item, onPress }: FolderRowProps) {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(item)}
      activeOpacity={0.6}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>📁</Text>
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.name}>{formatFolderName(item.name)}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

/** Convert slug to display name: 'back-acne' -> 'Back Acne' */
function formatFolderName(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  chevron: {
    fontSize: 22,
    color: '#999',
    marginLeft: 8,
  },
});
