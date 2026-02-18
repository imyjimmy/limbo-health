// app/binder/[binderId]/_layout.tsx
// Layout for binder detail screens. Provides a Stack navigator with headers.

import React from 'react';
import { Stack } from 'expo-router/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function BinderLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Back',
        headerStatusBarHeight: insets.top,
      } as any}
    />
  );
}
