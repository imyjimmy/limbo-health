import { useCallback, useRef, useState } from 'react';
import RNFS from 'react-native-fs';
import { decode as b64decode } from '../core/crypto/base64';

export interface AudioRecordingResult {
  binaryData: Uint8Array;
  sizeBytes: number;
  durationMs: number;
}

export type RecorderStatus = 'idle' | 'recording' | 'stopped';

type ExpoAudioModule = typeof import('expo-av');
type ExpoRecording = import('expo-av').Audio.Recording;

let cachedAudioModule: ExpoAudioModule['Audio'] | null = null;

async function getAudioModule(): Promise<ExpoAudioModule['Audio']> {
  if (cachedAudioModule) return cachedAudioModule;
  try {
    const mod = await import('expo-av');
    cachedAudioModule = mod.Audio;
    return cachedAudioModule;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Audio native module unavailable (${reason}). Rebuild iOS with: npx expo run:ios`,
    );
  }
}

export function useAudioRecorder() {
  const recordingRef = useRef<ExpoRecording | null>(null);
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const resultRef = useRef<AudioRecordingResult | null>(null);

  const start = useCallback(async () => {
    const Audio = await getAudioModule();

    // Permission is often requested before showing recorder UI.
    // Verify it's granted here as a safety check.
    const permission = await Audio.getPermissionsAsync();
    if (!permission.granted) {
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

    recording.setOnRecordingStatusUpdate((s) => {
      if (s.isRecording) {
        setElapsedMs(s.durationMillis);
      }
    });

    await recording.startAsync();
    recordingRef.current = recording;
    /*
    ** @issue: setElapsedMs(0) runs after the status update listener (line 53)
    ** is already attached and after startAsync() resolves. If the listener fires
    ** before this line, the elapsed time would get reset back to 0. React's state
    ** batching likely makes this invisible in practice, but proper sequencing would
    ** be to set elapsedMs before startAsync() or before attaching the listener.
    */
    setStatus('recording');
    setElapsedMs(0);
  }, []);

  const stop = useCallback(async (): Promise<AudioRecordingResult> => {
    const Audio = await getAudioModule();
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
  }, []);

  const cancel = useCallback(async () => {
    const Audio = await getAudioModule();
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
  }, []);

  return { status, elapsedMs, start, stop, cancel };
}
