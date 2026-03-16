import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createThemedStyles, useThemedStyles } from '../../theme';

export default function SearchScreen() {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.container} />;
}

const createStyles = createThemedStyles((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.headerBackground },
}));
