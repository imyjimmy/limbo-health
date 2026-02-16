// app/binder/[binderId]/_layout.tsx
// Layout for binder detail screens. Provides a Stack navigator with headers.

import React from 'react';
import { Stack } from 'expo-router';

export default function BinderLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Back',
      }}
    />
  );
}
