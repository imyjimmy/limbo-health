import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import type { AudioRecordingResult } from '../../hooks/useAudioRecorder';

interface RecordingSheetProps {
  onComplete: (result: AudioRecordingResult) => void;
  onCancel: () => void;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function RecordingSheet({ onComplete, onCancel }: RecordingSheetProps) {
  const { status, elapsedMs, start, stop, cancel } = useAudioRecorder();

  useEffect(() => {
    start().catch((err) => {
      console.error('Failed to start recording:', err);
      onCancel();
    });
  }, [start, onCancel]);

  const handleStop = async () => {
    try {
      const result = await stop();
      onComplete(result);
    } catch (err) {
      console.error('Failed to stop recording:', err);
      onCancel();
    }
  };

  const handleCancel = async () => {
    await cancel();
    onCancel();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.timerRow}>
          <View style={styles.recordingDot} />
          <Text style={styles.timer}>{formatElapsed(elapsedMs)}</Text>
        </View>

        <TouchableOpacity
          style={styles.stopButton}
          onPress={handleStop}
          disabled={status !== 'recording'}
        >
          <Ionicons name="stop" size={36} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 40,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
  },
  timer: {
    fontSize: 48,
    fontWeight: '300',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  stopButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelText: {
    fontSize: 17,
    color: '#999',
  },
});
