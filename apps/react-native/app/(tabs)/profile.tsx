import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileAvatar } from '../../components/navigation/ProfileAvatar';
import { useAuthContext } from '../../providers/AuthProvider';
import { useRouter } from 'expo-router';

const MENU_ITEMS = [
  { label: 'Account', destructive: false },
  { label: 'Security & Keys', destructive: false },
  { label: 'Notifications', destructive: false },
  { label: 'About', destructive: false },
  { label: 'Sign Out', destructive: true },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { state, logout } = useAuthContext();
  const router = useRouter();

  const displayName = state.metadata?.name ?? 'User';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.headerTitle}>Profile</Text>

      <View style={styles.avatarSection}>
        <ProfileAvatar
          isActive={false}
          imageUrl={state.metadata?.picture ?? null}
          initials={initials}
          size={64}
          hasNotification={false}
        />
        <Text style={styles.displayName}>{displayName}</Text>
      </View>

      <View style={styles.menuContainer}>
        {MENU_ITEMS.map((item, i) => (
          <Pressable
            key={item.label}
            onPress={() => {
              if (item.label === 'Sign Out') logout?.();
              if (item.label === 'Security & Keys') router.push('/key-management');
            }}
            style={({ pressed }) => [
              styles.menuItem,
              i === 0 && styles.menuItemFirst,
              i === MENU_ITEMS.length - 1 && styles.menuItemLast,
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
    gap: 12,
  },
  displayName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
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
    fontSize: 18,
  },
});