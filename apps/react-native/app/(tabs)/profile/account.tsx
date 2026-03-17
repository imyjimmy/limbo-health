// app/(tabs)/profile/account.tsx
// Account settings: display name, connected identities, account deletion.

import React, { useState, useCallback, useEffect } from 'react';
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
import Svg, { Path } from 'react-native-svg';
import { GoogleLogo } from '../../../components/branding/GoogleLogo';
import { useAuthContext } from '../../../providers/AuthProvider';
import type { OAuthConnection } from '../../../types/auth';
import { createThemedStyles, useTheme, useThemedStyles } from '../../../theme';
import { getProfileChrome } from './profileChrome';

function encodeBech32(prefix: string, hexStr: string): string {
  const bytes = hexToBytes(hexStr);
  return bech32.encode(prefix, bech32.toWords(bytes), 1500);
}

function truncateNpub(npub: string): string {
  if (npub.length <= 20) return npub;
  return `${npub.slice(0, 12)}...${npub.slice(-6)}`;
}

function formatProviderName(provider: string): string {
  return provider
    .split(/[_-]/g)
    .filter(Boolean)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function connectionDetail(conn: OAuthConnection): string {
  if (conn.email) return conn.email;
  if (conn.providerId) return conn.providerId;
  return 'Connected';
}

function NostrLogo({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 875 875">
      <Path
        fill={color}
        d="M684.72 485.57c.22 12.59-11.93 51.47-38.67 81.3s-56.02 20.85-58.42 20.16-3.09-4.46-7.89-3.77-9.6 6.17-18.86 7.2-17.49 1.71-26.06-1.37c-4.46.69-5.14.71-7.2 2.24s-17.83 10.79-21.6 11.47c0 7.2-1.37 44.57 0 55.89s3.77 25.71 7.54 36 2.74 10.63 7.54 9.94 13.37.34 15.77 4.11 1.37 6.51 5.49 8.23 60.69 17.14 99.43 19.2c26.74.69 42.86 2.74 52.12 19.54 1.37 7.89 7.54 13.03 11.31 14.06s8.23 2.06 12 5.83 1.03 8.23 5.49 11.66 14.74 8.57 25.37 13.71 15.09 13.37 15.77 16.11 1.71 10.97 1.71 10.97-8.91 0-10.97-2.06-2.74-5.83-2.74-5.83-6.17 1.03-7.54 3.43.69 2.74-7.89.69-11.66-3.77-18.17-8.57-16.46-17.14-25.03-16.8c4.11 8.23 5.83 8.23 10.63 10.97s8.23 5.83 8.23 5.83l-7.2 4.46s-4.46 2.06-14.74-.69-11.66-4.46-12.69-10.63 0-9.26-2.74-14.4-4.11-15.77-22.29-21.26c-18.17-5.49-66.52-21.26-100.12-24.69s-22.63-2.74-28.11-1.37-15.77 4.46-26.4-1.37-16.8-13.71-17.49-20.23-1.71-10.97 0-19.2 3.43-19.89 1.71-26.74-14.06-55.89-19.89-64.12c-13.03 1.03-50.74-.69-50.74-.69s-2.4-.69-17.49 5.83-36.48 13.76-46.77 19.93-14.4 9.7-16.12 13.13c.12 3-1.23 7.72-2.79 9.06s-12.48 2.42-12.48 2.42-5.85 5.86-8.25 9.97c-6.86 9.6-55.2 125.14-66.52 149.83-13.54 32.57-9.77 27.43-37.71 27.43s-8.06.3-8.06.3-12.34 5.88-16.8 5.88-18.86-2.4-26.4 0-16.46 9.26-23.31 10.29-4.95-1.34-8.38-3.74c-4-.21-14.27-.12-14.27-.12s1.74-6.51 7.91-10.88c8.23-5.83 25.37-16.11 34.63-21.26s17.49-7.89 23.31-9.26 18.51-6.17 30.51-9.94 19.54-8.23 29.83-31.54 50.4-111.43 51.43-116.23c.63-2.96 3.73-6.48 4.8-15.09.66-5.35-2.49-13.04 1.71-22.63 10.97-25.03 21.6-20.23 26.4-20.23s17.14.34 26.4-1.37 15.43-2.74 24.69-7.89 11.31-8.91 11.31-8.91l-19.89-3.43s-18.51.69-25.03-4.46-15.43-15.77-15.43-15.77l-7.54-7.2 1.03 8.57s-5.14-8.91-6.51-10.29-8.57-6.51-11.31-11.31-7.54-25.03-7.54-25.03l-6.17 13.03-1.71-18.86-5.14 7.2-2.74-16.11-4.8 8.23-3.43-14.4-5.83 4.46-2.4-10.29-5.83-3.43s-14.06-9.26-16.46-9.6-4.46 3.43-4.46 3.43l1.37 12-12.2-6.27-7-11.9s2.36 4.01-9.62 7.53c-20.55 0-21.89-2.28-24.93-3.94-1.31-6.56-5.57-10.11-5.57-10.11h-20.57l-.34-6.86-7.89 3.09.69-10.29h-14.06l1.03-11.31h-8.91s3.09-9.26 25.71-22.97 25.03-16.46 46.29-17.14c21.26-.69 32.91 2.74 46.29 8.23s38.74 13.71 43.89 17.49c11.31-9.94 28.46-19.89 34.29-19.89 1.03-2.4 6.19-12.33 17.96-17.6 35.31-15.81 108.13-34 131.53-35.54 31.2-2.06 7.89-1.37 39.09 2.06s54.17 7.54 69.6 12.69c12.58 4.19 25.03 9.6 34.29 2.06 4.33-1.81 11.81-1.34 17.83-5.14 30.69-25.09 34.72-32.35 43.63-41.95s20.14-24.91 22.54-45.14 4.46-58.29-10.63-88.12-28.8-45.26-34.63-69.26-8.23-61.03-6.17-73.03 5.14-22.29 6.86-30.51 9.94-14.74 19.89-16.46c9.94-1.71 17.83 1.37 22.29 4.8s11.65 6.28 13.37 10.29c.34 1.71-1.37 6.51 8.23 8.23 9.6 1.71 16.05 4.16 16.05 4.16s15.64 4.29 3.11 7.73c-12.69 2.06-20.52-.71-24.29 1.69s-7.21 10.08-9.61 11.1-7.2.34-12 4.11-9.6 6.86-12.69 14.4-5.49 15.77-3.43 26.74 8.57 31.54 14.4 43.2 20.23 40.8 24.34 47.66 15.77 29.49 16.8 53.83 1.03 44.23 0 54.86-10.84 51.65-35.53 85.94c-8.16 14.14-23.21 31.9-24.67 35.03-1.45 3.13-3.02 4.88-1.61 7.65 4.62 9.05 12.87 22.13 14.71 29.22 2.29 6.64 6.99 16.13 7.22 28.72Z"
      />
    </Svg>
  );
}

function OAuthProviderLogo({ provider }: { provider: string }) {
  const styles = useThemedStyles(createStyles);
  const normalizedProvider = provider.toLowerCase();
  if (normalizedProvider === 'google') return <GoogleLogo />;

  return (
    <View style={styles.genericProviderLogo}>
      <Text style={styles.genericProviderLogoText}>
        {normalizedProvider.charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

export default function AccountScreen() {
  const router = useRouter();
  const { state, hasStoredNostrKey, updateMetadata, resetLocalAppState, deleteAccount } = useAuthContext();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const chrome = getProfileChrome(theme);

  const fallbackName = state.googleProfile?.name || '';
  const [firstName, setFirstName] = useState(
    state.metadata?.first_name ?? fallbackName.split(' ')[0] ?? '',
  );
  const [lastName, setLastName] = useState(
    state.metadata?.last_name ?? fallbackName.split(' ').slice(1).join(' ') ?? '',
  );
  const [displayName, setDisplayName] = useState(
    state.metadata?.display_name || state.metadata?.name || fallbackName,
  );
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const oauthConnections = state.connections.filter(conn => !!conn.provider);
  const hasLinkedNostrKey = !!state.pubkey;
  const npub = hasLinkedNostrKey ? encodeBech32('npub', state.pubkey!) : null;

  useEffect(() => {
    if (firstName || lastName || displayName) return;

    const nextFirst = state.metadata?.first_name ?? fallbackName.split(' ')[0] ?? '';
    const nextLast = state.metadata?.last_name ?? fallbackName.split(' ').slice(1).join(' ') ?? '';
    const nextDisplay = state.metadata?.display_name || state.metadata?.name || fallbackName;

    if (nextFirst || nextLast || nextDisplay) {
      setFirstName(nextFirst);
      setLastName(nextLast);
      setDisplayName(nextDisplay);
    }
  }, [firstName, lastName, displayName, state.metadata?.first_name, state.metadata?.last_name, state.metadata?.display_name, state.metadata?.name, fallbackName]);

  const handleNameSave = useCallback(async () => {
    const first = firstName.trim();
    const last = lastName.trim();
    const display = displayName.trim();
    const updates: Record<string, string | undefined> = {
      first_name: first || undefined,
      last_name: last || undefined,
      display_name: display || undefined,
      name: display || [first, last].filter(Boolean).join(' ') || undefined,
    };
    // Skip save if nothing changed
    if (first === (state.metadata?.first_name || '')
      && last === (state.metadata?.last_name || '')
      && display === (state.metadata?.display_name || '')
    ) return;
    await updateMetadata(updates);
  }, [firstName, lastName, displayName, state.metadata?.first_name, state.metadata?.last_name, state.metadata?.display_name, updateMetadata]);

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

  const handleResetLocalAppState = useCallback(() => {
    Alert.alert(
      'Reset Local App State',
      'This only resets data on this device. It signs you out, removes the local encryption key, clears your saved personal info and device-only preferences, and returns you to Welcome. It does not delete your backend account or server-side data. If this device is your only copy of the encryption key, back it up before continuing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Local App State',
          style: 'destructive',
          onPress: async () => {
            setIsResetting(true);
            try {
              await resetLocalAppState();
              router.replace('/(auth)/welcome');
            } catch (err: any) {
              Alert.alert(
                'Could Not Reset Local App State',
                err.message || 'Something went wrong. Please try again later.',
              );
            } finally {
              setIsResetting(false);
            }
          },
        },
      ],
    );
  }, [resetLocalAppState, router]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* NAME */}
      <Text style={styles.sectionLabel}>NAME</Text>
      <View style={styles.card}>
        <View style={styles.nameRow}>
          <Text style={styles.nameLabel}>First</Text>
          <TextInput
            style={styles.nameInput}
            value={firstName}
            onChangeText={setFirstName}
            onBlur={handleNameSave}
            onSubmitEditing={handleNameSave}
            placeholder="First name"
            placeholderTextColor={chrome.secondaryText}
            returnKeyType="next"
            maxLength={50}
            autoCorrect={false}
          />
        </View>
        <View style={styles.rowSeparator} />
        <View style={styles.nameRow}>
          <Text style={styles.nameLabel}>Last</Text>
          <TextInput
            style={styles.nameInput}
            value={lastName}
            onChangeText={setLastName}
            onBlur={handleNameSave}
            onSubmitEditing={handleNameSave}
            placeholder="Last name"
            placeholderTextColor={chrome.secondaryText}
            returnKeyType="done"
            maxLength={50}
            autoCorrect={false}
          />
        </View>
      </View>

      {/* DISPLAY NAME */}
      <Text style={styles.sectionLabel}>DISPLAY NAME</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.displayNameInput}
          value={displayName}
          onChangeText={setDisplayName}
          onBlur={handleNameSave}
          onSubmitEditing={handleNameSave}
          placeholder="How others see you"
          placeholderTextColor={chrome.secondaryText}
          returnKeyType="done"
          maxLength={100}
          autoCorrect={false}
        />
      </View>

      {/* OAUTH CONNECTIONS */}
      <Text style={styles.sectionLabel}>OAUTH CONNECTIONS</Text>
      <View style={styles.card}>
        {oauthConnections.length > 0 ? (
          oauthConnections.map((conn, index) => (
            <View
              key={`${conn.provider}:${conn.providerId ?? index}`}
              style={[
                styles.connectionRow,
                index < oauthConnections.length - 1 && styles.connectionRowBorder,
              ]}
            >
              <View style={styles.providerLeft}>
                <OAuthProviderLogo provider={conn.provider} />
                <Text style={styles.providerName}>{formatProviderName(conn.provider)}</Text>
              </View>
              <View style={styles.connectionRight}>
                <Text style={styles.connectionDetail} numberOfLines={1}>
                  {connectionDetail(conn)}
                </Text>
                <Text style={styles.connectedBadge}>✓</Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.connectionRow}>
            <Text style={styles.providerName}>OAuth</Text>
            <Text style={styles.notConnected}>No approved connections</Text>
          </View>
        )}
      </View>

      {/* SOVEREIGN ID CONNECTIONS */}
      <Text style={styles.sectionLabel}>SOVEREIGN ID CONNECTIONS</Text>
      <View style={styles.card}>
        <View style={[styles.connectionRow, styles.connectionRowBorder]}>
          <View style={styles.providerLeft}>
            <NostrLogo color={theme.colors.accent} />
            <Text style={styles.providerName}>Nostr</Text>
          </View>
          <View style={styles.connectionRight}>
            {hasLinkedNostrKey && npub ? (
              <>
                <Text style={styles.connectionDetail}>{truncateNpub(npub)}</Text>
                <Text style={hasStoredNostrKey ? styles.connectedBadge : styles.importBadge}>
                  {hasStoredNostrKey ? '✓' : 'Import'}
                </Text>
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

      <Pressable
        style={({ pressed }) => [
          styles.resetCard,
          pressed && styles.resetCardPressed,
        ]}
        onPress={handleResetLocalAppState}
        disabled={isResetting || isDeleting}
      >
        {isResetting ? (
          <ActivityIndicator color={theme.colors.warning} />
        ) : (
          <Text style={styles.resetText}>Reset Local App State</Text>
        )}
      </Pressable>

      {/* DELETE ACCOUNT */}
      <Pressable
        style={({ pressed }) => [
          styles.deleteCard,
          pressed && styles.deleteCardPressed,
        ]}
        onPress={handleDeleteAccount}
        disabled={isDeleting || isResetting}
      >
        {isDeleting ? (
          <ActivityIndicator color={theme.colors.danger} />
        ) : (
          <Text style={styles.deleteText}>Delete Account</Text>
        )}
      </Pressable>

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
      paddingTop: 8,
      paddingBottom: 48,
    },
    sectionLabel: {
      color: chrome.secondaryText,
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0.5,
      marginBottom: 8,
      marginTop: 24,
      marginLeft: 4,
    },
    card: {
      backgroundColor: chrome.cardBackground,
      borderRadius: 12,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    nameLabel: {
      color: chrome.secondaryText,
      fontSize: 15,
      width: 50,
    },
    nameInput: {
      color: chrome.primaryText,
      fontSize: 16,
      flex: 1,
    },
    displayNameInput: {
      color: chrome.primaryText,
      fontSize: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    rowSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: chrome.divider,
      marginLeft: 16,
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
      borderBottomColor: chrome.divider,
    },
    providerName: {
      color: chrome.primaryText,
      fontSize: 15,
      fontWeight: '500',
    },
    providerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    genericProviderLogo: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: chrome.subtleSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    genericProviderLogoText: {
      color: chrome.primaryText,
      fontSize: 10,
      fontWeight: '700',
      lineHeight: 12,
    },
    connectionRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 1,
    },
    connectionDetail: {
      color: chrome.secondaryText,
      fontSize: 14,
      flexShrink: 1,
    },
    connectedBadge: {
      color: theme.colors.success,
      fontSize: 16,
      fontWeight: '600',
    },
    importBadge: {
      color: theme.colors.warning,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    notConnected: {
      color: chrome.secondaryText,
      fontSize: 14,
    },
    comingSoon: {
      color: chrome.secondaryText,
      fontSize: 14,
      fontStyle: 'italic',
    },
    disabledIndicator: {
      color: chrome.secondaryText,
      fontSize: 14,
    },
    deleteCard: {
      backgroundColor: chrome.cardBackground,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 12,
    },
    deleteCardPressed: {
      backgroundColor: chrome.cardPressed,
    },
    deleteText: {
      color: theme.colors.danger,
      fontSize: 15,
      fontWeight: '500',
    },
    resetCard: {
      backgroundColor: chrome.cardBackground,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 32,
    },
    resetCardPressed: {
      backgroundColor: chrome.cardPressed,
    },
    resetText: {
      color: theme.colors.warning,
      fontSize: 15,
      fontWeight: '500',
    },
  };
});
