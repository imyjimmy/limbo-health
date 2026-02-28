// components/binder/BinderDirectory.tsx
// The ONE directory renderer for all binder levels.
// No awareness of categories, no branching on dirPath for rendering.
// Data drives rendering: items come from useDirectoryContents,
// folder icons come from .meta.json on each item.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { IconShare3 } from '@tabler/icons-react-native';
import { DirectoryList } from './DirectoryList';
import { NewFolderModal } from './NewFolderModal';
import { DebugOverlay } from './DebugOverlay';
import { DEFAULT_FOLDER_COLOR } from './folderAppearance';
import {
  BinderTextureBackground,
  DEFAULT_BINDER_TEXTURE_ID,
  isBinderTextureId,
  type BinderTextureId,
} from './BinderTextureBackground';
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
import { subscribeDirectoryChanged } from '../../core/binder/DirectoryEvents';

interface BinderDirectoryProps {
  binderId: string;
  dirPath: string;
  title: string;
}

const BINDER_TEXTURES_KEY = 'limbo_binder_card_textures_v1';

export function BinderDirectory({ binderId, dirPath, title }: BinderDirectoryProps) {
  const router = useRouter();
  const [textureId, setTextureId] = useState<BinderTextureId>(DEFAULT_BINDER_TEXTURE_ID);
  const [reorderSaving, setReorderSaving] = useState(false);
  const reorderPersistingRef = useRef(false);

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
        author: {
          name: authState.metadata?.name || authState.googleProfile?.name || 'Limbo Health',
          email: authState.googleProfile?.email || 'app@limbo.health',
        },
      },
      masterConversationKey,
    );
  }, [binderId, masterConversationKey, jwt, authState.metadata?.name, authState.googleProfile?.name, authState.googleProfile?.email]);

  const { items, loading, error, refresh } = useDirectoryContents(
    binderService,
    dirPath,
  );

  const loadTexturePreference = useCallback(async () => {
    try {
      const raw = await SecureStore.getItemAsync(BINDER_TEXTURES_KEY);
      if (!raw) {
        setTextureId(DEFAULT_BINDER_TEXTURE_ID);
        return;
      }
      const parsedUnknown = JSON.parse(raw) as unknown;
      if (!parsedUnknown || typeof parsedUnknown !== 'object' || Array.isArray(parsedUnknown)) {
        setTextureId(DEFAULT_BINDER_TEXTURE_ID);
        return;
      }
      const parsed = parsedUnknown as Record<string, unknown>;
      const maybeTexture = parsed[binderId];
      if (typeof maybeTexture === 'string' && isBinderTextureId(maybeTexture)) {
        setTextureId(maybeTexture);
      } else {
        setTextureId(DEFAULT_BINDER_TEXTURE_ID);
      }
    } catch (err) {
      console.warn('Failed to read binder texture preference:', err);
      setTextureId(DEFAULT_BINDER_TEXTURE_ID);
    }
  }, [binderId]);

  useEffect(() => {
    loadTexturePreference();
  }, [loadTexturePreference]);

  // Run one-time migration on binder root open
  useEffect(() => {
    if (dirPath !== '' || !binderService) return;
    binderService.migrateContextualAdd().catch((err) => {
      console.warn('contextualAdd migration failed:', err);
    });
  }, [binderService, dirPath]);

  useEffect(() => {
    const unsubscribe = subscribeDirectoryChanged((event) => {
      if (event.binderId !== binderId) return;
      const current = dirPath.replace(/^\/+|\/+$/g, '');
      const changed = event.dirPath.replace(/^\/+|\/+$/g, '');
      const changedParent = changed.includes('/') ? changed.slice(0, changed.lastIndexOf('/')) : '';
      if (changed === current || changedParent === current) {
        refresh();
      }
    });
    return unsubscribe;
  }, [binderId, dirPath, refresh]);

  // --- Track last viewed for Document tab (only when focused) ---
  useFocusEffect(
    useCallback(() => {
      setLastViewed(binderId, dirPath);
    }, [binderId, dirPath]),
  );
  useFocusEffect(
    useCallback(() => {
      loadTexturePreference();
    }, [loadTexturePreference]),
  );

  useEffect(() => {
    reorderPersistingRef.current = false;
    setReorderSaving(false);
  }, [binderId, dirPath]);

  // --- Share ---
  const binderRepoDir = `binders/${binderId}`;
  const { state: shareState, startShare, retryPush, cancel: cancelShare } = useShareSession(
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
    (folder: DirFolder) => {
      const raw = folder.meta?.icon;
      const emoji = raw === 'mic' ? '🎙️' : (raw ?? '📁');
      return {
        emoji,
        color: folder.meta?.color,
      };
    },
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
        const lower = message.toLowerCase();
        const isPushError =
          lower.includes('push') ||
          lower.includes('network') ||
          lower.includes('401');
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

  const handleReorderItems = useCallback(
    async (nextItems: DirItem[]) => {
      if (!binderService || reorderPersistingRef.current) return;
      reorderPersistingRef.current = true;
      setReorderSaving(true);
      try {
        await binderService.reorderDirectoryItems(
          dirPath,
          nextItems.map((item) => ({ kind: item.kind, relativePath: item.relativePath })),
        );
        refresh();
      } catch (err: any) {
        Alert.alert('Error', err?.message ?? 'Failed to save item order.');
      } finally {
        reorderPersistingRef.current = false;
        setReorderSaving(false);
      }
    },
    [binderService, dirPath, refresh],
  );

  // --- Add folder ---
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showEditFolder, setShowEditFolder] = useState(false);
  const [folderToEdit, setFolderToEdit] = useState<DirFolder | null>(null);

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
        const lower = message.toLowerCase();
        const isPushError =
          lower.includes('push') ||
          lower.includes('network') ||
          lower.includes('401');
        if (isPushError) {
          console.warn('Push failed, folder created locally:', message);
          refresh();
        } else {
          Alert.alert('Error', message || 'Failed to create folder. Please try again.');
        }
      }
    },
    [binderService, dirPath, refresh],
  );

  const handleStartEditFolder = useCallback((folder: DirFolder) => {
    setFolderToEdit(folder);
    setShowEditFolder(true);
  }, []);

  const closeEditFolder = useCallback(() => {
    setShowEditFolder(false);
    setFolderToEdit(null);
  }, []);

  const handleEditFolder = useCallback(
    async (name: string, emoji: string, color: string) => {
      if (!binderService || !folderToEdit) return;
      setShowEditFolder(false);
      try {
        await binderService.updateFolderMeta(folderToEdit.relativePath, {
          displayName: name,
          icon: emoji,
          color,
        });
        setFolderToEdit(null);
        refresh();
      } catch (err: any) {
        const message = err?.message ?? '';
        const lower = message.toLowerCase();
        const isPushError =
          lower.includes('push') ||
          lower.includes('network') ||
          lower.includes('401');
        if (isPushError) {
          console.warn('Push failed after folder edit, changes saved locally:', message);
          setFolderToEdit(null);
          refresh();
        } else {
          Alert.alert('Error', message || 'Failed to update folder. Please try again.');
          setShowEditFolder(true);
        }
      }
    },
    [binderService, folderToEdit, refresh],
  );

  // --- Render ---
  const isSharing = shareState.phase !== 'idle' && shareState.phase !== 'error';

  if (shareState.phase === 'showing-qr' && shareState.qrPayload) {
    return (
      <>
        <Stack.Screen options={{ title: 'Share with Doctor', headerRight: () => null }} />
        <QRDisplay payload={shareState.qrPayload} pushStatus={shareState.pushStatus} onRetry={retryPush} onCancel={cancelShare} />
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
      {reorderSaving && (
        <View style={styles.reorderProgress}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.shareProgressText}>Saving order...</Text>
        </View>
      )}

      <View style={styles.directoryLayer}>
        <BinderTextureBackground textureId={textureId} />
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
          onEditFolder={handleStartEditFolder}
          onReorder={handleReorderItems}
          reorderBusy={reorderSaving}
        />
      </View>
      <NewFolderModal
        visible={showNewFolder}
        title="New Folder"
        onConfirm={handleAddFolder}
        onCancel={() => setShowNewFolder(false)}
      />
      <NewFolderModal
        visible={showEditFolder}
        title="Edit Folder"
        initialName={
          folderToEdit
            ? (folderToEdit.meta?.displayName ?? formatFolderName(folderToEdit.name))
            : ''
        }
        defaultEmoji={
          folderToEdit
            ? (folderToEdit.meta?.icon ?? getFolderIcon(folderToEdit).emoji ?? '📁')
            : '📁'
        }
        defaultColor={
          folderToEdit
            ? (folderToEdit.meta?.color ?? getFolderIcon(folderToEdit).color ?? DEFAULT_FOLDER_COLOR)
            : DEFAULT_FOLDER_COLOR
        }
        onConfirm={handleEditFolder}
        onCancel={closeEditFolder}
      />
      <DebugOverlay
        sourceInfo={{
          kind: 'mixed',
          summary: 'Current JSON is generated from in-memory UI/debug state.',
          details: 'Git Files (HEAD) is generated via git.listFiles and is not a JSON file in the repo.',
        }}
        data={{ dirPath, items: items.map(it => {
          if (it.kind !== 'folder') return it;
          const { childCount, ...rest } = it;
          return rest;
        }), cache: { dir: dirSize(), pt: ptSize() } }}
        loadExtra={async () => {
          const files = await (binderService?.listAllFiles() ?? Promise.resolve([]));
          return {
            source: 'git.listFiles(ref: HEAD)',
            count: files.length,
            files,
          };
        }}
        extraLabel="Git Files (HEAD)"
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  directoryLayer: {
    flex: 1,
    position: 'relative',
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
  reorderProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#EAF3FF',
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

function formatFolderName(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
