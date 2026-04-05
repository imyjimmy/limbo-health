import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileAvatar } from '../../../components/navigation/ProfileAvatar';
import { useAuthContext } from '../../../providers/AuthProvider';
import { useRouter } from 'expo-router';
import { createThemedStyles, useThemedStyles } from '../../../theme';
import { getProfileChrome } from './profileChrome';

type MenuItemKey =
  | 'account'
  | 'medical-info'
  | 'settings'
  | 'encryption-keys'
  | 'notifications'
  | 'about'
  | 'sign-out';

type MenuItem = {
  key: MenuItemKey;
  label: string;
  destructive: boolean;
};

type MenuSection = {
  key: string;
  items: MenuItem[];
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { state, logout } = useAuthContext();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);

  const isOAuth = state.loginMethod !== 'nostr' && !!state.oauthProfile;

  const displayName = state.metadata?.name
    || (isOAuth ? (state.oauthProfile?.name ?? state.oauthProfile?.email ?? 'User') : 'User');

  const avatarUrl = isOAuth
    ? (state.oauthProfile?.picture ?? null)
    : (state.metadata?.picture ?? null);

  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const menuSections: MenuSection[] = [
    {
      key: 'records-setup',
      items: [{ key: 'medical-info', label: 'My Medical Info', destructive: false }],
    },
    {
      key: 'account-logistics',
      items: [
        { key: 'account', label: 'Account', destructive: false },
        { key: 'settings', label: 'Settings', destructive: false },
        { key: 'encryption-keys', label: 'Encryption Keys', destructive: false },
        { key: 'notifications', label: 'Notifications', destructive: false },
        { key: 'about', label: 'About', destructive: false },
        { key: 'sign-out', label: 'Sign Out', destructive: true },
      ],
    },
  ];

  const handleMenuPress = async (key: MenuItemKey) => {
    if (key === 'sign-out') {
      await logout?.();
      router.replace('/(auth)/welcome');
      return;
    }
    if (key === 'account') router.push('/(tabs)/profile/account');
    if (key === 'settings') router.push('/(tabs)/profile/settings');
    if (key === 'medical-info') router.push('/(tabs)/profile/medical-info');
    if (key === 'encryption-keys') router.push('/(tabs)/profile/encryption-keys');
    if (key === 'notifications') router.push('/(tabs)/profile/notifications');
    if (key === 'about') router.push('/(tabs)/profile/about');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.headerTitle}>Profile</Text>

      <View style={styles.avatarSection}>
        <ProfileAvatar
          isActive={false}
          imageUrl={avatarUrl}
          initials={initials}
          size={64}
          hasNotification={false}
        />
        <Text style={styles.displayName}>{displayName}</Text>
        {isOAuth && state.oauthProfile?.email && (
          <Text style={styles.emailText}>{state.oauthProfile.email}</Text>
        )}
      </View>

      <View style={styles.menuContainer}>
        {menuSections.map((section) => (
          <View key={section.key} style={styles.menuGroup}>
            {section.items.map((item, i) => (
              <Pressable
                key={item.key}
                onPress={() => handleMenuPress(item.key)}
                style={({ pressed }) => [
                  styles.menuItem,
                  i === 0 && styles.menuItemFirst,
                  i === section.items.length - 1 && styles.menuItemLast,
                  pressed && styles.menuItemPressed,
                ]}
              >
                <Text
                  style={[
                    styles.menuItemText,
                    item.destructive && styles.menuItemDestructive,
                  ]}
                >
                  {item.label}
                </Text>
                {!item.destructive && (
                  <Text style={styles.menuItemChevron}>›</Text>
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const createStyles = createThemedStyles((theme) => {
  const chrome = getProfileChrome(theme);

  return {
    container: {
      flex: 1,
      backgroundColor: chrome.pageBackground,
      paddingHorizontal: 20,
    },
    headerTitle: {
      color: chrome.primaryText,
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.3,
      marginBottom: 24,
    },
    avatarSection: {
      alignItems: 'center',
      marginBottom: 32,
      gap: 8,
    },
    displayName: {
      color: chrome.primaryText,
      fontSize: 18,
      fontWeight: '600',
      marginTop: 4,
    },
    emailText: {
      color: chrome.secondaryText,
      fontSize: 14,
    },
    menuContainer: {
      gap: 16,
    },
    menuGroup: {
      gap: 1,
    },
    menuItem: {
      backgroundColor: chrome.cardBackground,
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    menuItemFirst: {
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
    },
    menuItemLast: {
      borderBottomLeftRadius: 12,
      borderBottomRightRadius: 12,
    },
    menuItemPressed: {
      backgroundColor: chrome.cardPressed,
    },
    menuItemText: {
      color: chrome.primaryText,
      fontSize: 15,
    },
    menuItemDestructive: {
      color: theme.colors.danger,
    },
    menuItemChevron: {
      color: chrome.secondaryText,
      fontSize: 13,
    },
  };
});
