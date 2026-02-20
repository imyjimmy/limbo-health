// components/binder/FolderRow.tsx

import React from 'react';
import { Animated, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import type { DirFolder } from '../../core/binder/DirectoryReader';

interface FolderRowProps {
  item: DirFolder;
  emoji?: string;
  iconColor?: string;
  onPress: (folder: DirFolder) => void;
  /** Animated value 0→1 driving the "delete multiple items" pill visibility */
  deleteWarningAnim?: Animated.Value;
}

export function FolderRow({ item, emoji, iconColor, onPress, deleteWarningAnim }: FolderRowProps) {
  const bgTint = iconColor ? iconColor + '18' : '#f0f0f0';
  const displayName = item.meta?.displayName ?? formatFolderName(item.name);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(item)}
      activeOpacity={0.6}
      testID={`folder-row-${item.name}`}
    >
      <View style={[styles.iconContainer, { backgroundColor: bgTint }]}>
        <Text style={styles.emoji}>{emoji ?? '📁'}</Text>
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.name}>{displayName}</Text>
      </View>
      {deleteWarningAnim && (
        <Animated.View
          style={[
            styles.deletePill,
            {
              opacity: deleteWarningAnim,
              transform: [{
                scale: deleteWarningAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.8, 1],
                }),
              }],
            },
          ]}
        >
          <Text style={styles.deletePillText}>delete multiple items?</Text>
        </Animated.View>
      )}
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
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  emoji: {
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
  deletePill: {
    backgroundColor: '#E57373',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 4,
  },
  deletePillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 22,
    color: '#999',
    marginLeft: 8,
  },
});
