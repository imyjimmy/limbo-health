import React, { useEffect, useRef, useState } from 'react';
import { InteractionManager, ScrollView, Switch, Text, View } from 'react-native';
import { IconMoon, IconSun } from '@tabler/icons-react-native';
import type { ThemeMode } from '../../../theme';
import { createThemedStyles, useTheme, useThemeModePreference, useThemedStyles } from '../../../theme';
import { getProfileChrome } from './profileChrome';

export default function SettingsScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const chrome = getProfileChrome(theme);
  const { resolvedMode, setModePreference } = useThemeModePreference();
  const [previewMode, setPreviewMode] = useState<ThemeMode>(resolvedMode);
  const pendingTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(null);

  useEffect(() => {
    setPreviewMode(resolvedMode);
  }, [resolvedMode]);

  const isDarkMode = previewMode === 'dark';

  const handleToggle = (nextValue: boolean) => {
    const nextMode: ThemeMode = nextValue ? 'dark' : 'light';
    setPreviewMode(nextMode);
    pendingTaskRef.current?.cancel();
    pendingTaskRef.current = InteractionManager.runAfterInteractions(() => {
      void setModePreference(nextMode);
      pendingTaskRef.current = null;
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>APPEARANCE</Text>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.modeIconWrap}>
            <IconSun
              size={20}
              strokeWidth={1.8}
              color={!isDarkMode ? theme.colors.primary : chrome.secondaryText}
            />
          </View>
          <View style={styles.toggleWrap}>
            <Switch
              value={isDarkMode}
              onValueChange={handleToggle}
              accessibilityLabel="Dark mode"
              accessibilityHint="Switch between light and dark appearance."
              accessibilityRole="switch"
              accessibilityState={{ checked: isDarkMode }}
              trackColor={{
                false: theme.colors.secondarySoft,
                true: theme.colors.primarySoft,
              }}
              thumbColor={isDarkMode ? theme.colors.primary : theme.colors.surface}
              ios_backgroundColor={chrome.subtleSurface}
            />
          </View>
          <View style={styles.modeIconWrap}>
            <IconMoon
              size={20}
              strokeWidth={1.8}
              color={isDarkMode ? theme.colors.primary : chrome.secondaryText}
            />
          </View>
        </View>
      </View>

      <Text style={styles.helperText}>
        Changes apply immediately across the mobile app and are saved on this device.
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
    toggleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 12,
      minHeight: 56,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    modeIconWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 24,
    },
    toggleWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 32,
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
