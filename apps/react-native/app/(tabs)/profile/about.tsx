import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { createThemedStyles, useTheme, useThemedStyles } from '../../../theme';
import { getProfileChrome } from './profileChrome';

export default function AboutScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>ABOUT LIMBO HEALTH</Text>
      <View style={styles.card}>
        <Text style={styles.title}>Patient self-custody comes first.</Text>
        <Text style={styles.body}>
          Limbo Health is built around a simple idea: your medical data should stay under your
          control.
        </Text>
        <Text style={styles.body}>
          We are committed to patient self-custody of medical records, so people can gather,
          organize, and share their own health information without handing ownership away.
        </Text>
        <Text style={styles.body}>
          The goal is to make records portable, understandable, and usable on the patient&apos;s
          terms.
        </Text>
      </View>
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
    content: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 48,
    },
    sectionLabel: {
      color: chrome.secondaryText,
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0.5,
      marginBottom: 8,
      marginLeft: 4,
    },
    card: {
      backgroundColor: chrome.cardBackground,
      borderRadius: 12,
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 18,
    },
    title: {
      color: chrome.primaryText,
      fontSize: 22,
      fontWeight: '700',
      lineHeight: 28,
    },
    body: {
      color: chrome.secondaryText,
      fontSize: 16,
      lineHeight: 24,
    },
  };
});
