// hooks/useCamera.ts
// Launch camera, compress JPEG, return binary data ready for EncryptedIO.writeSidecar.

import { useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import RNFS from 'react-native-fs';
import { decode as b64decode } from '../core/crypto/base64';

export interface CaptureResult {
  binaryData: Uint8Array;
  sizeBytes: number;
  width: number;
  height: number;
}

const MAX_WIDTH = 1920;
const JPEG_QUALITY = 0.7;

export function useCamera() {
  const capture = useCallback(async (): Promise<CaptureResult | null> => {
    // Request permission
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Camera permission denied');
    }

    // Launch camera
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1, // full quality — we compress below
    });

    if (result.canceled || !result.assets?.[0]) {
      return null; // user cancelled
    }

    const asset = result.assets[0];

    // Compress: resize if wider than MAX_WIDTH, JPEG compression
    const actions: any[] = [];
    if (asset.width > MAX_WIDTH) {
      actions.push({ resize: { width: MAX_WIDTH } });
    }

    const compressed = await manipulateAsync(asset.uri, actions, {
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
      sizeBytes: Number(stat.size),
      width: compressed.width,
      height: compressed.height,
    };
  }, []);

  return { capture };
}