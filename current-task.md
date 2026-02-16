Let me see what's already built in the mobile app.Good, I now have a comprehensive picture of the architecture, existing code (BinderService, EncryptedIO, categories, DocumentModel, GitEngine, fsAdapter), and the binder navigation discussion. Let me implement this.

Here's the directory tree of new and modified files:

```
limbo-health-mobile/
├── core/
│   └── binder/
│       ├── BinderService.ts         # MODIFY: add readDir(), readPatientInfo()
│       ├── DocumentModel.ts         # MODIFY: add extractTitle()
│       └── DirectoryReader.ts       # NEW: reads dir, classifies items, decrypts metadata
├── hooks/
│   ├── useDirectoryContents.ts      # NEW: hook wrapping DirectoryReader
│   └── useBinderDetail.ts           # NEW: hook for binder detail screen
├── components/
│   ├── FolderRow.tsx                # NEW: tappable folder row
│   ├── EntryCard.tsx                # NEW: card for .json entry with decrypted metadata
│   ├── DirectoryList.tsx            # NEW: FlatList directory browser + FAB
│   ├── CategoryGrid.tsx             # NEW: 3x3 grid of top-level categories
│   └── PatientInfoCard.tsx          # NEW: patient demographics summary
└── app/
    └── binder/
        └── [binderId]/
            ├── index.tsx            # NEW: binder detail (patient info + grid/timeline toggle)
            ├── browse/
            │   └── [...path].tsx    # NEW: generic directory browser (any depth)
            └── entry/
                └── [...entryPath].tsx  # NEW: entry detail (decrypt + render)
```

---

### 1. `core/binder/DocumentModel.ts` — additions

Add this to the existing file, after the `extractEntryMetadata` function:

```typescript
// --- Title extraction ---

/**
 * Extract a human-readable title from the markdown value field.
 * Looks for the first H1 heading. Falls back to first line, then type.
 */
export function extractTitle(doc: MedicalDocument): string {
  const val = doc.value;
  // Match first # heading
  const h1Match = val.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();
  // Fallback: first non-empty line
  const firstLine = val.split('\n').find((l) => l.trim().length > 0);
  if (firstLine) return firstLine.trim().slice(0, 60);
  // Last resort
  return doc.metadata.type ?? 'Untitled';
}

/**
 * Extended metadata for list views — includes title.
 */
export interface EntryPreview extends EntryMetadata {
  title: string;
  provider?: string;
  tags?: string[];
  hasChildren: boolean;
}

export function extractEntryPreview(
  path: string,
  doc: MedicalDocument,
): EntryPreview {
  return {
    ...extractEntryMetadata(path, doc),
    title: extractTitle(doc),
    provider: doc.metadata.provider,
    tags: doc.metadata.tags,
    hasChildren: doc.children.length > 0,
  };
}
```

Also extend the existing `EntryMetadata` type — or rather, `EntryPreview` already extends it. No change needed to `EntryMetadata` itself.

---

### 2. `core/binder/DirectoryReader.ts` — NEW

