// app/(tabs)/profile/account.tsx
// Account settings: display name, connected identities, account deletion.

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { bech32 } from '@scure/base';
import { hexToBytes } from '@noble/hashes/utils.js';
import { useAuthContext } from '../../../providers/AuthProvider';

function encodeBech32(prefix: string, hexStr: string): string {
  const bytes = hexToBytes(hexStr);
  return bech32.encode(prefix, bech32.toWords(bytes), 1500);
}

function truncateNpub(npub: string): string {
  if (npub.length <= 20) return npub;
  return `${npub.slice(0, 12)}...${npub.slice(-6)}`;
}

export default function AccountScreen() {
  const router = useRouter();
  const { state, updateMetadata, deleteAccount } = useAuthContext();

  const initialName = state.metadata?.name || state.googleProfile?.name || '';
  const [displayName, setDisplayName] = useState(initialName);
  const [isDeleting, setIsDeleting] = useState(false);

  // Derived state
  const isGoogleConnected = state.loginMethod === 'google' || !!state.googleProfile;
  const googleEmail = state.googleProfile?.email || null;
  const hasNostrKey = !!state.pubkey;
  const npub = hasNostrKey ? encodeBech32('npub', state.pubkey!) : null;

  const handleNameSave = useCallback(async () => {
    const trimmed = displayName.trim();
    const currentName = state.metadata?.name || '';
    if (trimmed === currentName) return;
    await updateMetadata({ name: trimmed || undefined });
  }, [displayName, state.metadata?.name, updateMetadata]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      'This action is irreversible. Your encryption key will be destroyed and all server-side data will be permanently deleted. Local binder files will remain on this device but will be unreadable without the key.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteAccount();
              router.replace('/(auth)/welcome');
            } catch (err: any) {
              Alert.alert(
                'Could Not Delete Account',
                err.message || 'Something went wrong. Please try again later.',
              );
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  }, [deleteAccount, router]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* DISPLAY NAME */}
      <Text style={styles.sectionLabel}>DISPLAY NAME</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.textInput}
          value={displayName}
          onChangeText={setDisplayName}
          onBlur={handleNameSave}
          onSubmitEditing={handleNameSave}
          placeholder="Your name"
          placeholderTextColor="rgba(255,255,255,0.3)"
          returnKeyType="done"
          maxLength={100}
          autoCorrect={false}
        />
      </View>

      {/* OAUTH CONNECTIONS */}
      <Text style={styles.sectionLabel}>OAUTH CONNECTIONS</Text>
      <View style={styles.card}>
        <View style={styles.connectionRow}>
          <Text style={styles.providerName}>Google</Text>
          <View style={styles.connectionRight}>
            {isGoogleConnected && googleEmail ? (
              <>
                <Text style={styles.connectionDetail} numberOfLines={1}>{googleEmail}</Text>
                <Text style={styles.connectedBadge}>✓</Text>
              </>
            ) : (
              <Text style={styles.notConnected}>Not connected</Text>
            )}
          </View>
        </View>
      </View>

      {/* SOVEREIGN ID CONNECTIONS */}
      <Text style={styles.sectionLabel}>SOVEREIGN ID CONNECTIONS</Text>
      <View style={styles.card}>
        <View style={[styles.connectionRow, styles.connectionRowBorder]}>
          <Text style={styles.providerName}>Nostr</Text>
          <View style={styles.connectionRight}>
            {hasNostrKey && npub ? (
              <>
                <Text style={styles.connectionDetail}>{truncateNpub(npub)}</Text>
                <Text style={styles.connectedBadge}>✓</Text>
              </>
            ) : (
              <Text style={styles.notConnected}>Not connected</Text>
            )}
          </View>
        </View>
        <View style={styles.connectionRow}>
          <Text style={styles.providerName}>PGP</Text>
          <View style={styles.connectionRight}>
            <Text style={styles.comingSoon}>Coming soon</Text>
            <Text style={styles.disabledIndicator}>---</Text>
          </View>
        </View>
      </View>

      {/* DELETE ACCOUNT */}
      <Pressable
        style={({ pressed }) => [
          styles.deleteCard,
          pressed && styles.deleteCardPressed,
        ]}
        onPress={handleDeleteAccount}
        disabled={isDeleting}
      >
        {isDeleting ? (
          <ActivityIndicator color="#ef4444" />
        ) : (
          <Text style={styles.deleteText}>Delete Account</Text>
        )}
      </Pressable>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1923',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 48,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 24,
    marginLeft: 4,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
  },
  textInput: {
    color: '#ffffff',
    fontSize: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  connectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  connectionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  providerName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  connectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  connectionDetail: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    flexShrink: 1,
  },
  connectedBadge: {
    color: '#34d399',
    fontSize: 16,
    fontWeight: '600',
  },
  notConnected: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
  },
  comingSoon: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    fontStyle: 'italic',
  },
  disabledIndicator: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 14,
  },
  deleteCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 32,
  },
  deleteCardPressed: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  deleteText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '500',
  },
});
