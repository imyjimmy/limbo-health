// app/profile.tsx
// Profile management screen: identity info, logout, future key management.

import React, { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useAuthContext } from '../providers/AuthProvider';

function truncatePubkey(pubkey: string): string {
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
}

function getDisplayName(metadata: any, pubkey: string | null): string {
  return metadata?.display_name || metadata?.name || truncatePubkey(pubkey || '');
}

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

export default function ProfileScreen() {
  const router = useRouter();
  const { state, logout } = useAuthContext();
  const { metadata, pubkey } = state;
  const [copied, setCopied] = useState(false);

  const handleCopyPubkey = async () => {
    if (!pubkey) return;
    await Clipboard.setStringAsync(pubkey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'This will remove your private key from this device. Make sure you have a backup.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/');
          },
        },
      ],
    );
  };

  const picture = metadata?.picture;
  const avatarSize = 80;

  return (
    <SafeAreaView style={styles.container}>
      {/* Back button */}
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      {/* Avatar */}
      <View style={styles.avatarSection}>
        {picture ? (
          <Image
            source={{ uri: picture }}
            style={{
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
              backgroundColor: '#e5e5e5',
            }}
          />
        ) : (
          <View
            style={{
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
              backgroundColor: '#374151',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700' }}>
              {getInitials(metadata, pubkey)}
            </Text>
          </View>
        )}

        <Text style={styles.displayName}>
          {getDisplayName(metadata, pubkey)}
        </Text>

        {metadata?.nip05 && (
          <Text style={styles.nip05}>{metadata.nip05}</Text>
        )}
      </View>

      {/* Pubkey */}
      <View style={styles.infoSection}>
        <Text style={styles.label}>Public Key</Text>
        <Pressable onPress={handleCopyPubkey} style={styles.pubkeyRow}>
          <Text style={styles.pubkeyText}>
            {pubkey ? truncatePubkey(pubkey) : '—'}
          </Text>
          <Text style={styles.copyHint}>
            {copied ? 'Copied!' : 'Tap to copy'}
          </Text>
        </Pressable>
      </View>

      {/* About */}
      {metadata?.about && (
        <View style={styles.infoSection}>
          <Text style={styles.label}>About</Text>
          <Text style={styles.aboutText}>{metadata.about}</Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
  },
  backButton: {
    paddingVertical: 16,
  },
  backText: {
    fontSize: 16,
    color: '#111',
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    marginTop: 12,
  },
  nip05: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  infoSection: {
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
  },
  label: {
    fontSize: 13,
    color: '#999',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  pubkeyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pubkeyText: {
    fontSize: 15,
    fontFamily: 'Courier',
    color: '#111',
  },
  copyHint: {
    fontSize: 13,
    color: '#007AFF',
  },
  aboutText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  actions: {
    marginTop: 'auto',
    paddingBottom: 32,
  },
  logoutButton: {
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  logoutText: {
    color: '#dc2626',
    fontSize: 17,
    fontWeight: '600',
  },
});