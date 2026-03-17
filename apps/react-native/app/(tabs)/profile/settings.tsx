import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { IconMoon, IconSun } from '@tabler/icons-react-native';
import { createThemedStyles, useTheme, useThemeModePreference, useThemedStyles } from '../../../theme';
import { getProfileChrome } from './profileChrome';

type AppearanceOption = {
  key: 'light' | 'dark';
};

const APPEARANCE_OPTIONS: AppearanceOption[] = [
  { key: 'light' },
  { key: 'dark' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const chrome = getProfileChrome(theme);
  const { resolvedMode, setModePreference } = useThemeModePreference();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>APPEARANCE</Text>
      <View style={styles.card}>
        {APPEARANCE_OPTIONS.map((option, index) => {
          const isSelected = resolvedMode === option.key;
          const Icon = option.key === 'light' ? IconSun : IconMoon;
          return (
            <Pressable
              key={option.key}
              onPress={() => setModePreference(option.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${option.key} mode`}
              style={({ pressed }) => [
                styles.optionRow,
                index < APPEARANCE_OPTIONS.length - 1 && styles.optionRowBorder,
                pressed && styles.optionRowPressed,
              ]}
            >
              <View style={[styles.iconWrap, isSelected && styles.iconWrapActive]}>
                <Icon
                  size={22}
                  strokeWidth={1.8}
                  color={isSelected ? theme.colors.primary : chrome.secondaryText}
                />
              </View>
              <View style={[styles.selectionDot, isSelected && styles.selectionDotActive]}>
                {isSelected ? <View style={styles.selectionDotInner} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.helperText}>
        Changes apply immediately across the mobile app.
      </Text>
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
    },
    optionRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    optionRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: chrome.divider,
    },
    optionRowPressed: {
      backgroundColor: chrome.cardPressed,
    },
    iconWrap: {
      alignItems: 'center',
      backgroundColor: chrome.subtleSurface,
      borderRadius: 999,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    iconWrapActive: {
      backgroundColor: theme.colors.primarySoft,
    },
    selectionDot: {
      alignItems: 'center',
      borderColor: chrome.divider,
      borderRadius: 999,
      borderWidth: 2,
      height: 22,
      justifyContent: 'center',
      width: 22,
    },
    selectionDotActive: {
      borderColor: theme.colors.primary,
    },
    selectionDotInner: {
      backgroundColor: theme.colors.primary,
      borderRadius: 999,
      height: 10,
      width: 10,
    },
    helperText: {
      color: chrome.secondaryText,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 16,
      marginHorizontal: 4,
    },
  };
});
