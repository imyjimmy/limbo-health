// app/binder/[binderId]/entry/new.tsx
//
// Route screen for creating a new medical note.
// Receives `dirPath` and `categoryType` as search params from the binder navigator.
// Composes NoteEditor and calls BinderService.addEntry on save.

import React, { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { NoteEditor } from '../../../../../../components/editor/NoteEditor';
import { MedicationEntryForm } from '../../../../../../components/editor/MedicationEntryForm';
import { BinderService } from '../../../../../../core/binder/BinderService';
import { slugify } from '../../../../../../core/binder/FileNaming';
import { useAuthContext } from '../../../../../../providers/AuthProvider';
import { useCryptoContext } from '../../../../../../providers/CryptoProvider';
import type { MedicalDocument } from '../../../../../../types/document';
import type { PendingSidecar } from '../../../../../../components/editor/AttachmentList';
import { buildMedicationMarkdown } from '../../../../../../core/markdown/medicationEntry';

export default function NewEntryScreen() {
  const router = useRouter();
  const { binderId, dirPath, categoryType } = useLocalSearchParams<{
    binderId: string;
    dirPath: string;      // e.g. "visits/" or "conditions/back-acne/"
    categoryType: string; // e.g. "visit", "condition", "lab"
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

  const handleSave = useCallback(
    async (doc: MedicalDocument, sidecars: PendingSidecar[]) => {
      if (!binderService) {
        Alert.alert('Not Ready', 'Authentication is not available. Please sign in and try again.');
        return;
      }

      // Derive slug from the document title (H1 heading)
      const titleMatch = doc.value.match(/^#\s+(.+)$/m);
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
          ? await binderService.addEntryWithSidecars(category, slug, doc, sidecars)
          : await binderService.addEntry(category, slug, doc);
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
    [binderService, dirPath, router],
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  const isMedicationFolder = useMemo(() => {
    const normalized = (dirPath ?? '')
      .replace(/^\/+|\/+$/g, '')
      .toLowerCase();
    return (
      normalized === 'medications' ||
      normalized.startsWith('medications/') ||
      normalized.endsWith('/medications')
    );
  }, [dirPath]);

  const useMedicationComposer = useMemo(() => {
    const normalizedCategoryType = (categoryType ?? '').toLowerCase();
    if (normalizedCategoryType === 'medication') return true;
    // Backward-compatible fallback: if no explicit category type is passed,
    // infer medication composer from folder context.
    if (!normalizedCategoryType) return isMedicationFolder;
    return false;
  }, [categoryType, isMedicationFolder]);

  const handleSaveMedication = useCallback(
    async (payload: {
      name: string;
      dosage: string;
      frequency: string;
      startDate: string;
      stopDate?: string;
    }) => {
      const timestamp = new Date().toISOString();
      const doc: MedicalDocument = {
        value: buildMedicationMarkdown(payload),
        metadata: {
          type: 'medication',
          created: timestamp,
          updated: timestamp,
          tags: ['medication'],
        },
        children: [],
        renderer: 'medication',
        editor: 'medication',
      };

      await handleSave(doc, []);
    },
    [handleSave],
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {useMedicationComposer ? (
        <MedicationEntryForm
          dirPath={dirPath ?? '/'}
          onSave={handleSaveMedication}
          onCancel={handleCancel}
        />
      ) : (
        <NoteEditor
          dirPath={dirPath ?? '/'}
          categoryType={categoryType ?? 'note'}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
