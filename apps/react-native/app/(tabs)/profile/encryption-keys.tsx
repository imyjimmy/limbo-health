// app/(tabs)/profile/encryption-keys.tsx
// Encryption key management screen, pushed from profile.

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { bech32 } from '@scure/base';
import { useAuthContext } from '../../../providers/AuthProvider';
import { KeyManager } from '../../../core/crypto/KeyManager';
import ImportKeyForm from '../../../components/auth/ImportKeyForm';

function encodeBech32(prefix: string, hexStr: string): string {
  const bytes = hexToBytes(hexStr);
  return bech32.encode(prefix, bech32.toWords(bytes), 1500);
}

function truncateKey(key: string): string {
  if (key.length <= 20) return key;
  return `${key.slice(0, 12)}...${key.slice(-6)}`;
}

export default function EncryptionKeysRoute() {
  const router = useRouter();
  const navigation = useNavigation();
  const { state } = useAuthContext();
  const keyManager = useMemo(() => new KeyManager(SecureStore), []);

  const hasKey = !!state.pubkey;
  const npub = hasKey ? encodeBech32('npub', state.pubkey!) : null;

  const [revealedNsec, setRevealedNsec] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const handleCopyNpub = async () => {
    if (!npub) return;
    await Clipboard.setStringAsync(npub);
    Alert.alert('Copied', 'Public key copied to clipboard.');
  };

  const handleExportKey = async () => {
    setExporting(true);
    try {
      const privkey = await keyManager.getMasterPrivkey();
      if (!privkey) {
        Alert.alert('No Key', 'Could not retrieve encryption key.');
        return;
      }
      const hex = bytesToHex(privkey);
      const nsec = encodeBech32('nsec', hex);
      setRevealedNsec(nsec);
    } catch {
      // Face ID cancelled or failed
    } finally {
      setExporting(false);
    }
  };

  const handleCopyNsec = async () => {
    if (!revealedNsec) return;
    await Clipboard.setStringAsync(revealedNsec);
    Alert.alert('Copied', 'Secret key copied. Store it safely and clear your clipboard.');
  };

  if (showImport) {
    navigation.setOptions({ headerShown: false });
    return (
      <ImportKeyForm
        mode="keyOnly"
        title="Import Existing Key"
        onBack={() => { setShowImport(false); navigation.setOptions({ headerShown: true }); }}
        onSuccess={() => { setShowImport(false); navigation.setOptions({ headerShown: true }); }}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.description}>
        Your medical records are encrypted with a keypair stored on this device.
      </Text>

      {hasKey && npub && (
        <Pressable style={styles.keyBox} onPress={handleCopyNpub}>
          <Text style={styles.keyLabel}>Public Key (npub)</Text>
          <Text style={styles.keyValue}>{truncateKey(npub)}</Text>
          <Text style={styles.keyAction}>Tap to copy</Text>
        </Pressable>
      )}

      {hasKey && !revealedNsec && (
        <Pressable
          style={styles.exportButton}
          onPress={handleExportKey}
          disabled={exporting}
        >
          {exporting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.exportButtonText}>Export private key</Text>
          )}
        </Pressable>
      )}

      {revealedNsec && (
        <View style={styles.nsecBox}>
          <Text style={styles.nsecWarning}>
            Anyone with this key can decrypt your medical records. Store it safely.
          </Text>
          <Pressable onPress={handleCopyNsec}>
            <Text style={styles.nsecValue} selectable>{revealedNsec}</Text>
          </Pressable>
          <Pressable onPress={() => setRevealedNsec(null)}>
            <Text style={styles.nsecDismiss}>Hide</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        style={styles.importButton}
        onPress={() => setShowImport(true)}
      >
        <Text style={styles.importButtonText}>Import existing key</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 48,
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
    marginBottom: 28,
  },
  keyBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  keyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  keyValue: {
    fontSize: 14,
    fontFamily: 'Courier',
    color: '#111',
    marginBottom: 4,
  },
  keyAction: {
    fontSize: 12,
    color: '#999',
  },
  exportButton: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  nsecBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 8,
  },
  nsecWarning: {
    color: '#dc2626',
    fontSize: 13,
    lineHeight: 18,
  },
  nsecValue: {
    color: '#111',
    fontSize: 12,
    fontFamily: 'Courier',
    lineHeight: 18,
  },
  nsecDismiss: {
    color: '#999',
    fontSize: 13,
    textAlign: 'right',
  },
  importButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  importButtonText: {
    color: '#111',
    fontSize: 17,
    fontWeight: '600',
  },
});
