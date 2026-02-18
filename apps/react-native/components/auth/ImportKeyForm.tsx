// components/auth/ImportKeyForm.tsx
// Shared import-key UI used by both (auth) and (tabs) routes.

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
import { useRouter, useNavigation } from 'expo-router';
import { hexToBytes } from '@noble/hashes/utils.js';
import { bech32 } from '@scure/base';
import Svg, { Path } from 'react-native-svg';
import { useAuthContext } from '../../providers/AuthProvider';

function NostrLogo({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 875 875">
      <Path
        fill="#8d45dd"
        d="M684.72 485.57c.22 12.59-11.93 51.47-38.67 81.3s-56.02 20.85-58.42 20.16-3.09-4.46-7.89-3.77-9.6 6.17-18.86 7.2-17.49 1.71-26.06-1.37c-4.46.69-5.14.71-7.2 2.24s-17.83 10.79-21.6 11.47c0 7.2-1.37 44.57 0 55.89s3.77 25.71 7.54 36 2.74 10.63 7.54 9.94 13.37.34 15.77 4.11 1.37 6.51 5.49 8.23 60.69 17.14 99.43 19.2c26.74.69 42.86 2.74 52.12 19.54 1.37 7.89 7.54 13.03 11.31 14.06s8.23 2.06 12 5.83 1.03 8.23 5.49 11.66 14.74 8.57 25.37 13.71 15.09 13.37 15.77 16.11 1.71 10.97 1.71 10.97-8.91 0-10.97-2.06-2.74-5.83-2.74-5.83-6.17 1.03-7.54 3.43.69 2.74-7.89.69-11.66-3.77-18.17-8.57-16.46-17.14-25.03-16.8c4.11 8.23 5.83 8.23 10.63 10.97s8.23 5.83 8.23 5.83l-7.2 4.46s-4.46 2.06-14.74-.69-11.66-4.46-12.69-10.63 0-9.26-2.74-14.4-4.11-15.77-22.29-21.26c-18.17-5.49-66.52-21.26-100.12-24.69s-22.63-2.74-28.11-1.37-15.77 4.46-26.4-1.37-16.8-13.71-17.49-20.23-1.71-10.97 0-19.2 3.43-19.89 1.71-26.74-14.06-55.89-19.89-64.12c-13.03 1.03-50.74-.69-50.74-.69s-2.4-.69-17.49 5.83-36.48 13.76-46.77 19.93-14.4 9.7-16.12 13.13c.12 3-1.23 7.72-2.79 9.06s-12.48 2.42-12.48 2.42-5.85 5.86-8.25 9.97c-6.86 9.6-55.2 125.14-66.52 149.83-13.54 32.57-9.77 27.43-37.71 27.43s-8.06.3-8.06.3-12.34 5.88-16.8 5.88-18.86-2.4-26.4 0-16.46 9.26-23.31 10.29-4.95-1.34-8.38-3.74c-4-.21-14.27-.12-14.27-.12s1.74-6.51 7.91-10.88c8.23-5.83 25.37-16.11 34.63-21.26s17.49-7.89 23.31-9.26 18.51-6.17 30.51-9.94 19.54-8.23 29.83-31.54 50.4-111.43 51.43-116.23c.63-2.96 3.73-6.48 4.8-15.09.66-5.35-2.49-13.04 1.71-22.63 10.97-25.03 21.6-20.23 26.4-20.23s17.14.34 26.4-1.37 15.43-2.74 24.69-7.89 11.31-8.91 11.31-8.91l-19.89-3.43s-18.51.69-25.03-4.46-15.43-15.77-15.43-15.77l-7.54-7.2 1.03 8.57s-5.14-8.91-6.51-10.29-8.57-6.51-11.31-11.31-7.54-25.03-7.54-25.03l-6.17 13.03-1.71-18.86-5.14 7.2-2.74-16.11-4.8 8.23-3.43-14.4-5.83 4.46-2.4-10.29-5.83-3.43s-14.06-9.26-16.46-9.6-4.46 3.43-4.46 3.43l1.37 12-12.2-6.27-7-11.9s2.36 4.01-9.62 7.53c-20.55 0-21.89-2.28-24.93-3.94-1.31-6.56-5.57-10.11-5.57-10.11h-20.57l-.34-6.86-7.89 3.09.69-10.29h-14.06l1.03-11.31h-8.91s3.09-9.26 25.71-22.97 25.03-16.46 46.29-17.14c21.26-.69 32.91 2.74 46.29 8.23s38.74 13.71 43.89 17.49c11.31-9.94 28.46-19.89 34.29-19.89 1.03-2.4 6.19-12.33 17.96-17.6 35.31-15.81 108.13-34 131.53-35.54 31.2-2.06 7.89-1.37 39.09 2.06s54.17 7.54 69.6 12.69c12.58 4.19 25.03 9.6 34.29 2.06 4.33-1.81 11.81-1.34 17.83-5.14 30.69-25.09 34.72-32.35 43.63-41.95s20.14-24.91 22.54-45.14 4.46-58.29-10.63-88.12-28.8-45.26-34.63-69.26-8.23-61.03-6.17-73.03 5.14-22.29 6.86-30.51 9.94-14.74 19.89-16.46c9.94-1.71 17.83 1.37 22.29 4.8s11.65 6.28 13.37 10.29c.34 1.71-1.37 6.51 8.23 8.23 9.6 1.71 16.05 4.16 16.05 4.16s15.64 4.29 3.11 7.73c-12.69 2.06-20.52-.71-24.29 1.69s-7.21 10.08-9.61 11.1-7.2.34-12 4.11-9.6 6.86-12.69 14.4-5.49 15.77-3.43 26.74 8.57 31.54 14.4 43.2 20.23 40.8 24.34 47.66 15.77 29.49 16.8 53.83 1.03 44.23 0 54.86-10.84 51.65-35.53 85.94c-8.16 14.14-23.21 31.9-24.67 35.03-1.45 3.13-3.02 4.88-1.61 7.65 4.62 9.05 12.87 22.13 14.71 29.22 2.29 6.64 6.99 16.13 7.22 28.72Z"
      />
    </Svg>
  );
}

interface ImportKeyFormProps {
  mode?: 'keyOnly';
  title?: string;
  onBack?: () => void;
  onSuccess?: () => void;
}

export default function ImportKeyForm({ mode, title, onBack, onSuccess }: ImportKeyFormProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const { login, storeNostrKey } = useAuthContext();
  const keyOnly = mode === 'keyOnly';
  const canGoBack = onBack || navigation.canGoBack();
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
        onSuccess ? onSuccess() : router.back();
      } else {
        await login(privkeyBytes);
        router.replace('/(tabs)');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Authentication Failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <View>
            {canGoBack && (
              <Pressable style={styles.backButton} onPress={() => onBack ? onBack() : router.back()}>
                <Text style={styles.backButtonText}>{'< Back'}</Text>
              </Pressable>
            )}
            <NostrLogo size={48} />
            <Text style={styles.title}>{title ?? 'Import Your Key'}</Text>
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
              <Text style={styles.importButtonText}>
                {keyOnly ? 'Import Key' : 'Import & Authenticate'}
              </Text>
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
    paddingTop: 40,
    paddingBottom: 48,
    justifyContent: 'space-between',
  },
  backButton: {
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
    marginTop: 16,
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
