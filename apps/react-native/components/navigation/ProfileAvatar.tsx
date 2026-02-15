import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';

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
              ? '#ffffff'
              : 'rgba(255,255,255,0.25)',
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

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
  },
  avatar: {
    backgroundColor: '#2a2a3e',
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
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.5,
  },
  notificationDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#ef4444',
    borderWidth: 2,
    borderColor: '#0f1923',
  },
});