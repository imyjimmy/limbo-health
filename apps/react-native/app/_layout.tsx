// app/_layout.tsx
// Root layout. Polyfills MUST be the first import.

import '../polyfills/setup';

import React from 'react';
import { Stack } from 'expo-router/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '../providers/AuthProvider';
import { BioProfileProvider } from '../providers/BioProfileProvider';
import { CryptoProvider } from '../providers/CryptoProvider';
import { ThemeProvider } from '../theme';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
          <BioProfileProvider>
            <CryptoProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="bio-setup" />
                <Stack.Screen name="records-request" />
                <Stack.Screen name="records-request-wizard" />
                <Stack.Screen
                  name="camera"
                  options={{
                    presentation: 'fullScreenModal',
                    animation: 'slide_from_bottom',
                  }}
                />
              </Stack>
            </CryptoProvider>
          </BioProfileProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
