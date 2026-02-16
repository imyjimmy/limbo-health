// components/binder/DirectoryList.tsx
// The core reusable file-browser component.
// Shows folders and .json entry cards from a binder directory.
// Tap folder -> onNavigateFolder callback.
// Tap entry -> onOpenEntry callback.
// FAB "+" -> onAddEntry callback with current dirPath.

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
  onAddEntry: () => void;
  onRefresh: () => void;
  /** Optional header component (e.g., breadcrumb) */
  ListHeaderComponent?: React.ReactElement;
}

export function DirectoryList({
  items,
  loading,
  error,
  onNavigateFolder,
  onOpenEntry,
  onAddEntry,
  onRefresh,
  ListHeaderComponent,
}: DirectoryListProps) {
  const renderItem = ({ item }: { item: DirItem }) => {
    if (item.kind === 'folder') {
      return <FolderRow item={item} onPress={onNavigateFolder} />;
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
        refreshing={loading}
        onRefresh={onRefresh}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={onAddEntry}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1a73e8',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabIcon: {
    fontSize: 28,
    color: '#fff',
    lineHeight: 30,
  },
});
