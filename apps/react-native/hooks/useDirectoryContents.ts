// hooks/useDirectoryContents.ts
// Hook that loads and caches directory contents for the file browser.

import { useState, useEffect, useCallback } from 'react';
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

  const load = useCallback(async () => {
    if (!binderService) return;
    setLoading(true);
    setError(null);
    try {
      const result = await binderService.readDir(dirPath);
      setItems(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to read directory';
      setError(msg);
      console.error(`useDirectoryContents(${dirPath}):`, err);
    } finally {
      setLoading(false);
    }
  }, [binderService, dirPath]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, error, refresh: load };
}
