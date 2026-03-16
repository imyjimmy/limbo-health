// app/(auth)/setup-key.tsx
// Chooser screen for Google users who need an encryption key.
// Routes to generate-key or import-key with mode=keyOnly.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { createThemedStyles, useThemedStyles } from '../../theme';

export default function SetupKeyScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Set Up Encryption</Text>
        <Text style={styles.description}>
          To store and access encrypted medical records, you need a cryptographic
          key. You can generate a new one or import an existing key.
        </Text>
      </View>

      <View style={styles.buttons}>
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push('/(auth)/generate-key?mode=keyOnly')}
        >
          <Text style={styles.primaryButtonText}>Generate New Key</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push('/(auth)/import-key?mode=keyOnly')}
        >
          <Text style={styles.secondaryButtonText}>Import Existing Key</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = createThemedStyles((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 120,
    paddingBottom: 48,
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  buttons: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: theme.colors.secondary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: theme.colors.secondaryForeground,
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: theme.colors.accentForeground,
    fontSize: 17,
    fontWeight: '600',
  },
}));
