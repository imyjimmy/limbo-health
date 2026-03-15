// app/index.tsx
// Entry redirect: routes to auth or tabs based on auth state.

import { Redirect } from 'expo-router';
import { useAuthContext } from '../providers/AuthProvider';
import { useBioProfile } from '../providers/BioProfileProvider';
import { ActivityIndicator, View } from 'react-native';

export default function Index() {
  const { state } = useAuthContext();
  const { status: bioStatus, hasProfile } = useBioProfile();

  const shouldCheckBio =
    state.status === 'authenticated' ||
    (state.status === 'expired' && state.loginMethod !== 'google');

  if (state.status === 'loading' || (shouldCheckBio && bioStatus === 'loading')) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (state.status === 'onboarding') {
    return <Redirect href="/(auth)/welcome" withAnchor />;
  }

  if (state.status === 'expired') {
    // Google users need to re-login (no refresh token in v1)
    if (state.loginMethod === 'google') {
      return <Redirect href="/(auth)/welcome" withAnchor />;
    }
    // Nostr users: go to tabs and let refreshAuth handle it
    return <Redirect href="/(tabs)" withAnchor />;
  }

  if (!hasProfile) {
    return <Redirect href="/bio-setup" withAnchor />;
  }

  return <Redirect href="/(tabs)" withAnchor />;
}
