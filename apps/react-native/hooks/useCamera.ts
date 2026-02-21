// hooks/useCamera.ts
// Navigates to the custom camera screen, returns compressed photo data.
// The camera screen resolves the shared promise via cameraResult bridge.

import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import RNFS from 'react-native-fs';
import { decode as b64decode } from '../core/crypto/base64';
import { createPending } from '../core/camera/cameraResult';
import { shouldUseMockMedia } from '../core/platform/mockMedia';

export interface CaptureResult {
  binaryData: Uint8Array;
  base64Data: string;
  sizeBytes: number;
  width: number;
  height: number;
  /** Local file URI for thumbnail preview */
  uri: string;
}

const MAX_WIDTH = 1920;
const JPEG_QUALITY = 0.7;
const MOCK_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2pQwAAAABJRU5ErkJggg==';

export function useCamera() {
  const router = useRouter();

  const capture = useCallback(async (): Promise<CaptureResult | null> => {
    if (shouldUseMockMedia()) {
      const binaryData = b64decode(MOCK_IMAGE_BASE64);
      return {
        binaryData,
        base64Data: MOCK_IMAGE_BASE64,
        sizeBytes: binaryData.byteLength,
        width: 1,
        height: 1,
        uri: `data:image/png;base64,${MOCK_IMAGE_BASE64}`,
      };
    }

    // Create a pending promise, navigate to camera screen
    const pendingResult = createPending();
    router.push('/camera');

    // Wait for camera screen to resolve
    const raw = await pendingResult;
    if (!raw) return null; // user cancelled

    // Compress: resize if wider than MAX_WIDTH, JPEG compression
    const actions: any[] = [];
    if (raw.width > MAX_WIDTH) {
      actions.push({ resize: { width: MAX_WIDTH } });
    }

    const compressed = await manipulateAsync(raw.uri, actions, {
      compress: JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });

    // Read compressed file as base64 string via RNFS
    const base64String = await RNFS.readFile(compressed.uri, 'base64');

    // Decode to Uint8Array using our custom decoder (no Buffer/atob)
    const binaryData = b64decode(base64String);

    // Get file size
    const stat = await RNFS.stat(compressed.uri);

    return {
      binaryData,
      base64Data: base64String,
      sizeBytes: Number(stat.size),
      width: compressed.width,
      height: compressed.height,
      uri: compressed.uri,
    };
  }, [router]);

  return { capture };
}
