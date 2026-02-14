// components/ProfileAvatar.tsx
// Circular avatar showing Nostr profile pic or initials fallback.
// Tapping navigates to the profile screen.

import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthContext } from '../providers/AuthProvider';

function getInitials(metadata: any, pubkey: string | null): string {
  const name = metadata?.display_name || metadata?.name;
  if (name) {
    return name
      .split(' ')
      .map((w: string) => w.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }
  return pubkey ? pubkey.substring(0, 2).toUpperCase() : '?';
}

export function ProfileAvatar({ size = 36 }: { size?: number }) {
  const router = useRouter();
  const { state } = useAuthContext();
  const { metadata, pubkey } = state;
  const picture = metadata?.picture;

  return (
    <Pressable onPress={() => router.push('/profile')} hitSlop={8}>
      {picture ? (
        <Image
          source={{ uri: picture }}
          style={[
            styles.image,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <Text style={[styles.initials, { fontSize: size * 0.4 }]}>
            {getInitials(metadata, pubkey)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#e5e5e5',
  },
  fallback: {
    backgroundColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#fff',
    fontWeight: '700',
  },
});