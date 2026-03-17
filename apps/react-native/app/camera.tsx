// app/camera.tsx
// Full-screen camera with timer (Off / 5s / 10s) and flip toggle.
// Auto-captures after countdown. Returns result via cameraResult bridge.

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { resolveResult } from '../core/camera/cameraResult';
import { createThemedStyles, useTheme, useThemedStyles } from '../theme';

type TimerOption = 0 | 5 | 10;
const TIMER_OPTIONS: { label: string; value: TimerOption }[] = [
  { label: 'Off', value: 0 },
  { label: '5s', value: 5 },
  { label: '10s', value: 10 },
];

export default function CameraScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [timerDuration, setTimerDuration] = useState<TimerOption>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const takePicture = useCallback(async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });

      if (photo) {
        resolveResult({
          uri: photo.uri,
          width: photo.width,
          height: photo.height,
        });
      } else {
        resolveResult(null);
      }
    } catch (err) {
      console.error('takePictureAsync failed:', err);
      resolveResult(null);
    }

    router.back();
  }, [router]);

  const handleShutter = useCallback(() => {
    if (countdown !== null) return; // already counting

    if (timerDuration === 0) {
      takePicture();
      return;
    }

    // Start countdown
    setCountdown(timerDuration);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = null;
          // Capture on next tick so state clears cleanly
          setTimeout(() => takePicture(), 50);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [timerDuration, countdown, takePicture]);

  const handleCancel = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
      setCountdown(null);
      return; // first tap cancels the countdown, doesn't leave
    }
    resolveResult(null);
    router.back();
  }, [router]);

  const handleFlip = useCallback(() => {
    setFacing((prev) => (prev === 'front' ? 'back' : 'front'));
  }, []);

  // --- Permission handling ---

  if (!permission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Loading camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Camera access is required</Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  // --- Camera UI ---

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
      />

      {/* Countdown overlay */}
      {countdown !== null && (
        <View style={styles.countdownOverlay}>
          <Text style={styles.countdownText}>{countdown}</Text>
        </View>
      )}

      {/* Top bar: cancel */}
      <View style={styles.topBar}>
        <Pressable onPress={handleCancel} hitSlop={12}>
          <Text style={styles.cancelText}>
            {countdown !== null ? 'Stop' : 'Cancel'}
          </Text>
        </Pressable>
      </View>

      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        {/* Timer picker */}
        <View style={styles.timerRow}>
          {TIMER_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[
                styles.timerOption,
                timerDuration === opt.value && styles.timerOptionActive,
              ]}
              onPress={() => setTimerDuration(opt.value)}
              disabled={countdown !== null}
            >
              <Text
                style={[
                  styles.timerLabel,
                  timerDuration === opt.value && styles.timerLabelActive,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Shutter + flip row */}
        <View style={styles.shutterRow}>
          {/* Empty space to balance the flip button */}
          <View style={styles.shutterSpacer} />

          {/* Shutter button */}
          <Pressable
            style={styles.shutterOuter}
            onPress={handleShutter}
            disabled={countdown !== null}
          >
            <View
              style={[
                styles.shutterInner,
                countdown !== null && styles.shutterDisabled,
              ]}
            />
          </Pressable>

          {/* Flip button */}
          <Pressable
            style={styles.flipButton}
            onPress={handleFlip}
            hitSlop={8}
            disabled={countdown !== null}
          >
            <Text style={styles.flipIcon}>⟲</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const createStyles = createThemedStyles((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.headerBackground,
  },
  camera: {
    flex: 1,
  },

  // Countdown
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.overlayStrong,
  },
  countdownText: {
    fontSize: 120,
    fontWeight: '200',
    color: theme.colors.headerText,
  },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 60,
    left: 24,
    right: 24,
  },
  cancelText: {
    color: theme.colors.headerText,
    fontSize: 17,
    fontWeight: '500',
  },

  // Bottom controls
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
    backgroundColor: theme.colors.overlayStrong,
  },

  // Timer picker
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  timerOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  timerOptionActive: {
    backgroundColor: theme.colors.overlay,
  },
  timerLabel: {
    color: theme.colors.tabIconInactive,
    fontSize: 15,
    fontWeight: '600',
  },
  timerLabelActive: {
    color: theme.colors.warning,
  },

  // Shutter row
  shutterRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 40,
  },
  shutterSpacer: {
    width: 44,
  },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: theme.colors.headerText,
    padding: 3,
  },
  shutterInner: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: theme.colors.headerText,
  },
  shutterDisabled: {
    backgroundColor: theme.colors.overlay,
  },

  // Flip button
  flipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipIcon: {
    color: theme.colors.headerText,
    fontSize: 24,
  },

  // Permission screen
  permissionContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    color: theme.colors.text,
    fontSize: 17,
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  permissionButtonText: {
    color: theme.colors.primaryForeground,
    fontSize: 17,
    fontWeight: '600',
  },
}));
