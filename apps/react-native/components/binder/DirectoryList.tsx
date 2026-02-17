// components/binder/DirectoryList.tsx
// The core reusable file-browser component.
// Shows folders and .json entry cards from a binder directory.
// Tap folder -> onNavigateFolder callback.
// Tap entry -> onOpenEntry callback.

import React from 'react';
import {
  FlatList,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import type { DirItem, DirFolder, DirEntry } from '../../core/binder/DirectoryReader';
import { FolderRow } from './FolderRow';
import { EntryCard } from './EntryCard';

interface DirectoryListProps {
  items: DirItem[];
  loading: boolean;
  error: string | null;
  onNavigateFolder: (folder: DirFolder) => void;
  onOpenEntry: (entry: DirEntry) => void;
  onRefresh: () => void;
  /** Optional header component (e.g., breadcrumb) */
  ListHeaderComponent?: React.ReactElement;
  /** Callback to resolve emoji/color for a folder (from category metadata) */
  getFolderIcon?: (folder: DirFolder) => { emoji?: string; color?: string };
  /** If provided, renders an inline "Add a new ..." row at the bottom */
  onAddSubfolder?: () => void;
  addSubfolderLabel?: string;
}

export function DirectoryList({
  items,
  loading,
  error,
  onNavigateFolder,
  onOpenEntry,
  onRefresh,
  ListHeaderComponent,
  getFolderIcon,
  onAddSubfolder,
  addSubfolderLabel,
}: DirectoryListProps) {
  const renderItem = ({ item }: { item: DirItem }) => {
    if (item.kind === 'folder') {
      const iconInfo = getFolderIcon?.(item);
      return (
        <FolderRow
          item={item}
          emoji={item.meta?.icon ?? iconInfo?.emoji}
          iconColor={item.meta?.color ?? iconInfo?.color}
          onPress={onNavigateFolder}
        />
      );
    }
    return <EntryCard item={item} onPress={onOpenEntry} />;
  };

  if (loading && items.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#666" />
        <Text style={styles.loadingText}>Decrypting...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.relativePath}
        renderItem={renderItem}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No entries yet</Text>
            <Text style={styles.emptySubtext}>
              Tap + to add your first entry
            </Text>
          </View>
        }
        ListFooterComponent={
          onAddSubfolder ? (
            <TouchableOpacity
              style={styles.addSubfolderRow}
              onPress={onAddSubfolder}
              activeOpacity={0.6}
            >
              <View style={styles.addSubfolderIconContainer}>
                <Text style={styles.addSubfolderPlus}>+</Text>
              </View>
              <Text style={styles.addSubfolderText}>
                {addSubfolderLabel ?? 'Add new...'}
              </Text>
            </TouchableOpacity>
          ) : undefined
        }
        refreshing={loading}
        onRefresh={onRefresh}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#888',
  },
  errorText: {
    fontSize: 15,
    color: '#c00',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#333',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 4,
  },
  addSubfolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  addSubfolderIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addSubfolderPlus: {
    fontSize: 20,
    color: '#999',
    fontWeight: '300',
  },
  addSubfolderText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '400',
  },
});
