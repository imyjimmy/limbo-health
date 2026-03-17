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
import { useNavigation } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { bech32 } from '@scure/base';
import { useAuthContext } from '../../../providers/AuthProvider';
import { KeyManager } from '../../../core/crypto/KeyManager';
import ImportKeyForm from '../../../components/auth/ImportKeyForm';
import { createThemedStyles, useThemedStyles } from '../../../theme';
import { getProfileChrome } from './profileChrome';

function encodeBech32(prefix: string, hexStr: string): string {
  const bytes = hexToBytes(hexStr);
  return bech32.encode(prefix, bech32.toWords(bytes), 1500);
}

function truncateKey(key: string): string {
  if (key.length <= 20) return key;
  return `${key.slice(0, 12)}...${key.slice(-6)}`;
}

export default function EncryptionKeysRoute() {
  const navigation = useNavigation();
  const { state, hasStoredNostrKey } = useAuthContext();
  const styles = useThemedStyles(createStyles);
  const keyManager = useMemo(() => new KeyManager(SecureStore), []);

  const hasLinkedKey = !!state.pubkey;
  const hasLocalKey = hasStoredNostrKey;
  const npub = hasLinkedKey ? encodeBech32('npub', state.pubkey!) : null;
  const description = hasLocalKey
    ? 'Your medical records are encrypted with a keypair stored on this device.'
    : hasLinkedKey
      ? 'This account is linked to an encryption key, but the private key is not stored on this device yet. Import it here to open binders.'
      : 'Add an encryption key to this device so you can encrypt and open binders.';

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
        {description}
      </Text>

      {hasLinkedKey && npub && (
        <Pressable style={styles.keyBox} onPress={handleCopyNpub}>
          <Text style={styles.keyLabel}>
            {hasLocalKey ? 'Public Key (npub)' : 'Linked Public Key (npub)'}
          </Text>
          <Text style={styles.keyValue}>{truncateKey(npub)}</Text>
          <Text style={styles.keyAction}>
            {hasLocalKey ? 'Tap to copy' : 'Linked to your account. Import the private key on this device to decrypt binders.'}
          </Text>
        </Pressable>
      )}

      {hasLocalKey && !revealedNsec && (
        <Pressable
          style={styles.exportButton}
          onPress={handleExportKey}
          disabled={exporting}
        >
          {exporting ? (
            <ActivityIndicator color={styles.exportButtonText.color} />
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
        <Text style={styles.importButtonText}>
          {hasLinkedKey && !hasLocalKey ? 'Import private key to this device' : 'Import existing key'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const createStyles = createThemedStyles((theme) => {
  const chrome = getProfileChrome(theme);

  return {
    container: {
      flex: 1,
      backgroundColor: chrome.pageBackground,
    },
    contentContainer: {
      paddingHorizontal: 24,
      paddingTop: 40,
      paddingBottom: 48,
    },
    description: {
      fontSize: 16,
      color: chrome.secondaryText,
      lineHeight: 22,
      marginBottom: 28,
    },
    keyBox: {
      backgroundColor: chrome.cardBackground,
      borderWidth: 1,
      borderColor: chrome.divider,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    },
    keyLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: chrome.secondaryText,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    keyValue: {
      fontSize: 14,
      fontFamily: 'Courier',
      color: chrome.primaryText,
      marginBottom: 4,
    },
    keyAction: {
      fontSize: 12,
      color: theme.colors.primary,
    },
    exportButton: {
      backgroundColor: theme.colors.secondary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 16,
    },
    exportButtonText: {
      color: theme.colors.secondaryForeground,
      fontSize: 17,
      fontWeight: '600',
    },
    nsecBox: {
      backgroundColor: chrome.cardBackground,
      borderWidth: 1,
      borderColor: theme.colors.danger,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      gap: 8,
    },
    nsecWarning: {
      color: theme.colors.danger,
      fontSize: 13,
      lineHeight: 18,
    },
    nsecValue: {
      color: chrome.primaryText,
      fontSize: 12,
      fontFamily: 'Courier',
      lineHeight: 18,
    },
    nsecDismiss: {
      color: chrome.secondaryText,
      fontSize: 13,
      textAlign: 'right',
    },
    importButton: {
      backgroundColor: theme.colors.accent,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    importButtonText: {
      color: theme.colors.accentForeground,
      fontSize: 17,
      fontWeight: '600',
    },
  };
});
