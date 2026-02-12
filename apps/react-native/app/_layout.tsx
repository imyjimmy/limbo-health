// app/_layout.tsx
// Root layout. Polyfills MUST be the first import.

import '../polyfills/setup';

import React from 'react';
import { Slot } from 'expo-router';
import { AuthProvider } from '../providers/AuthProvider';
import { CryptoProvider } from '../providers/CryptoProvider';

export default function RootLayout() {
  return (
    <AuthProvider>
      <CryptoProvider>
        <Slot />
      </CryptoProvider>
    </AuthProvider>
  );
}