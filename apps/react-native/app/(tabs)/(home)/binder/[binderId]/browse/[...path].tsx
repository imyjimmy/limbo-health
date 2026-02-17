// app/binder/[binderId]/browse/[...path].tsx
// Generic directory browser. Works at any depth.
// URL: /binder/<id>/browse/visits  or  /binder/<id>/browse/conditions/back-acne

import React, { useCallback, useMemo, useState } from 'react';
import { Alert, TouchableOpacity, Text } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { DirectoryList } from '../../../../../../components/binder/DirectoryList';
import { NewFolderModal } from '../../../../../../components/binder/NewFolderModal';
import { useDirectoryContents } from '../../../../../../hooks/useDirectoryContents';
import type { DirFolder, DirEntry } from '../../../../../../core/binder/DirectoryReader';
import { useAuthContext } from '../../../../../../providers/AuthProvider';
import { useCryptoContext } from '../../../../../../providers/CryptoProvider';
import { BinderService } from '../../../../../../core/binder/BinderService';
import { categoryFromPath, getCategory } from '../../../../../../core/binder/categories';
import { slugify } from '../../../../../../core/binder/FileNaming';
import { createConditionOverview } from '../../../../../../core/binder/DocumentModel';

export default function BrowseDirectoryScreen() {
  const { binderId, path } = useLocalSearchParams<{
    binderId: string;
    path: string[];
  }>();
  const router = useRouter();

  // Reconstruct the directory path from the catch-all segments
  const dirPath = Array.isArray(path) ? path.join('/') : (path ?? '');
  const dirDisplayName = formatBreadcrumb(dirPath);

  const { state: authState } = useAuthContext();
  const { masterConversationKey } = useCryptoContext();
  const jwt = authState.status === 'authenticated' ? authState.jwt : null;

  const binderService = useMemo(() => {
    if (!masterConversationKey || !jwt || !binderId) return null;
    return new BinderService(
      {
        repoId: binderId,
        repoDir: `binders/${binderId}`,
        auth: { type: 'jwt' as const, token: jwt },
      },
      masterConversationKey,
    );
  }, [binderId, masterConversationKey, jwt]);

  const { items, loading, error, refresh } = useDirectoryContents(
    binderService,
    dirPath,
  );

  const handleNavigateFolder = (folder: DirFolder) => {
    router.push(`/binder/${binderId}/browse/${folder.relativePath}`);
  };

  const handleOpenEntry = (entry: DirEntry) => {
    router.push(`/binder/${binderId}/entry/${entry.relativePath}`);
  };

  const handleAddEntry = () => {
    const categoryType = categoryFromPath(dirPath);
    router.push({
      pathname: `/binder/${binderId}/entry/new`,
      params: { dirPath, categoryType },
    });
  };

  // Resolve emoji/color for folders from category metadata
  const topLevelCategory = categoryFromPath(dirPath);
  const getFolderIcon = useCallback(
    (folder: DirFolder) => {
      // If we're at root, each folder IS a category
      if (!dirPath || dirPath === '/') {
        const cat = getCategory(folder.name);
        return cat ? { emoji: cat.emoji, color: cat.color } : {};
      }
      // Inside a category, subfolders inherit the parent category's emoji
      const parentCat = getCategory(topLevelCategory);
      return parentCat ? { emoji: parentCat.emoji, color: parentCat.color } : {};
    },
    [dirPath, topLevelCategory],
  );

  // --- New folder modal ---
  const [showNewFolder, setShowNewFolder] = useState(false);
  const isConditionsDir = dirPath === 'conditions';
  const parentCat = getCategory(topLevelCategory);

  const handleAddCondition = useCallback(
    async (name: string, emoji: string, color: string) => {
      if (!binderService) return;
      setShowNewFolder(false);
      const slug = slugify(name);
      const overviewDoc = createConditionOverview(slug, name);
      try {
        await binderService.createSubfolder(
          `conditions/${slug}`,
          name,
          overviewDoc,
          { icon: emoji, color },
        );
        refresh();
      } catch (err: any) {
        const message = err?.message ?? '';
        const isPushError = message.includes('push') || message.includes('network') || message.includes('401');
        if (isPushError) {
          console.warn('Push failed, condition created locally:', message);
          refresh();
        } else {
          Alert.alert('Error', 'Failed to create condition. Please try again.');
        }
      }
    },
    [binderService, refresh],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: dirDisplayName,
          headerRight: () => (
            <TouchableOpacity onPress={handleAddEntry} style={{ paddingHorizontal: 8 }}>
              <Text style={{ color: '#007AFF', fontSize: 24, fontWeight: '300' }}>+</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <DirectoryList
        items={items}
        loading={loading}
        error={error}
        onNavigateFolder={handleNavigateFolder}
        onOpenEntry={handleOpenEntry}
        onRefresh={refresh}
        getFolderIcon={getFolderIcon}
        onAddSubfolder={isConditionsDir ? () => setShowNewFolder(true) : undefined}
        addSubfolderLabel={isConditionsDir ? 'Add a new condition...' : undefined}
      />
      <NewFolderModal
        visible={showNewFolder}
        title="New Condition"
        defaultEmoji={parentCat?.emoji ?? '❤️‍🩹'}
        defaultColor={parentCat?.color ?? '#E74C3C'}
        onConfirm={handleAddCondition}
        onCancel={() => setShowNewFolder(false)}
      />
    </>
  );
}

/**
 * 'conditions/back-acne' -> 'Back Acne'
 * 'visits' -> 'Visits'
 */
function formatBreadcrumb(dirPath: string): string {
  const last = dirPath.split('/').pop() ?? dirPath;
  return last
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
