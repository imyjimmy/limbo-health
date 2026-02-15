import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function CreateStub() {
  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f1923' },
});