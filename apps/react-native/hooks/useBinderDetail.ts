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
    if (!binderService) {
      setLoading(false);
      return;
    }
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
