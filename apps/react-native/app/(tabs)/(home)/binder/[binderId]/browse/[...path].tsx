// app/binder/[binderId]/browse/[...path].tsx
// Generic directory browser. Works at any depth.
// URL: /binder/<id>/browse/visits  or  /binder/<id>/browse/conditions/back-acne

import React, { useMemo } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { DirectoryList } from '../../../../../../components/binder/DirectoryList';
import { useDirectoryContents } from '../../../../../../hooks/useDirectoryContents';
import type { DirFolder, DirEntry } from '../../../../../../core/binder/DirectoryReader';
import { useAuthContext } from '../../../../../../providers/AuthProvider';
import { useCryptoContext } from '../../../../../../providers/CryptoProvider';
import { BinderService } from '../../../../../../core/binder/BinderService';

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
    router.push({
      pathname: `/binder/${binderId}/entry/new`,
      params: { dirPath },
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: dirDisplayName,
        }}
      />
      <DirectoryList
        items={items}
        loading={loading}
        error={error}
        onNavigateFolder={handleNavigateFolder}
        onOpenEntry={handleOpenEntry}
        onAddEntry={handleAddEntry}
        onRefresh={refresh}
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
