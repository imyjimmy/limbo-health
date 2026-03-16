// components/QRDisplay.tsx
// Full-screen QR code display with countdown timer and cancel button.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { ScanQRPayload } from '../core/scan/ScanSession';
import type { PushStatus } from '../hooks/useShareSession';
import { createThemedStyles, useTheme, useThemedStyles } from '../theme';

// --- Props ---

interface QRDisplayProps {
  payload: ScanQRPayload;
  pushStatus?: PushStatus;
  onRetry?: () => void;
  onCancel: () => void;
}

// --- Component ---

export function QRDisplay({ payload, pushStatus, onRetry, onCancel }: QRDisplayProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.floor((payload.expiresAt * 1000 - Date.now()) / 1000)),
  );

  // Countdown timer
  useEffect(() => {
    if (remainingSeconds <= 0) return;

    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.floor((payload.expiresAt * 1000 - Date.now()) / 1000),
      );
      setRemainingSeconds(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [payload.expiresAt]);

  const isExpired = remainingSeconds <= 0;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  // Encode the full payload as JSON string for the QR
  const qrData = JSON.stringify(payload);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Share with Doctor</Text>
      <Text style={styles.instruction}>
        Have your doctor scan this QR code at limbo.health/scan
      </Text>

      <View style={styles.qrContainer}>
        {isExpired ? (
          <View style={styles.expiredOverlay}>
            <Text style={styles.expiredText}>Expired</Text>
          </View>
        ) : (
          <QRCode
            value={qrData}
            size={280}
            backgroundColor={theme.colors.surface}
            color={theme.colors.text}
          />
        )}
      </View>

      <Text style={[styles.timer, isExpired && styles.timerExpired]}>
        {isExpired
          ? 'Session expired'
          : `${minutes}:${seconds.toString().padStart(2, '0')} remaining`}
      </Text>

      {(pushStatus === 'slow' || pushStatus === 'failed') && (
        <View style={[styles.pill, pushStatus === 'failed' && styles.pillError]}>
          <Text style={[styles.pillText, pushStatus === 'failed' && styles.pillTextError]}>
            {pushStatus === 'failed'
              ? 'Upload failed'
              : 'Slow connection — uploading records...'}
          </Text>
          {pushStatus === 'failed' && onRetry && (
            <Pressable onPress={onRetry} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          )}
        </View>
      )}

      <Pressable style={styles.cancelButton} onPress={onCancel}>
        <Text style={styles.cancelButtonText}>Done</Text>
      </Pressable>
    </View>
  );
}

const createStyles = createThemedStyles((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
  },
  instruction: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  qrContainer: {
    padding: 20,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    shadowColor: theme.colors.overlayStrong,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 24,
  },
  expiredOverlay: {
    width: 280,
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 8,
  },
  expiredText: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  timer: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 32,
  },
  timerExpired: {
    color: theme.colors.danger,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.warningSoft,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 8,
  },
  pillError: {
    backgroundColor: theme.colors.dangerSoft,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.warning,
    textAlign: 'center',
  },
  pillTextError: {
    color: theme.colors.danger,
  },
  retryButton: {
    backgroundColor: theme.colors.danger,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.dangerForeground,
  },
  cancelButton: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  cancelButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
}));
