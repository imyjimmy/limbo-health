// app/_layout.tsx
// Root layout. Polyfills MUST be the first import.

import '../polyfills/setup';

import React from 'react';
import * as SystemUI from 'expo-system-ui';
import { SplashScreen } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuthContext } from '../providers/AuthProvider';
import { BioProfileProvider } from '../providers/BioProfileProvider';
import { CryptoProvider } from '../providers/CryptoProvider';
import { ThemeProvider } from '../theme';

void SplashScreen.preventAutoHideAsync().catch(() => {});
void SystemUI.setBackgroundColorAsync('#000000').catch(() => {});

function AppNavigator() {
  const { state } = useAuthContext();

  React.useEffect(() => {
    if (state.status !== 'loading') {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [state.status]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#000000' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(legal)" />
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
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
        <AuthProvider>
          <BioProfileProvider>
            <CryptoProvider>
              <AppNavigator />
            </CryptoProvider>
          </BioProfileProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
