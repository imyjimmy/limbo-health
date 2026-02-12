// app/(auth)/welcome.tsx
// First launch screen. Two paths: import existing key or generate new one.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Limbo Health</Text>
        <Text style={styles.subtitle}>
          Your medical records, encrypted and under your control.
        </Text>
      </View>

      <View style={styles.buttons}>
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push('/(auth)/generate-key')}
        >
          <Text style={styles.primaryButtonText}>Create New Identity</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push('/(auth)/import-key')}
        >
          <Text style={styles.secondaryButtonText}>
            I Have a Key (Import nsec)
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 120,
    paddingBottom: 48,
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 17,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  buttons: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#111',
    fontSize: 17,
    fontWeight: '600',
  },
});