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

  // Reconstruct path: could be catch-all array segments
  const rawPath = Array.isArray(entryPath)
    ? entryPath.join('/')
    : (entryPath ?? '');

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

        {/* Markdown body -- plain text for now, swap with MarkdownRenderer later */}
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
