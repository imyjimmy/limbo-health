// app/_layout.tsx
// Root layout. Polyfills MUST be the first import.

import '../polyfills/setup';

import React from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '../providers/AuthProvider';
import { CryptoProvider } from '../providers/CryptoProvider';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <CryptoProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="profile" />
            <Stack.Screen
              name="camera"
              options={{
                presentation: 'fullScreenModal',
                animation: 'slide_from_bottom',
              }}
            />
          </Stack>
        </CryptoProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}