// components/binder/DirectoryList.tsx
// The core reusable file-browser component.
// Shows folders and .json entry cards from a binder directory.
// Tap folder -> onNavigateFolder callback.
// Tap entry -> onOpenEntry callback.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import type Swipeable from 'react-native-gesture-handler/Swipeable';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import type { DirItem, DirFolder, DirEntry } from '../../core/binder/DirectoryReader';
import { FolderRow } from './FolderRow';
import { EntryCard } from './EntryCard';
import { SwipeableRow } from './SwipeableRow';

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
  /** If provided, enables swipe-to-delete on each row */
  onDeleteItem?: (item: DirItem) => void;
  /** If provided, enables long-press folder edit */
  onEditFolder?: (folder: DirFolder) => void;
  /** Persist new order after drag end (enables drag handles). */
  onReorder?: (nextItems: DirItem[]) => void;
  /** Disable new drags while saving order */
  reorderBusy?: boolean;
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
  onDeleteItem,
  onEditFolder,
  onReorder,
  reorderBusy = false,
}: DirectoryListProps) {
  // Track the currently open swipeable so only one row is open at a time
  const openSwipeableRef = useRef<Swipeable | null>(null);
  const [reorderItems, setReorderItems] = useState<DirItem[]>(items);
  const draggable = !!onReorder;

  useEffect(() => {
    setReorderItems(items);
  }, [items]);

  const handleSwipeOpen = useCallback((ref: Swipeable) => {
    if (openSwipeableRef.current && openSwipeableRef.current !== ref) {
      openSwipeableRef.current.close();
    }
    openSwipeableRef.current = ref;
  }, []);

  const renderDirectoryItem = (
    item: DirItem,
    onDragHandleLongPress?: () => void,
  ) => {
    if (!onDeleteItem) {
      // No delete support — render plain rows
      if (item.kind === 'folder') {
        const iconInfo = getFolderIcon?.(item);
        return (
          <FolderRow
            item={item}
            emoji={item.meta?.icon ?? iconInfo?.emoji}
            iconColor={item.meta?.color ?? iconInfo?.color}
            onPress={onNavigateFolder}
            onLongPress={onEditFolder}
            onDragHandleLongPress={reorderBusy ? undefined : onDragHandleLongPress}
          />
        );
      }
      return (
        <EntryCard
          item={item}
          onPress={onOpenEntry}
          onDragHandleLongPress={reorderBusy ? undefined : onDragHandleLongPress}
        />
      );
    }

    const isWarningFolder = item.kind === 'folder' && item.childCount > 0;

    if (item.kind === 'folder') {
      const iconInfo = getFolderIcon?.(item);
      return (
        <SwipeableRow
          showWarning={isWarningFolder}
          onDelete={() => onDeleteItem(item)}
          onSwipeOpen={handleSwipeOpen}
        >
          {isWarningFolder
            ? (warningAnim) => (
                <FolderRow
                  item={item}
                  emoji={item.meta?.icon ?? iconInfo?.emoji}
                  iconColor={item.meta?.color ?? iconInfo?.color}
                  onPress={onNavigateFolder}
                  onLongPress={onEditFolder}
                  onDragHandleLongPress={reorderBusy ? undefined : onDragHandleLongPress}
                  deleteWarningAnim={warningAnim}
                />
              )
            : (
                <FolderRow
                  item={item}
                  emoji={item.meta?.icon ?? iconInfo?.emoji}
                  iconColor={item.meta?.color ?? iconInfo?.color}
                  onPress={onNavigateFolder}
                  onLongPress={onEditFolder}
                  onDragHandleLongPress={reorderBusy ? undefined : onDragHandleLongPress}
                />
              )
          }
        </SwipeableRow>
      );
    }

    return (
      <SwipeableRow
        showWarning={false}
        onDelete={() => onDeleteItem(item)}
        onSwipeOpen={handleSwipeOpen}
      >
        <EntryCard
          item={item}
          onPress={onOpenEntry}
          onDragHandleLongPress={reorderBusy ? undefined : onDragHandleLongPress}
        />
      </SwipeableRow>
    );
  };

  const renderItem = ({ item }: { item: DirItem }) => renderDirectoryItem(item);

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

  const renderDraggableItem = ({ item, drag, isActive }: RenderItemParams<DirItem>) => {
    return (
      <View style={isActive ? styles.dragActiveRow : undefined}>
        {renderDirectoryItem(item, drag)}
      </View>
    );
  };

  const listHeader = ListHeaderComponent ?? undefined;

  if (draggable) {
    return (
      <View style={styles.wrapper} testID="directory-list">
        <DraggableFlatList
          data={reorderItems}
          keyExtractor={(item) => item.relativePath}
          renderItem={renderDraggableItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <>
              {onAddSubfolder && (
                <TouchableOpacity
                  style={styles.addSubfolderRow}
                  onPress={onAddSubfolder}
                  activeOpacity={0.6}
                >
                  <View style={styles.addSubfolderIconContainer}>
                    <Text style={styles.addSubfolderPlus}>+</Text>
                  </View>
                  <Text style={styles.addSubfolderText}>
                    {addSubfolderLabel}
                  </Text>
                </TouchableOpacity>
              )}
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No entries yet</Text>
                <Text style={styles.emptySubtext}>
                  Tap <Text style={styles.addSubfolderPlusInline}>[+]</Text> to add your first entry
                </Text>
              </View>
            </>
          }
          ListFooterComponent={
            reorderItems.length > 0 && onAddSubfolder ? (
              <TouchableOpacity
                style={styles.addSubfolderRow}
                onPress={onAddSubfolder}
                activeOpacity={0.6}
              >
                <View style={styles.addSubfolderIconContainer}>
                  <Text style={styles.addSubfolderPlus}>+</Text>
                </View>
                <Text style={styles.addSubfolderText}>
                  {addSubfolderLabel}
                </Text>
              </TouchableOpacity>
            ) : undefined
          }
          refreshing={loading}
          onRefresh={onRefresh}
          contentContainerStyle={reorderItems.length === 0 ? styles.emptyContainer : undefined}
          activationDistance={12}
          onDragEnd={({ data }) => {
            setReorderItems(data);
            onReorder?.(data);
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.wrapper} testID="directory-list">
      <FlatList
        data={items}
        keyExtractor={(item) => item.relativePath}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <>
            {onAddSubfolder && (
              <TouchableOpacity
                style={styles.addSubfolderRow}
                onPress={onAddSubfolder}
                activeOpacity={0.6}
              >
                <View style={styles.addSubfolderIconContainer}>
                  <Text style={styles.addSubfolderPlus}>+</Text>
                </View>
                <Text style={styles.addSubfolderText}>
                  {addSubfolderLabel}
                </Text>
              </TouchableOpacity>
            )}
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No entries yet</Text>
              <Text style={styles.emptySubtext}>
                Tap <Text style={styles.addSubfolderPlusInline}>[+]</Text> to add your first entry
              </Text>
            </View>
          </>
        }
        ListFooterComponent={
          items.length > 0 && onAddSubfolder ? (
            <TouchableOpacity
              style={styles.addSubfolderRow}
              onPress={onAddSubfolder}
              activeOpacity={0.6}
            >
              <View style={styles.addSubfolderIconContainer}>
                <Text style={styles.addSubfolderPlus}>+</Text>
              </View>
              <Text style={styles.addSubfolderText}>
                {addSubfolderLabel}
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
    backgroundColor: 'transparent',
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
  addSubfolderPlusInline: {
    fontSize: 14,
    color: '#999',
    fontWeight: '600',
  },
  addSubfolderText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '400',
  },
  dragActiveRow: {
    opacity: 0.92,
  },
});
