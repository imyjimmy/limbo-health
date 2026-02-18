// app/(auth)/import-key.tsx
// Import an existing Nostr private key by pasting nsec/hex.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { hexToBytes } from '@noble/hashes/utils.js';
import { bech32 } from '@scure/base';
import { useAuthContext } from '../../providers/AuthProvider';

export default function ImportKeyScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { login, storeNostrKey } = useAuthContext();
  const keyOnly = mode === 'keyOnly';
  const [keyInput, setKeyInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter your secret key.');
      return;
    }

    let privkeyBytes: Uint8Array;

    try {
      if (trimmed.startsWith('nsec1')) {
        const decoded = bech32.decodeToBytes(trimmed);
        if (decoded.bytes.length !== 32) {
          Alert.alert('Invalid Key', 'nsec key must decode to 32 bytes.');
          return;
        }
        privkeyBytes = decoded.bytes;
      } else if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
        privkeyBytes = hexToBytes(trimmed);
      } else {
        Alert.alert(
          'Invalid Key',
          'Please enter an nsec key or a 64-character hex private key.',
        );
        return;
      }
    } catch {
      Alert.alert('Invalid Key', 'Could not parse the provided key.');
      return;
    }

    setLoading(true);
    try {
      if (keyOnly) {
        await storeNostrKey(privkeyBytes);
      } else {
        await login(privkeyBytes);
      }
      router.replace('/(tabs)');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Authentication Failed', message);
    } finally {
      setLoading(false);
    }
  };

  // function maskKey(input: string): string {
  //   const trimmed = input.trim();
  //   if (trimmed.length <= 10) return trimmed;
  //   const prefix = trimmed.slice(0, 6);
  //   const suffix = trimmed.slice(-4);
  //   const masked = '•'.repeat(Math.min(trimmed.length - 10, 20));
  //   return `${prefix}${masked}${suffix}`;
  // }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        
        <View style={styles.container}>
          <View>
            <Text style={styles.title}>Import Your Key</Text>
            <Text style={styles.description}>
              Paste your Nostr secret key (hex format) to restore access to your
              encrypted medical records.
            </Text>

            <TextInput
              style={styles.input}
              value={keyInput}
              onChangeText={setKeyInput}
              placeholder="nsec1..."
              placeholderTextColor="#aaa"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              secureTextEntry
            />
          </View>

          <Pressable
            style={[
              styles.importButton,
              (loading || !keyInput.trim()) && styles.importButtonDisabled,
            ]}
            onPress={handleImport}
            disabled={loading || !keyInput.trim()}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.importButtonText}>Import & Authenticate</Text>
            )}
          </Pressable>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 48,
    justifyContent: 'space-between',
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
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    fontFamily: 'Courier',
    color: '#111',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  importButton: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  importButtonDisabled: {
    opacity: 0.4,
  },
  importButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});