```typescript
// core/binder/DirectoryReader.ts
// Reads a directory within a binder repo and classifies its contents.
// Uses the fsAdapter for filesystem access and EncryptedIO for metadata decryption.
//
// This is the core logic behind the DirectoryList component.
// It does NOT import React — pure business logic.

import type { EncryptedIO } from './EncryptedIO';
import { extractEntryPreview, type EntryPreview } from './DocumentModel';

// --- FS interface needed by DirectoryReader ---

export interface DirFS {
  promises: {
    readdir(path: string): Promise<string[]>;
    stat(path: string): Promise<{ isDirectory(): boolean }>;
  };
}

// --- Types ---

export interface DirFolder {
  kind: 'folder';
  name: string;
  /** Path relative to repo root, e.g. 'conditions/back-acne' */
  relativePath: string;
}

export interface DirEntry {
  kind: 'entry';
  name: string;
  /** Path relative to repo root, e.g. 'visits/2026-02-12-follow-up.json' */
  relativePath: string;
  preview: EntryPreview | null; // null if decryption failed
}

export type DirItem = DirFolder | DirEntry;

// --- Reader ---

/**
 * Read a directory inside the binder and return classified, sorted items.
 *
 * @param dirPath - Path relative to repo root. '/' for root, 'conditions/' for conditions folder.
 * @param fs - Filesystem adapter (from createFSAdapter)
 * @param io - EncryptedIO instance (for decrypting .json metadata)
 */
export async function readDirectory(
  dirPath: string,
  fs: DirFS,
  io: EncryptedIO,
): Promise<DirItem[]> {
  const normalizedDir = dirPath.startsWith('/') ? dirPath : '/' + dirPath;
  const names = await fs.promises.readdir(normalizedDir);

  const items: DirItem[] = [];

  for (const name of names) {
    // Skip hidden files and git internals
    if (name.startsWith('.')) continue;
    // Skip .enc sidecar files — they're referenced by their parent .json
    if (name.endsWith('.enc')) continue;
    // Skip patient-info.json — shown separately in the binder detail header
    if (name === 'patient-info.json' && normalizedDir === '/') continue;

    const childPath = normalizedDir === '/'
      ? '/' + name
      : normalizedDir + '/' + name;

    const stat = await fs.promises.stat(childPath);

    if (stat.isDirectory()) {
      const relativePath = childPath.startsWith('/')
        ? childPath.slice(1)
        : childPath;
      items.push({
        kind: 'folder',
        name,
        relativePath,
      });
    } else if (name.endsWith('.json')) {
      const relativePath = childPath.startsWith('/')
        ? childPath.slice(1)
        : childPath;
      let preview: EntryPreview | null = null;
      try {
        const doc = await io.readDocument(childPath);
        preview = extractEntryPreview(relativePath, doc);
      } catch (err) {
        console.warn(`Failed to decrypt metadata for ${relativePath}:`, err);
      }
      items.push({
        kind: 'entry',
        name,
        relativePath,
        preview,
      });
    }
    // Any other file types are silently ignored
  }

  // Sort: folders first (alphabetical), then entries (newest first by filename which is date-prefixed)
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    if (a.kind === 'folder' && b.kind === 'folder') {
      return a.name.localeCompare(b.name);
    }
    // Entries: reverse alphabetical puts newest dates first (YYYY-MM-DD prefix)
    return b.name.localeCompare(a.name);
  });

  return items;
}
```

---

### 3. `core/binder/BinderService.ts` — additions

Add these methods inside the existing `BinderService` class:

```typescript
  // --- Directory browsing ---

  /**
   * Read and classify contents of a directory within the binder.
   * Used by the DirectoryList component for file-browser navigation.
   */
  async readDir(dirPath: string): Promise<DirItem[]> {
    const { readDirectory } = await import('./DirectoryReader');
    const fs = createFSAdapter(this.info.repoDir);
    return readDirectory(dirPath, fs, this.io);
  }

  /**
   * Read and decrypt patient-info.json from the binder root.
   */
  async readPatientInfo(): Promise<MedicalDocument | null> {
    try {
      return await this.io.readDocument('/patient-info.json');
    } catch {
      return null;
    }
  }
```

And add the import at the top of the file:

```typescript
import type { DirItem } from './DirectoryReader';
```

---

### 4. `hooks/useDirectoryContents.ts` — NEW

```typescript
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
```

---

### 5. `hooks/useBinderDetail.ts` — NEW

```typescript
// hooks/useBinderDetail.ts
// Hook for the top-level binder detail screen.
// Loads patient info and provides the BinderService instance.

import { useState, useEffect, useMemo } from 'react';
import { BinderService, type BinderInfo } from '../core/binder/BinderService';
import type { MedicalDocument } from '../types/document';

export interface UseBinderDetailResult {
  binderService: BinderService | null;
  patientInfo: MedicalDocument | null;
  loading: boolean;
  error: string | null;
}

/**
 * @param binderInfo - repo ID, dir, and auth config
 * @param masterConversationKey - from CryptoProvider
 */
export function useBinderDetail(
  binderInfo: BinderInfo | null,
  masterConversationKey: Uint8Array | null,
): UseBinderDetailResult {
  const [patientInfo, setPatientInfo] = useState<MedicalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const binderService = useMemo(() => {
    if (!binderInfo || !masterConversationKey) return null;
    return new BinderService(binderInfo, masterConversationKey);
  }, [binderInfo, masterConversationKey]);

  useEffect(() => {
    if (!binderService) return;
    setLoading(true);
    binderService
      .readPatientInfo()
      .then(setPatientInfo)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load binder');
      })
      .finally(() => setLoading(false));
  }, [binderService]);

  return { binderService, patientInfo, loading, error };
}
```

---

### 6. `components/FolderRow.tsx` — NEW

```typescript
// components/FolderRow.tsx

import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import type { DirFolder } from '../core/binder/DirectoryReader';

interface FolderRowProps {
  item: DirFolder;
  onPress: (folder: DirFolder) => void;
}

export function FolderRow({ item, onPress }: FolderRowProps) {
  // Count-based subtitle could be added later (requires reading the subfolder)
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(item)}
      activeOpacity={0.6}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>📁</Text>
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.name}>{formatFolderName(item.name)}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

/** Convert slug to display name: 'back-acne' → 'Back Acne' */
function formatFolderName(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  chevron: {
    fontSize: 22,
    color: '#999',
    marginLeft: 8,
  },
});
```

