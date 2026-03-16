import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { createThemedStyles, useThemedStyles } from '../../theme';

interface ProfileAvatarProps {
  isActive: boolean;
  hasNotification?: boolean;
  imageUrl?: string | null;
  initials: string;
  size?: number;
}

export function ProfileAvatar({
  isActive,
  hasNotification = false,
  imageUrl,
  initials,
  size = 28,
}: ProfileAvatarProps) {
  const styles = useThemedStyles(createStyles);
  const ringSize = size + 6;
  const dotSize = 10;

  return (
    <View style={[styles.container, { width: ringSize, height: ringSize }]}>
      {/* Ring */}
      <View
        style={[
          styles.ring,
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderWidth: isActive ? 2 : 1.5,
            borderColor: isActive
              ? styles.activeRing.borderColor
              : styles.inactiveRing.borderColor,
          },
        ]}
      />

      {/* Avatar circle */}
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={[styles.avatarImage, { width: size, height: size, borderRadius: size / 2 }]}
          />
        ) : (
          <Text style={styles.initialsText}>{initials}</Text>
        )}
      </View>

      {/* Notification dot */}
      {hasNotification && (
        <View
          style={[
            styles.notificationDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
            },
          ]}
        />
      )}
    </View>
  );
}

const createStyles = createThemedStyles((theme) => ({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
  },
  avatar: {
    backgroundColor: theme.colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    resizeMode: 'cover',
  },
  initialsText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
  },
  notificationDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.danger,
    borderWidth: 2,
    borderColor: theme.colors.tabBarBackground,
  },
  activeRing: {
    borderColor: theme.colors.tabIconActive,
  },
  inactiveRing: {
    borderColor: theme.colors.tabBarBorder,
  },
}));
