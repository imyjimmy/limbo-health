import React, { useEffect, useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { IconBell, IconBellOff } from '@tabler/icons-react-native';
import { createThemedStyles, useTheme, useThemedStyles } from '../../../theme';
import { getNotificationsEnabledPreference, setNotificationsEnabledPreference } from '../../../core/profile/notificationPreference';
import { getProfileChrome } from './profileChrome';

export default function NotificationsScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const chrome = getProfileChrome(theme);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    let isActive = true;

    void getNotificationsEnabledPreference().then((storedValue) => {
      if (isActive) {
        setEnabled(storedValue);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  const handleToggle = (nextValue: boolean) => {
    setEnabled(nextValue);
    void setNotificationsEnabledPreference(nextValue);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.iconWrap}>
            {enabled ? (
              <IconBell size={20} strokeWidth={1.8} color={theme.colors.primary} />
            ) : (
              <IconBellOff size={20} strokeWidth={1.8} color={chrome.secondaryText} />
            )}
          </View>
          <View style={styles.copyWrap}>
            <Text style={styles.rowTitle}>Allow notifications</Text>
            <Text style={styles.rowBody}>
              Turn Limbo notifications on or off for this device.
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            accessibilityLabel="Allow notifications"
            accessibilityHint="Turn Limbo notifications on or off for this device."
            accessibilityRole="switch"
            accessibilityState={{ checked: enabled }}
            trackColor={{
              false: theme.colors.secondarySoft,
              true: theme.colors.primarySoft,
            }}
            thumbColor={enabled ? theme.colors.primary : theme.colors.surface}
            ios_backgroundColor={chrome.subtleSurface}
          />
        </View>
      </View>

      <Text style={styles.helperText}>
        This preference is saved on this device and can be changed anytime.
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
      gap: 14,
      minHeight: 72,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    iconWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 24,
    },
    copyWrap: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      color: chrome.primaryText,
      fontSize: 16,
      fontWeight: '600',
    },
    rowBody: {
      color: chrome.secondaryText,
      fontSize: 14,
      lineHeight: 20,
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
