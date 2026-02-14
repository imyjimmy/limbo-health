// components/QRDisplay.tsx
// Full-screen QR code display with countdown timer and cancel button.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { ScanQRPayload } from '../core/scan/ScanSession';

// --- Props ---

interface QRDisplayProps {
  payload: ScanQRPayload;
  onCancel: () => void;
}

// --- Component ---

export function QRDisplay({ payload, onCancel }: QRDisplayProps) {
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
            backgroundColor="#fff"
            color="#111"
          />
        )}
      </View>

      <Text style={[styles.timer, isExpired && styles.timerExpired]}>
        {isExpired
          ? 'Session expired'
          : `${minutes}:${seconds.toString().padStart(2, '0')} remaining`}
      </Text>

      <Pressable style={styles.cancelButton} onPress={onCancel}>
        <Text style={styles.cancelButtonText}>
          {isExpired ? 'Done' : 'Cancel Sharing'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  instruction: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  qrContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
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
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  expiredText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#999',
  },
  timer: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111',
    marginBottom: 32,
  },
  timerExpired: {
    color: '#c00',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  cancelButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
  },
});