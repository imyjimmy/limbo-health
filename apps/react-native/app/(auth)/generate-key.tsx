// app/(auth)/generate-key.tsx
// Generate a new Nostr keypair, show nsec for backup, then authenticate.

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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { KeyManager } from '../../core/crypto/KeyManager';
import { useAuthContext } from '../../providers/AuthProvider';

export default function GenerateKeyScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { login, storeNostrKey } = useAuthContext();
  const keyOnly = mode === 'keyOnly';
  const [loading, setLoading] = useState(false);
  const [backedUp, setBackedUp] = useState(false);

  // Generate keypair once when screen mounts
  const keypair = useMemo(() => {
    const privkey = secp256k1.utils.randomSecretKey();
    const pubkey = KeyManager.pubkeyFromPrivkey(privkey);
    const nsec = bytesToHex(privkey); // TODO: bech32 nsec encoding
    return { privkey, pubkey, nsec };
  }, []);

  const handleContinue = async () => {
    if (!backedUp) {
      Alert.alert(
        'Backup Required',
        'Please confirm you have saved your secret key. If you lose it, your medical data cannot be recovered.',
        [{ text: 'OK' }],
      );
      return;
    }

    setLoading(true);
    try {
      if (keyOnly) {
        await storeNostrKey(keypair.privkey);
      } else {
        await login(keypair.privkey);
      }
      router.replace('/(tabs)');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Authentication Failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <Text style={styles.title}>Your Secret Key</Text>
      <Text style={styles.description}>
        This key encrypts all your medical data. Write it down and store it
        somewhere safe. Limbo Health cannot recover it for you.
      </Text>

      <View style={styles.keyBox}>
        <Text style={styles.keyLabel}>Secret Key (nsec)</Text>
        <Text style={styles.keyValue} selectable>
          {keypair.nsec}
        </Text>
      </View>

      <View style={styles.pubkeyBox}>
        <Text style={styles.keyLabel}>Public Key (npub)</Text>
        <Text style={styles.pubkeyValue} selectable numberOfLines={1}>
          {keypair.pubkey}
        </Text>
      </View>

      <Pressable
        style={[styles.checkboxRow]}
        onPress={() => setBackedUp(!backedUp)}
      >
        <View style={[styles.checkbox, backedUp && styles.checkboxChecked]}>
          {backedUp && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.checkboxLabel}>
          I have saved my secret key in a safe place
        </Text>
      </Pressable>

      <Pressable
        style={[
          styles.continueButton,
          (!backedUp || loading) && styles.continueButtonDisabled,
        ]}
        onPress={handleContinue}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.continueButtonText}>Continue</Text>
        )}
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
    paddingTop: 80,
    paddingBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
    marginBottom: 32,
  },
  keyBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  pubkeyBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
  },
  keyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  keyValue: {
    fontSize: 14,
    fontFamily: 'Courier',
    color: '#111',
    lineHeight: 20,
  },
  pubkeyValue: {
    fontSize: 14,
    fontFamily: 'Courier',
    color: '#666',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  checkboxLabel: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  continueButton: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.4,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
