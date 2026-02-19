import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthContext } from '../../../providers/AuthProvider';

export default function AccountScreen() {
  const router = useRouter();
  const { deleteAccount } = useAuthContext();

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account?',
      'This permanently deletes your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              router.replace('/(auth)/welcome');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete account');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.spacer} />

      <View style={styles.dangerZone}>
        <Text style={styles.dangerLabel}>Danger Zone</Text>
        <Pressable
          onPress={handleDeleteAccount}
          style={({ pressed }) => [
            styles.deleteButton,
            pressed && styles.deleteButtonPressed,
          ]}
        >
          <Text style={styles.deleteButtonText}>Delete Account</Text>
        </Pressable>
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
  spacer: {
    flex: 1,
  },
  dangerZone: {
    marginBottom: 48,
    gap: 12,
  },
  dangerLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  deleteButton: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  deleteButtonPressed: {
    backgroundColor: 'rgba(239,68,68,0.2)',
  },
  deleteButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
});
