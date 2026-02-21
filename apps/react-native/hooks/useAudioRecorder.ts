import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import RNFS from 'react-native-fs';
import { decode as b64decode } from '../core/crypto/base64';
import { shouldUseMockMedia } from '../core/platform/mockMedia';

export interface AudioRecordingResult {
  binaryData: Uint8Array;
  sizeBytes: number;
  durationMs: number;
}

export type RecorderStatus = 'idle' | 'recording' | 'stopped';
const MOCK_AUDIO_BASE64 = 'TU9DS19NNEE='; // "MOCK_M4A"

export function useAudioRecorder() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const resultRef = useRef<AudioRecordingResult | null>(null);
  const mockStartedAtRef = useRef<number | null>(null);
  const mockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopMockTimer = useCallback(() => {
    if (mockTimerRef.current) {
      clearInterval(mockTimerRef.current);
      mockTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopMockTimer();
    };
  }, [stopMockTimer]);

  const start = useCallback(async () => {
    if (shouldUseMockMedia()) {
      stopMockTimer();
      mockStartedAtRef.current = Date.now();
      setElapsedMs(0);
      setStatus('recording');
      mockTimerRef.current = setInterval(() => {
        if (mockStartedAtRef.current) {
          setElapsedMs(Date.now() - mockStartedAtRef.current);
        }
      }, 250);
      return;
    }

    // First-run path: request permission inline so the recorder doesn't
    // immediately cancel after the system prompt returns.
    const permission = await Audio.getPermissionsAsync();
    let granted = permission.granted;
    if (!granted) {
      const requested = await Audio.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) {
      throw new Error('Microphone permission denied');
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync({
      isMeteringEnabled: false,
      android: {
        extension: '.m4a',
        outputFormat: Audio.AndroidOutputFormat.MPEG_4,
        audioEncoder: Audio.AndroidAudioEncoder.AAC,
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 128000,
      },
      ios: {
        extension: '.m4a',
        outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
        audioQuality: Audio.IOSAudioQuality.HIGH,
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 128000,
      },
      web: {},
    });

    setElapsedMs(0);
    recording.setOnRecordingStatusUpdate((s) => {
      if (s.isRecording) {
        setElapsedMs(s.durationMillis);
      }
    });

    await recording.startAsync();
    recordingRef.current = recording;
    setStatus('recording');
  }, [stopMockTimer]);

  const stop = useCallback(async (): Promise<AudioRecordingResult> => {
    if (shouldUseMockMedia()) {
      const startedAt = mockStartedAtRef.current ?? Date.now();
      const durationMs = Math.max(0, Date.now() - startedAt);
      const binaryData = b64decode(MOCK_AUDIO_BASE64);

      stopMockTimer();
      mockStartedAtRef.current = null;
      setStatus('stopped');
      setElapsedMs(durationMs);

      const result: AudioRecordingResult = {
        binaryData,
        sizeBytes: binaryData.byteLength,
        durationMs,
      };
      resultRef.current = result;
      return result;
    }

    const recording = recordingRef.current;
    if (!recording) throw new Error('No active recording');

    const finalStatus = await recording.stopAndUnloadAsync();
    const durationMs = finalStatus.durationMillis;

    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

    const uri = recording.getURI();
    if (!uri) throw new Error('No recording URI');

    const base64String = await RNFS.readFile(uri, 'base64');
    const binaryData = b64decode(base64String);

    const stat = await RNFS.stat(uri);
    const sizeBytes = Number(stat.size);

    // Clean up temp file
    await RNFS.unlink(uri).catch(() => {});

    recordingRef.current = null;
    setStatus('stopped');

    const result: AudioRecordingResult = { binaryData, sizeBytes, durationMs };
    resultRef.current = result;
    return result;
  }, [stopMockTimer]);

  const cancel = useCallback(async () => {
    if (shouldUseMockMedia()) {
      stopMockTimer();
      mockStartedAtRef.current = null;
      setStatus('idle');
      setElapsedMs(0);
      resultRef.current = null;
      return;
    }

    const recording = recordingRef.current;
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
    } catch {
      // already stopped
    }

    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

    const uri = recording.getURI();
    if (uri) await RNFS.unlink(uri).catch(() => {});

    recordingRef.current = null;
    setStatus('idle');
    setElapsedMs(0);
    resultRef.current = null;
  }, [stopMockTimer]);

  return { status, elapsedMs, start, stop, cancel };
}
