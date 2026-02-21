import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import type { AudioRecordingResult } from '../../hooks/useAudioRecorder';

interface InlineRecorderBarProps {
  onComplete: (result: AudioRecordingResult) => Promise<void> | void;
  onCancel: () => Promise<void> | void;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function InlineRecorderBar({ onComplete, onCancel }: InlineRecorderBarProps) {
  const { status, elapsedMs, start, stop, cancel } = useAudioRecorder();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    start().catch((err) => {
      console.error('Failed to start recording:', err);
      onCancel();
    });
  }, [start, onCancel]);

  const handleStop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await stop();
      await onComplete(result);
    } catch (err) {
      console.error('Failed to stop recording:', err);
      await onCancel();
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (busy) return;
    setBusy(true);
    await cancel();
    await onCancel();
    setBusy(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.dot} />
      <Text style={styles.timer}>{formatElapsed(elapsedMs)}</Text>
      <View style={styles.spacer} />

      {busy ? (
        <ActivityIndicator size="small" color="#666" />
      ) : (
        <>
          <Pressable
            style={styles.iconButton}
            onPress={handleCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel recording"
          >
            <Ionicons name="close" size={18} color="#666" />
          </Pressable>
          <Pressable
            style={[styles.iconButton, styles.stopButton]}
            onPress={handleStop}
            disabled={status !== 'recording'}
            accessibilityRole="button"
            accessibilityLabel="Stop recording"
          >
            <Ionicons name="stop" size={14} color="#fff" />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F1F1',
    borderWidth: 1,
    borderColor: '#E2E2E2',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D11A2A',
  },
  timer: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    color: '#444',
  },
  spacer: {
    flex: 1,
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#D11A2A',
  },
});