---

### 7. `components/EntryCard.tsx` — NEW

```typescript
// components/EntryCard.tsx

import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import type { DirEntry } from '../core/binder/DirectoryReader';

interface EntryCardProps {
  item: DirEntry;
  onPress: (entry: DirEntry) => void;
}

export function EntryCard({ item, onPress }: EntryCardProps) {
  const preview = item.preview;
  const title = preview?.title ?? item.name.replace('.json', '');
  const dateStr = preview?.created
    ? formatDate(preview.created)
    : extractDateFromFilename(item.name);
  const typeLabel = preview?.type ? formatType(preview.type) : '';

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(item)}
      activeOpacity={0.6}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {preview?.hasChildren && (
          <View style={styles.attachmentBadge}>
            <Text style={styles.attachmentIcon}>📎</Text>
          </View>
        )}
      </View>

      <View style={styles.metaRow}>
        {typeLabel ? (
          <View style={styles.typePill}>
            <Text style={styles.typeText}>{typeLabel}</Text>
          </View>
        ) : null}
        {dateStr ? <Text style={styles.date}>{dateStr}</Text> : null}
        {preview?.provider ? (
          <Text style={styles.provider} numberOfLines={1}>
            {preview.provider}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function extractDateFromFilename(name: string): string {
  const match = name.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? formatDate(match[1]) : '';
}

function formatType(type: string): string {
  const map: Record<string, string> = {
    visit: 'Visit',
    lab: 'Lab',
    condition: 'Condition',
    medication: 'Medication',
    attachment_ref: 'Photo',
    immunization: 'Immunization',
    allergy: 'Allergy',
    procedure: 'Procedure',
  };
  return map[type] ?? type;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
    flex: 1,
  },
  attachmentBadge: {
    marginLeft: 6,
  },
  attachmentIcon: {
    fontSize: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typePill: {
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  date: {
    fontSize: 13,
    color: '#888',
  },
  provider: {
    fontSize: 13,
    color: '#888',
    flex: 1,
  },
});
```

---

### 8. `components/DirectoryList.tsx` — NEW

```typescript
// components/DirectoryList.tsx
// The core reusable file-browser component.
// Shows folders and .json entry cards from a binder directory.
// Tap folder → onNavigateFolder callback.
// Tap entry → onOpenEntry callback.
// FAB "+" → onAddEntry callback with current dirPath.

import React from 'react';
import {
  FlatList,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import type { DirItem, DirFolder, DirEntry } from '../core/binder/DirectoryReader';
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
```

---

### 9. `components/CategoryGrid.tsx` — NEW

```typescript
// components/CategoryGrid.tsx
// 3x3 grid of top-level category folders shown on the binder detail screen.
// Tapping a category navigates into that folder.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { getAllCategories, type Category } from '../core/binder/categories';

interface CategoryGridProps {
  onSelectCategory: (category: Category) => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  visits: '🩺',
  conditions: '❤️‍🩹',
  labs: '🧪',
  medications: '💊',
  immunizations: '💉',
  allergies: '⚠️',
  procedures: '🔬',
  imaging: '📷',
  documents: '📄',
  insurance: '🏥',
};

export function CategoryGrid({ onSelectCategory }: CategoryGridProps) {
  const categories = getAllCategories();
  const screenWidth = Dimensions.get('window').width;
  const cellSize = (screenWidth - 32 - 16) / 3; // 16px padding each side + 8px gap × 2

  return (
    <View style={styles.grid}>
      {categories.map((cat) => (
        <TouchableOpacity
          key={cat.slug}
          style={[styles.cell, { width: cellSize, height: cellSize }]}
          onPress={() => onSelectCategory(cat)}
          activeOpacity={0.7}
        >
          <Text style={styles.emoji}>
            {CATEGORY_ICONS[cat.slug] ?? '📁'}
          </Text>
          <Text style={styles.label} numberOfLines={1}>
            {cat.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
  },
  cell: {
    backgroundColor: '#fff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
  },
  emoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    color: '#444',
    textAlign: 'center',
  },
});
```

---

### 10. `components/PatientInfoCard.tsx` — NEW

