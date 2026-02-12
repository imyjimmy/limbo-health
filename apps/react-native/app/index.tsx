// app/index.tsx
// Entry redirect: routes to auth or tabs based on auth state.

import { Redirect } from 'expo-router';
import { useAuthContext } from '../providers/AuthProvider';
import { ActivityIndicator, View } from 'react-native';

export default function Index() {
  const { state } = useAuthContext();

  if (state.status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (state.status === 'onboarding') {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (state.status === 'expired') {
    // Could show a "reconnecting" screen, but for now just go to tabs
    // and let refreshAuth handle it
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(tabs)" />;
}