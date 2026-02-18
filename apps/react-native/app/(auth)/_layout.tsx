// app/(auth)/_layout.tsx
// Auth flow stack layout. No tab bar, no back gestures to tabs.

import { Stack } from 'expo-router/stack';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}