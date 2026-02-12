// app/(tabs)/index.tsx
// Binder list — placeholder for Week 2.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuthContext } from '../../providers/AuthProvider';
import { useCryptoContext } from '../../providers/CryptoProvider';

export default function BinderListScreen() {
  const { state } = useAuthContext();
  const { ready, masterPubkey } = useCryptoContext();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Binders</Text>
      <Text style={styles.status}>
        Auth: {state.status}
      </Text>
      <Text style={styles.status}>
        Crypto: {ready ? 'ready' : 'loading...'}
      </Text>
      {masterPubkey && (
        <Text style={styles.pubkey} numberOfLines={1}>
          {masterPubkey}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
    marginBottom: 16,
  },
  status: {
    fontSize: 15,
    color: '#666',
    marginBottom: 8,
  },
  pubkey: {
    fontSize: 13,
    fontFamily: 'Courier',
    color: '#999',
    marginTop: 8,
  },
});