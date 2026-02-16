// app/binder/[binderId]/browse/[...path].tsx
// Generic directory browser. Works at any depth.
// URL: /binder/<id>/browse/visits  or  /binder/<id>/browse/conditions/back-acne

import React from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { DirectoryList } from '../../../../components/binder/DirectoryList';
import { useDirectoryContents } from '../../../../hooks/useDirectoryContents';
import type { DirFolder, DirEntry } from '../../../../core/binder/DirectoryReader';

// TODO: Replace with real BinderService from context/provider
// import { useBinderService } from '../../../../hooks/useBinderService';

export default function BrowseDirectoryScreen() {
  const { binderId, path } = useLocalSearchParams<{
    binderId: string;
    path: string[];
  }>();
  const router = useRouter();

  // Reconstruct the directory path from the catch-all segments
  const dirPath = Array.isArray(path) ? path.join('/') : (path ?? '');
  const dirDisplayName = formatBreadcrumb(dirPath);

  // TODO: wire to real BinderService from provider
  // const binderService = useBinderService(binderId);
  const binderService = null; // Placeholder until providers are wired

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
