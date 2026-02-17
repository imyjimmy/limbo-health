// app/binder/[binderId]/index.tsx
// Binder root: same DirectoryList as every other level, plus share button.

import React, { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { IconShare3 } from '@tabler/icons-react-native';
import { DirectoryList } from '../../../../../components/binder/DirectoryList';
import { useDirectoryContents } from '../../../../../hooks/useDirectoryContents';
import { QRDisplay } from '../../../../../components/QRDisplay';
import { useShareSession } from '../../../../../hooks/useShareSession';
import { useAuthContext } from '../../../../../providers/AuthProvider';
import { useCryptoContext } from '../../../../../providers/CryptoProvider';
import { BinderService } from '../../../../../core/binder/BinderService';
import { getCategory } from '../../../../../core/binder/categories';
import type { DirFolder, DirEntry } from '../../../../../core/binder/DirectoryReader';

export default function BinderDetailScreen() {
  const { binderId } = useLocalSearchParams<{ binderId: string }>();
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
    '', // root directory
  );

  const binderRepoDir = `binders/${binderId}`;
  const { state: shareState, startShare, cancel: cancelShare } = useShareSession(
    binderRepoDir,
    masterConversationKey,
    jwt,
  );

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

  // Resolve emoji/color for root-level folders from category definitions
  const getFolderIcon = useCallback((folder: DirFolder) => {
    const cat = getCategory(folder.name);
    return cat ? { emoji: cat.emoji, color: cat.color } : {};
  }, []);

  // Full-screen QR display when sharing
  if (shareState.phase === 'showing-qr' && shareState.qrPayload) {
    return (
      <>
        <Stack.Screen options={{ title: 'Share with Doctor' }} />
        <QRDisplay payload={shareState.qrPayload} onCancel={cancelShare} />
      </>
    );
  }

  const isSharing = shareState.phase !== 'idle' && shareState.phase !== 'error';

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Binder',
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

      {/* Share progress overlay */}
      {shareState.phase === 're-encrypting' && shareState.progress && (
        <View style={styles.shareProgress}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.shareProgressText}>
            Encrypting {shareState.progress.filesProcessed}/{shareState.progress.totalFiles} files...
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
