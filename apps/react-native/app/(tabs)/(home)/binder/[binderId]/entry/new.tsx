// app/binder/[binderId]/entry/new.tsx
//
// Route screen for creating a new medical note.
// Receives `dirPath` and `categoryType` as search params from the binder navigator.
// Composes NoteEditor and calls BinderService.addEntry on save.

import React, { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { NoteEditor } from '../../../../../../components/editor/NoteEditor';
import type { MedicalDocument } from '../../../../../../types/document';
import type { PendingSidecar } from '../../../../../../components/editor/AttachmentList';
// import { useBinderService } from '../../../../../../providers/BinderProvider';
// ^ uncomment when BinderProvider is wired up

export default function NewEntryScreen() {
  const router = useRouter();
  const { binderId, dirPath, categoryType } = useLocalSearchParams<{
    binderId: string;
    dirPath: string;      // e.g. "visits/" or "conditions/back-acne/"
    categoryType: string; // e.g. "visit", "condition", "lab"
  }>();

  // const binderService = useBinderService();

  const handleSave = useCallback(
    async (doc: MedicalDocument, sidecars: PendingSidecar[]) => {
      // TODO: wire to BinderService once provider is available
      //
      // The save flow:
      // 1. For each sidecar, call EncryptedIO.writeSidecar(sidecarPath, binaryData)
      // 2. Call BinderService.addEntry(binderId, dirPath, doc)
      //    - generates filepath from date + title slug
      //    - encrypts JSON with NIP-44
      //    - writes .json file
      //    - git add + git commit
      //    - queues push (or pushes immediately if online)
      //
      // Placeholder log for now:
      console.log('Saving to:', dirPath);
      console.log('Document:', JSON.stringify(doc, null, 2));
      console.log('Sidecars:', sidecars.length);

      // Navigate back to the directory listing
      router.back();
    },
    [binderId, dirPath, router],
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <NoteEditor
      dirPath={dirPath ?? '/'}
      categoryType={categoryType ?? 'note'}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}