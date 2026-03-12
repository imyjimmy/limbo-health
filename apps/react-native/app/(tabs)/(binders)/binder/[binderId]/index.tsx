// app/binder/[binderId]/index.tsx
// Root directory — delegates to the shared BinderDirectory component.
// Handles pendingRestore from Document tab: reconstructs Navigator 4's stack
// via CommonActions.reset so back buttons work at every level.

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { CommonActions } from '@react-navigation/native';
import { BinderDirectory } from '../../../../../components/binder/BinderDirectory';
import { consumePendingRestore } from '../../../../../core/binder/LastViewedStore';

export default function BinderRootScreen() {
  const { binderId, binderName } = useLocalSearchParams<{
    binderId: string;
    binderName?: string | string[];
  }>();
  const navigation = useNavigation();
  const [ready, setReady] = useState(false);
  const resolvedBinderName = Array.isArray(binderName) ? binderName[0] : binderName;
  const title = resolvedBinderName?.trim() ? resolvedBinderName : 'Binder';

  useEffect(() => {
    const dirPath = consumePendingRestore();
    if (!dirPath) {
      setReady(true);
      return;
    }

    // Build the stack: binder root + one route per path prefix
    // e.g. "conditions/back-acne" → [index, browse/conditions, browse/conditions/back-acne]
    const segments = dirPath.split('/');
    const routes: { name: string; params?: Record<string, unknown> }[] = [
      { name: 'index', params: { binderId, binderName: resolvedBinderName } },
    ];
    for (let i = 1; i <= segments.length; i++) {
      routes.push({
        name: 'browse/[...path]',
        params: { binderId, path: segments.slice(0, i) },
      });
    }

    navigation.dispatch(
      CommonActions.reset({
        index: routes.length - 1,
        routes,
      }),
    );
    // Don't setReady — the reset unmounts this screen
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  }

  return <BinderDirectory binderId={binderId!} dirPath="" title={title} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
