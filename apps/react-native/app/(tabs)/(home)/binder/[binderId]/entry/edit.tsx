// app/binder/[binderId]/entry/edit.tsx
//
// Route screen for editing an existing medical note.
// Receives `entryPath` as a search param (URL-encoded relative path within the binder).
// Reads and decrypts the document, then renders NoteEditor with initialDoc.
// On save, calls BinderService.updateEntry to overwrite the same file.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { NoteEditor } from '../../../../../../components/editor/NoteEditor';
import { BinderService } from '../../../../../../core/binder/BinderService';
import { useAuthContext } from '../../../../../../providers/AuthProvider';
import { useCryptoContext } from '../../../../../../providers/CryptoProvider';
import type { MedicalDocument } from '../../../../../../types/document';
import type { PendingSidecar } from '../../../../../../components/editor/AttachmentList';

export default function EditEntryScreen() {
  const router = useRouter();
  const { binderId, entryPath } = useLocalSearchParams<{
    binderId: string;
    entryPath: string; // URL-encoded relative path, e.g. "conditions/back-acne/2026-02-13-note.json"
  }>();

  const [doc, setDoc] = useState<MedicalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Read and decrypt the existing document
  useEffect(() => {
    if (!binderService || !entryPath) {
      setLoading(false);
      setError('Not ready');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await binderService.readEntry(entryPath);
        if (!cancelled) {
          setDoc(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load entry';
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [binderService, entryPath]);

  const handleSave = useCallback(
    async (updatedDoc: MedicalDocument, sidecars: PendingSidecar[]) => {
      if (!binderService || !entryPath) {
        Alert.alert('Not Ready', 'Authentication is not available. Please sign in and try again.');
        return;
      }

      // TODO: sidecar writing for new attachments added during edit.
      // Same as new.tsx -- not yet wired.

      try {
        await binderService.updateEntry(entryPath, updatedDoc);
        console.log('Entry updated at:', entryPath);
      } catch (err: any) {
        const message = err?.message ?? '';
        const isPushError = message.includes('push') || message.includes('network') || message.includes('401');
        if (isPushError) {
          console.warn('Push failed, entry updated locally:', message);
        } else {
          throw err;
        }
      }

      router.back();
    },
    [binderService, entryPath, router],
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Loading...', headerShown: false }} />
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
          <Text style={styles.errorText}>{error ?? 'This entry no longer exists.'}</Text>
        </View>
      </>
    );
  }

  // Derive dirPath and categoryType from the existing document for NoteEditor
  const dirPath = entryPath.substring(0, entryPath.lastIndexOf('/') + 1) || '/';
  const categoryType = doc.metadata.type;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <NoteEditor
        dirPath={dirPath}
        categoryType={categoryType}
        initialDoc={doc}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fafafa',
  },
  loadingText: { marginTop: 12, fontSize: 14, color: '#888' },
  errorText: { fontSize: 15, color: '#c00', textAlign: 'center' },
});
