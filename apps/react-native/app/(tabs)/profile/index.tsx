import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileAvatar } from '../../../components/navigation/ProfileAvatar';
import { useAuthContext } from '../../../providers/AuthProvider';
import { useRouter } from 'expo-router';

type MenuItemKey =
  | 'account'
  | 'personal-info'
  | 'encryption-keys'
  | 'notifications'
  | 'about'
  | 'sign-out';

type MenuItem = {
  key: MenuItemKey;
  label: string;
  destructive: boolean;
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { state, logout } = useAuthContext();
  const router = useRouter();

  const isGoogle = state.loginMethod === 'google';

  const displayName = state.metadata?.name
    || (isGoogle ? (state.googleProfile?.name ?? state.googleProfile?.email ?? 'Google User') : 'User');

  const avatarUrl = isGoogle
    ? (state.googleProfile?.picture ?? null)
    : (state.metadata?.picture ?? null);

  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const menuItems: MenuItem[] = [
    { key: 'account', label: 'Account', destructive: false },
    { key: 'personal-info', label: 'My Personal Info', destructive: false },
    { key: 'encryption-keys', label: 'Encryption Keys', destructive: false },
    { key: 'notifications', label: 'Notifications', destructive: false },
    { key: 'about', label: 'About', destructive: false },
    { key: 'sign-out', label: 'Sign Out', destructive: true },
  ];

  const handleMenuPress = async (key: MenuItemKey) => {
    if (key === 'sign-out') {
      await logout?.();
      router.replace('/(auth)/welcome');
      return;
    }
    if (key === 'account') router.push('/(tabs)/profile/account');
    if (key === 'personal-info') router.push('/(tabs)/profile/personal-info');
    if (key === 'encryption-keys') router.push('/(tabs)/profile/encryption-keys');
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
        {isGoogle && state.googleProfile?.email && (
          <Text style={styles.emailText}>{state.googleProfile.email}</Text>
        )}
      </View>

      <View style={styles.menuContainer}>
        {menuItems.map((item, i) => (
          <Pressable
            key={item.label}
            onPress={() => handleMenuPress(item.key)}
            style={({ pressed }) => [
              styles.menuItem,
              i === 0 && styles.menuItemFirst,
              i === menuItems.length - 1 && styles.menuItemLast,
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1923',
    paddingHorizontal: 20,
  },
  headerTitle: {
    color: '#ffffff',
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
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  emailText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  menuContainer: {
    gap: 1,
  },
  menuItem: {
    backgroundColor: 'rgba(255,255,255,0.04)',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  menuItemText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
  },
  menuItemDestructive: {
    color: '#ef4444',
  },
  menuItemChevron: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 13,
  },
});
