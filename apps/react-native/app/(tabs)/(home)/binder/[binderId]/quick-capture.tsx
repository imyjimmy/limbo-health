import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useCamera } from '../../../../../hooks/useCamera';
import { BinderService } from '../../../../../core/binder/BinderService';
import { useAuthContext } from '../../../../../providers/AuthProvider';
import { useCryptoContext } from '../../../../../providers/CryptoProvider';
import { RecordingSheet } from '../../../../../components/audio/RecordingSheet';
import type { AudioRecordingResult } from '../../../../../hooks/useAudioRecorder';

export default function QuickCaptureScreen() {
  const router = useRouter();
  const { binderId, dirPath, mode } = useLocalSearchParams<{
    binderId: string;
    dirPath: string;
    mode: string;
  }>();

  const { state: authState } = useAuthContext();
  const { masterConversationKey } = useCryptoContext();
  const jwt = authState.status === 'authenticated' ? authState.jwt : null;
  const { capture } = useCamera();
  const didRun = useRef(false);
  const [saving, setSaving] = useState(false);

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

  // --- Photo mode: auto-fire camera on mount ---
  useEffect(() => {
    if (mode === 'audio') return;
    if (didRun.current || !binderService) return;
    didRun.current = true;

    (async () => {
      try {
        const result = await capture();
        if (!result) {
          router.back();
          return;
        }

        const targetDir = dirPath
          ? dirPath
          : await binderService.ensureFolder('photos', 'Photos', 'camera');

        await binderService.addPhoto(targetDir, result.binaryData, result.sizeBytes);
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        Alert.alert('Photo Failed', msg);
      }

      router.back();
    })();
  }, [binderService, capture, dirPath, mode, router]);

  // --- Audio mode: callbacks for RecordingSheet ---
  const handleAudioComplete = useCallback(async (result: AudioRecordingResult) => {
    if (!binderService || saving) return;
    setSaving(true);

    try {
      const targetDir = dirPath
        ? dirPath
        : await binderService.ensureFolder('recordings', 'Recordings', 'mic');

      await binderService.addAudio(
        targetDir,
        result.binaryData,
        result.sizeBytes,
        result.durationMs,
      );
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Recording Failed', msg);
    }

    router.back();
  }, [binderService, dirPath, saving, router]);

  const handleAudioCancel = useCallback(() => {
    router.back();
  }, [router]);

  // --- Render ---
  if (mode === 'audio') {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <RecordingSheet onComplete={handleAudioComplete} onCancel={handleAudioCancel} />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View />
    </>
  );
}
