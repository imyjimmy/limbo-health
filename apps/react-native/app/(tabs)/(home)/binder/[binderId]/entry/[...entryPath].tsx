// app/binder/[binderId]/entry/[...entryPath].tsx
// Entry detail screen: decrypt a .json document, render via registry or plain text.

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { DebugOverlay } from '../../../../../../components/binder/DebugOverlay';
import type { MedicalDocument } from '../../../../../../types/document';
import { extractTitle } from '../../../../../../core/binder/DocumentModel';
import { BinderService } from '../../../../../../core/binder/BinderService';
import { useAuthContext } from '../../../../../../providers/AuthProvider';
import { useCryptoContext } from '../../../../../../providers/CryptoProvider';
import { parseMarkdownFrontMatter } from '../../../../../../core/markdown/frontmatter';
import { getRenderer } from '../../../../../../components/registry/componentRegistry';

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
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const rendererSaveRef = useRef<(() => void) | null>(null);

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

  const router = useRouter();

  // Re-read document when screen regains focus (e.g., after editing)
  const [refreshCounter, setRefreshCounter] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setRefreshCounter((c) => c + 1);
    }, [])
  );

  useEffect(() => {
    if (!binderService || !rawPath) {
      setLoading(false);
      setError('Not ready');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await binderService.readEntry(rawPath);
        if (!cancelled) {
          setDoc(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to decrypt';
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [binderService, rawPath, refreshCounter]);

  const title = doc ? extractTitle(doc) : 'Entry';
  const displayBody = doc ? parseMarkdownFrontMatter(doc.value).body : '';

  // Registry lookup — resolves both new keys ("MedicationSummary") and legacy ("medication")
  const Renderer = doc ? getRenderer(doc.renderer) : undefined;

  const handleEdit = useCallback(() => {
    if (Renderer) {
      // Inline edit via the registered renderer
      setEditing(true);
      return;
    }
    // Fallback: navigate to standalone NoteEditor
    router.push({
      pathname: '/(tabs)/(home)/binder/[binderId]/entry/edit',
      params: { binderId: binderId!, entryPath: rawPath },
    });
  }, [Renderer, binderId, rawPath, router]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const handleInlineSave = useCallback(async (updatedDoc: MedicalDocument) => {
    if (!binderService) return;
    setSaving(true);
    try {
      await binderService.updateEntry(rawPath, updatedDoc);
      setDoc(updatedDoc);
      setEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      Alert.alert('Save Failed', message);
    } finally {
      setSaving(false);
    }
  }, [binderService, rawPath]);

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
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            Renderer && editing ? (
              <View style={styles.headerActions}>
                <TouchableOpacity onPress={handleCancelEdit} disabled={saving}>
                  <Text style={styles.headerCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => rendererSaveRef.current?.()} disabled={saving}>
                  <Text style={styles.headerSave}>{saving ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={handleEdit}>
                <Text style={styles.headerSave}>Edit</Text>
              </TouchableOpacity>
            )
          ),
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {/* Metadata bar */}
        <View style={styles.metaBar}>
          <Text style={styles.metaType}>{doc.metadata.type}</Text>
          <Text style={styles.metaDate}>
            {new Date(doc.metadata.created).toLocaleDateString()}
          </Text>
          {doc.metadata.updated && doc.metadata.updated !== doc.metadata.created ? (
            <Text style={styles.metaDate}>
              Updated {new Date(doc.metadata.updated).toLocaleDateString()}
            </Text>
          ) : null}
          {doc.metadata.provider ? (
            <Text style={styles.metaProvider}>{doc.metadata.provider}</Text>
          ) : null}
        </View>

        {/* Body — registry renderer or plain text */}
        <View style={styles.bodyContainer}>
          {Renderer ? (
            <Renderer
              doc={doc}
              editing={editing}
              onSave={handleInlineSave}
              onCancelEdit={handleCancelEdit}
              onRequestEdit={handleEdit}
              saving={saving}
              saveRef={rendererSaveRef}
            />
          ) : (
            <Text style={styles.bodyText}>{displayBody}</Text>
          )}
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

      <DebugOverlay
        sourceInfo={{
          kind: 'mixed',
          summary: `Current JSON is the decrypted repo document at "${rawPath}".`,
          details: 'Git Files (HEAD) is generated via git.listFiles and is not a JSON file in the repo.',
        }}
        data={doc}
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
  headerActions: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  headerSave: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerCancel: {
    color: '#7e8795',
    fontSize: 15,
    fontWeight: '500',
  },
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
