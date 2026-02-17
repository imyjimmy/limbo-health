// hooks/useDirectoryContents.ts
// Hook that loads and caches directory contents for the file browser.

import { useState, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import type { DirItem } from '../core/binder/DirectoryReader';
import type { BinderService } from '../core/binder/BinderService';

export interface UseDirectoryContentsResult {
  items: DirItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useDirectoryContents(
  binderService: BinderService | null,
  dirPath: string,
): UseDirectoryContentsResult {
  const [items, setItems] = useState<DirItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    if (!binderService) return;
    if (!hasLoaded.current) setLoading(true);
    setError(null);
    try {
      const result = await binderService.readDir(dirPath);
      setItems(result);
      hasLoaded.current = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to read directory';
      setError(msg);
      console.error(`useDirectoryContents(${dirPath}):`, err);
    } finally {
      setLoading(false);
    }
  }, [binderService, dirPath]);

  // Reload on every focus. With the directory cache, hits are instant (<1ms).
  // When cache was invalidated (e.g. note added from another screen), this
  // picks up the change. Without this, navigating back after adding a note
  // would show stale data.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { items, loading, error, refresh: load };
}
