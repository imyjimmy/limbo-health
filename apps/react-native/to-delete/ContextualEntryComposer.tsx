import React, { useCallback } from 'react';
import { MedicationEntryForm } from './MedicationEntryForm';
import { buildMedicationMarkdown } from '../../core/markdown/medicationEntry';
import type { MedicalDocument } from '../../types/document';
import type { PendingSidecar } from './AttachmentList';

interface ContextualComposerProps {
  editorId: string;
  rendererId?: string;
  categoryType: string;
  dirPath: string;
  onSave: (doc: MedicalDocument, sidecars: PendingSidecar[]) => Promise<void>;
  onCancel: () => void;
}

type ComposerComponent = React.ComponentType<ContextualComposerProps>;

const CONTEXTUAL_COMPOSERS: Record<string, ComposerComponent> = {
  medication: MedicationComposer,
};

export function hasContextualComposer(editorId?: string): boolean {
  if (!editorId) return false;
  return Boolean(CONTEXTUAL_COMPOSERS[editorId]);
}

export function ContextualEntryComposer(props: ContextualComposerProps) {
  const Composer = CONTEXTUAL_COMPOSERS[props.editorId];
  if (!Composer) return null;
  return <Composer {...props} />;
}

function MedicationComposer({
  editorId,
  rendererId,
  categoryType,
  dirPath,
  onSave,
  onCancel,
}: ContextualComposerProps) {
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
          type: categoryType,
          created: timestamp,
          updated: timestamp,
          tags: categoryType ? [categoryType] : [],
        },
        children: [],
        renderer: rendererId ?? editorId,
        editor: editorId,
      };

      await onSave(doc, []);
    },
    [categoryType, editorId, onSave, rendererId],
  );

  return (
    <MedicationEntryForm
      dirPath={dirPath}
      onSave={handleSaveMedication}
      onCancel={onCancel}
    />
  );
}