```typescript
// components/PatientInfoCard.tsx
// Summary card showing patient demographics from patient-info.json.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { MedicalDocument } from '../types/document';
import { extractTitle } from '../core/binder/DocumentModel';

interface PatientInfoCardProps {
  doc: MedicalDocument;
}

export function PatientInfoCard({ doc }: PatientInfoCardProps) {
  const name = extractTitle(doc);
  const dob = doc.metadata.tags?.find((t) => t.startsWith('dob:'))?.slice(4);
  const updated = doc.metadata.updated ?? doc.metadata.created;
  const updatedStr = formatRelative(updated);

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{name}</Text>
      {dob ? <Text style={styles.detail}>DOB: {dob}</Text> : null}
      <Text style={styles.updated}>Last updated {updatedStr}</Text>
    </View>
  );
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
  },
  name: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  detail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  updated: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 4,
  },
});
```

---

### 11. `app/binder/[binderId]/index.tsx` — NEW

```typescript
// app/binder/[binderId]/index.tsx
// Binder detail screen: patient info card + category grid / timeline toggle.

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useBinderDetail } from '../../../hooks/useBinderDetail';
import { PatientInfoCard } from '../../../components/PatientInfoCard';
import { CategoryGrid } from '../../../components/CategoryGrid';
import type { Category } from '../../../core/binder/categories';

// TODO: Replace with real values from CryptoProvider / binder list
// These will come from your providers once wired up.
// Stubbed here to show the screen structure.

export default function BinderDetailScreen() {
  const { binderId } = useLocalSearchParams<{ binderId: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'categories' | 'timeline'>(
    'categories',
  );

  // TODO: wire to real provider
  // const { binderService, patientInfo, loading, error } = useBinderDetail(binderInfo, masterKey);
  const loading = false;
  const error: string | null = null;
  const patientInfo = null; // Will be populated once wired

  const handleCategoryPress = (category: Category) => {
    router.push(`/binder/${binderId}/browse/${category.folder}`);
  };

  const handleSharePress = () => {
    router.push(`/binder/${binderId}/share`);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'My Binder',
          headerRight: () => (
            <TouchableOpacity onPress={handleSharePress} style={styles.headerButton}>
              <Text style={styles.shareIcon}>↗</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {/* Patient info */}
        {patientInfo ? (
          <PatientInfoCard doc={patientInfo} />
        ) : (
          <View style={styles.patientPlaceholder}>
            <Text style={styles.placeholderText}>
              {error ?? 'Loading patient info...'}
            </Text>
          </View>
        )}

        {/* Tab toggle */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'categories' && styles.activeTab]}
            onPress={() => setActiveTab('categories')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'categories' && styles.activeTabText,
              ]}
            >
              Categories
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'timeline' && styles.activeTab]}
            onPress={() => setActiveTab('timeline')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'timeline' && styles.activeTabText,
              ]}
            >
              Timeline
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {activeTab === 'categories' ? (
          <CategoryGrid onSelectCategory={handleCategoryPress} />
        ) : (
          <View style={styles.timelinePlaceholder}>
            <Text style={styles.placeholderText}>
              Timeline view — coming soon
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  content: {
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  shareIcon: {
    fontSize: 20,
  },
  patientPlaceholder: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
  },
  placeholderText: {
    fontSize: 14,
    color: '#999',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
  },
  activeTabText: {
    color: '#1a1a1a',
  },
  timelinePlaceholder: {
    padding: 40,
    alignItems: 'center',
  },
});
```

---

### 12. `app/binder/[binderId]/browse/[...path].tsx` — NEW

This is the heart of it — the generic directory browser screen.

```typescript
// app/binder/[binderId]/browse/[...path].tsx
// Generic directory browser. Works at any depth.
// URL: /binder/<id>/browse/visits  or  /binder/<id>/browse/conditions/back-acne

import React from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { DirectoryList } from '../../../../components/DirectoryList';
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
    // Encode the relative path for the entry detail route
    const encodedPath = encodeURIComponent(entry.relativePath);
    router.push(`/binder/${binderId}/entry/${encodedPath}`);
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
 * 'conditions/back-acne' → 'Back Acne'
 * 'visits' → 'Visits'
 */
function formatBreadcrumb(dirPath: string): string {
  const last = dirPath.split('/').pop() ?? dirPath;
  return last
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
```

---

### 13. `app/binder/[binderId]/entry/[...entryPath].tsx` — NEW

