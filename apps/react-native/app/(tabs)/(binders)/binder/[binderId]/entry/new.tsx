// app/binder/[binderId]/entry/new.tsx
//
// Route screen for creating a new medical note.
// Receives `dirPath`, `categoryType`, and optional behavior IDs (`editor`, `renderer`)
// as search params from the binder navigator.
// Uses a registered editor when one matches; otherwise falls back to NoteEditor.

import React, { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { NoteEditor } from '../../../../../../components/editor/NoteEditor';
import { BinderService } from '../../../../../../core/binder/BinderService';
import { slugify } from '../../../../../../core/binder/FileNaming';
import { useAuthContext } from '../../../../../../providers/AuthProvider';
import { useCryptoContext } from '../../../../../../providers/CryptoProvider';
import type { MedicalDocument } from '../../../../../../types/document';
import type { PendingSidecar } from '../../../../../../components/editor/AttachmentList';
import { getEditor } from '../../../../../../components/registry/componentRegistry';

export default function NewEntryScreen() {
  const router = useRouter();
  const { binderId, dirPath, categoryType, editor, renderer } = useLocalSearchParams<{
    binderId: string;
    dirPath: string;      // e.g. "visits/" or "conditions/back-acne/"
    categoryType: string; // e.g. "visit", "condition", "lab"
    editor?: string;
    renderer?: string;
  }>();

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

  const resolvedCategoryType = useMemo(() => {
    const value = typeof categoryType === 'string' ? categoryType.trim() : '';
    return value.length > 0 ? value : 'note';
  }, [categoryType]);

  const resolvedEditorId = useMemo(() => {
    const value = typeof editor === 'string' ? editor.trim() : '';
    return value.length > 0 ? value : undefined;
  }, [editor]);

  const resolvedRendererId = useMemo(() => {
    const value = typeof renderer === 'string' ? renderer.trim() : '';
    return value.length > 0 ? value : undefined;
  }, [renderer]);

  // Registry lookup — resolves both new keys and legacy aliases
  const EditorComponent = useMemo(
    () => getEditor(resolvedEditorId),
    [resolvedEditorId],
  );

  const handleSave = useCallback(
    async (doc: MedicalDocument, sidecars: PendingSidecar[]) => {
      if (!binderService) {
        Alert.alert('Not Ready', 'Authentication is not available. Please sign in and try again.');
        return;
      }

      const normalizedDoc: MedicalDocument = {
        ...doc,
        metadata: {
          ...doc.metadata,
          type: doc.metadata.type.trim() || resolvedCategoryType,
        },
        renderer: doc.renderer ?? resolvedRendererId,
        editor: doc.editor ?? resolvedEditorId,
      };

      // Derive slug from the document title (H1 heading)
      const titleMatch = normalizedDoc.value.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1] : 'untitled';
      const slug = slugify(title);

      // Use dirPath as the category/directory for addEntry
      // Strip trailing slash if present: "conditions/" -> "conditions"
      const category = (dirPath ?? '').replace(/\/+$/, '');

      // Save the document: encrypt -> write -> git add -> commit -> push
      // addEntry handles the full chain. If push fails (network), the entry
      // is still committed locally. We catch push errors separately so the
      // user is not stuck on the editor with already-saved data.
      try {
        const savedPath = sidecars.length > 0
          ? await binderService.addEntryWithSidecars(category, slug, normalizedDoc, sidecars)
          : await binderService.addEntry(category, slug, normalizedDoc);
        console.log('Entry saved at:', savedPath);
      } catch (err: any) {
        // If the error is from push (entry is committed locally), warn but
        // still navigate back. The entry will sync on next push.
        const message = err?.message ?? '';
        const isPushError = message.includes('push') || message.includes('network') || message.includes('401');
        if (isPushError) {
          console.warn('Push failed, entry saved locally:', message);
        } else {
          // Re-throw write/commit errors so NoteEditor's catch displays the alert
          throw err;
        }
      }

      // Navigate back to the directory listing
      router.back();
    },
    [binderService, dirPath, resolvedCategoryType, resolvedEditorId, resolvedRendererId, router],
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {EditorComponent ? (
        <EditorComponent
          mode="create"
          dirPath={dirPath ?? '/'}
          categoryType={resolvedCategoryType}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      ) : (
        <NoteEditor
          dirPath={dirPath ?? '/'}
          categoryType={resolvedCategoryType}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
