// components/binder/BinderDirectory.tsx
// The ONE directory renderer for all binder levels.
// No awareness of categories, no branching on dirPath for rendering.
// Data drives rendering: items come from useDirectoryContents,
// folder icons come from .meta.json on each item.

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { IconShare3 } from '@tabler/icons-react-native';
import { DirectoryList } from './DirectoryList';
import { NewFolderModal } from './NewFolderModal';
import { DebugOverlay } from './DebugOverlay';
import { QRDisplay } from '../QRDisplay';
import { dirSize, ptSize } from '../../core/binder/BinderCache';
import { setLastViewed } from '../../core/binder/LastViewedStore';
import { useDirectoryContents } from '../../hooks/useDirectoryContents';
import { useShareSession } from '../../hooks/useShareSession';
import { useAuthContext } from '../../providers/AuthProvider';
import { useCryptoContext } from '../../providers/CryptoProvider';
import { BinderService } from '../../core/binder/BinderService';
import { slugify } from '../../core/binder/FileNaming';
import type { DirFolder, DirEntry, DirItem } from '../../core/binder/DirectoryReader';

interface BinderDirectoryProps {
  binderId: string;
  dirPath: string;
  title: string;
}

export function BinderDirectory({ binderId, dirPath, title }: BinderDirectoryProps) {
  const router = useRouter();

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

  // --- Track last viewed for Document tab (only when focused) ---
  useFocusEffect(
    useCallback(() => {
      setLastViewed(binderId, dirPath);
    }, [binderId, dirPath]),
  );

  // --- Share ---
  const binderRepoDir = `binders/${binderId}`;
  const { state: shareState, startShare, cancel: cancelShare } = useShareSession(
    binderRepoDir,
    masterConversationKey,
    jwt,
  );

  // --- Navigation ---
  const handleNavigateFolder = useCallback(
    (folder: DirFolder) => {
      router.push(`/binder/${binderId}/browse/${folder.relativePath}`);
    },
    [router, binderId],
  );

  const handleOpenEntry = useCallback(
    (entry: DirEntry) => {
      router.push(`/binder/${binderId}/entry/${entry.relativePath}`);
    },
    [router, binderId],
  );

  // --- Folder icons: from item metadata only ---
  const getFolderIcon = useCallback(
    (folder: DirFolder) => ({
      emoji: folder.meta?.icon ?? '📁',
      color: folder.meta?.color,
    }),
    [],
  );

  // --- Delete item ---
  const handleDeleteItem = useCallback(
    async (item: DirItem) => {
      if (!binderService) return;
      try {
        if (item.kind === 'folder') {
          await binderService.deleteFolder(item.relativePath);
        } else {
          await binderService.deleteEntry(item.relativePath);
        }
        refresh();
      } catch (err: any) {
        const message = err?.message ?? '';
        const isPushError =
          message.includes('push') ||
          message.includes('network') ||
          message.includes('401');
        if (isPushError) {
          console.warn('Push failed after delete, changes saved locally:', message);
          refresh();
        } else {
          Alert.alert('Error', 'Failed to delete. Please try again.');
        }
      }
    },
    [binderService, refresh],
  );

  // --- Add folder ---
  const [showNewFolder, setShowNewFolder] = useState(false);

  const handleAddFolder = useCallback(
    async (name: string, emoji: string, color: string) => {
      if (!binderService) return;
      setShowNewFolder(false);
      const slug = slugify(name);
      const folderPath = dirPath ? `${dirPath}/${slug}` : slug;
      try {
        await binderService.createSubfolder(folderPath, name, undefined, {
          icon: emoji,
          color,
        });
        refresh();
      } catch (err: any) {
        const message = err?.message ?? '';
        const isPushError =
          message.includes('push') ||
          message.includes('network') ||
          message.includes('401');
        if (isPushError) {
          console.warn('Push failed, folder created locally:', message);
          refresh();
        } else {
          Alert.alert('Error', 'Failed to create folder. Please try again.');
        }
      }
    },
    [binderService, dirPath, refresh],
  );

  // --- Render ---
  const isSharing = shareState.phase !== 'idle' && shareState.phase !== 'error';

  if (shareState.phase === 'showing-qr' && shareState.qrPayload) {
    return (
      <>
        <Stack.Screen options={{ title: 'Share with Doctor' }} />
        <QRDisplay payload={shareState.qrPayload} onCancel={cancelShare} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <TouchableOpacity
              onPress={startShare}
              style={styles.headerButton}
              disabled={isSharing}
            >
              {isSharing ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <IconShare3 size={22} color="#007AFF" strokeWidth={2} />
              )}
            </TouchableOpacity>
          ),
        }}
      />

      {shareState.phase === 're-encrypting' && shareState.progress && (
        <View style={styles.shareProgress}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.shareProgressText}>
            Encrypting {shareState.progress.filesProcessed}/
            {shareState.progress.totalFiles} files...
          </Text>
        </View>
      )}
      {shareState.phase === 'pushing-staging' && (
        <View style={styles.shareProgress}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.shareProgressText}>Uploading...</Text>
        </View>
      )}
      {shareState.phase === 'creating-session' && (
        <View style={styles.shareProgress}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.shareProgressText}>Creating session...</Text>
        </View>
      )}
      {shareState.phase === 'error' && (
        <View style={styles.shareError}>
          <Text style={styles.shareErrorText}>{shareState.error}</Text>
          <TouchableOpacity onPress={startShare}>
            <Text style={styles.shareRetryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <DirectoryList
        items={items}
        loading={loading}
        error={error}
        onNavigateFolder={handleNavigateFolder}
        onOpenEntry={handleOpenEntry}
        onRefresh={refresh}
        getFolderIcon={getFolderIcon}
        onAddSubfolder={() => setShowNewFolder(true)}
        addSubfolderLabel="Add a new folder..."
        onDeleteItem={handleDeleteItem}
      />
      <NewFolderModal
        visible={showNewFolder}
        title="New Folder"
        onConfirm={handleAddFolder}
        onCancel={() => setShowNewFolder(false)}
      />
      <DebugOverlay
        data={{ dirPath, items, cache: { dir: dirSize(), pt: ptSize() } }}
        loadExtra={() =>
          binderService?.listAllFiles() ?? Promise.resolve([])
        }
        extraLabel="All Files"
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  shareProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#EBF5FF',
  },
  shareProgressText: {
    fontSize: 13,
    color: '#007AFF',
  },
  shareError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF0F0',
  },
  shareErrorText: {
    fontSize: 13,
    color: '#c00',
    flex: 1,
  },
  shareRetryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    paddingLeft: 12,
  },
});