```typescript
// app/binder/[binderId]/entry/[...entryPath].tsx
// Entry detail screen: decrypt a .json document, render markdown, show children.

import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import type { MedicalDocument } from '../../../../types/document';
import { extractTitle } from '../../../../core/binder/DocumentModel';

// TODO: Replace with real BinderService from context/provider
// import { useBinderService } from '../../../../hooks/useBinderService';

export default function EntryDetailScreen() {
  const { binderId, entryPath } = useLocalSearchParams<{
    binderId: string;
    entryPath: string[];
  }>();

  // Reconstruct path: could be encoded single segment or catch-all array
  const rawPath = Array.isArray(entryPath)
    ? entryPath.join('/')
    : decodeURIComponent(entryPath ?? '');

  const [doc, setDoc] = useState<MedicalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // TODO: wire to real BinderService from provider
  // const binderService = useBinderService(binderId);

  useEffect(() => {
    // Placeholder: will call binderService.readEntry(rawPath)
    // once providers are wired.
    setLoading(false);
    setError('BinderService not yet wired to providers');
  }, [rawPath]);

  const title = doc ? extractTitle(doc) : 'Entry';

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Decrypting...</Text>
        </View>
      </>
    );
  }

  if (error || !doc) {
    return (
      <>
        <Stack.Screen options={{ title: 'Error' }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Document not found'}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {/* Metadata bar */}
        <View style={styles.metaBar}>
          <Text style={styles.metaType}>{doc.metadata.type}</Text>
          <Text style={styles.metaDate}>
            {new Date(doc.metadata.created).toLocaleDateString()}
          </Text>
          {doc.metadata.provider ? (
            <Text style={styles.metaProvider}>{doc.metadata.provider}</Text>
          ) : null}
        </View>

        {/* Markdown body — plain text for now, swap with MarkdownRenderer later */}
        <View style={styles.bodyContainer}>
          <Text style={styles.bodyText}>{doc.value}</Text>
        </View>

        {/* Children (addendums, attachments) */}
        {doc.children.length > 0 && (
          <View style={styles.childrenSection}>
            <Text style={styles.childrenHeader}>
              {doc.children.length} attachment{doc.children.length > 1 ? 's' : ''}
            </Text>
            {doc.children.map((child, idx) => (
              <ChildCard key={idx} child={child} index={idx} />
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

function ChildCard({
  child,
  index,
}: {
  child: MedicalDocument;
  index: number;
}) {
  const isAttachment =
    child.metadata.type === 'attachment' ||
    child.metadata.type === 'attachment_ref';
  const label = isAttachment
    ? `${child.metadata.format?.toUpperCase() ?? 'File'} attachment`
    : extractTitle(child);

  return (
    <View style={styles.childCard}>
      <Text style={styles.childIndex}>{index + 1}</Text>
      <View style={styles.childContent}>
        <Text style={styles.childLabel}>{label}</Text>
        {isAttachment && child.metadata.originalSizeBytes ? (
          <Text style={styles.childMeta}>
            {formatBytes(child.metadata.originalSizeBytes)}
          </Text>
        ) : null}
        {!isAttachment ? (
          <Text style={styles.childPreview} numberOfLines={2}>
            {child.value.slice(0, 120)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fafafa' },
  content: { paddingBottom: 40 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: { marginTop: 12, fontSize: 14, color: '#888' },
  errorText: { fontSize: 15, color: '#c00', textAlign: 'center' },
  metaBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  metaType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a73e8',
    textTransform: 'uppercase',
  },
  metaDate: { fontSize: 12, color: '#888' },
  metaProvider: { fontSize: 12, color: '#888' },
  bodyContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 8,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
  },
  childrenSection: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  childrenHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  childCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
  },
  childIndex: {
    width: 24,
    fontSize: 14,
    fontWeight: '600',
    color: '#aaa',
  },
  childContent: { flex: 1 },
  childLabel: { fontSize: 14, fontWeight: '500', color: '#333' },
  childMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  childPreview: { fontSize: 13, color: '#666', marginTop: 4 },
});
```

---

That's the full implementation. Here's a summary of the navigation flow:

**Binder List** (`(tabs)/index.tsx`, already exists) → tap a binder → **Binder Detail** (`binder/[binderId]/index.tsx`) which shows the PatientInfoCard + Categories/Timeline segmented control. The CategoryGrid shows the 9 folders. Tapping a category pushes → **Browse** (`binder/[binderId]/browse/[...path].tsx`) which renders the DirectoryList. Tap a folder → same route pushes again with deeper path. Tap a .json file → **Entry Detail** (`binder/[binderId]/entry/[...entryPath].tsx`). The "+" FAB passes the current `dirPath` to `entry/new.tsx` (which you already have specced out).

The three TODO markers (`// TODO: wire to real provider`) are where you'll connect the CryptoProvider once the provider wiring pass happens. The core logic (DirectoryReader, hooks, components) is fully functional — it just needs a real `BinderService` instance to be passed in.