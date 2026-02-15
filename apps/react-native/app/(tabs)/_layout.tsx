import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { CustomTabBar } from '../../components/navigation/CustomTabBar';

import { useAuthContext } from '../../providers/AuthProvider';

export default function TabLayout() {
  // Pull profile info from your auth context
  // Adjust these to match your actual AuthProvider shape
  const router = useRouter();
  const { state } = useAuthContext();

  const profileImageUrl = state.metadata?.picture ?? null;
  const profileInitials = state.metadata?.name
    ? state.metadata.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'ME';

  const handleCreateAction = (action: 'note' | 'audio' | 'photo') => {
  // Route to the appropriate capture flow
  // Adjust these paths to match your binder routes
  switch (action) {
    case 'note':
      router.push('/binder/active/entry/new?type=note');
      break;
    case 'audio':
      router.push('/binder/active/quick-capture?mode=audio');
      break;
    case 'photo':
      router.push('/binder/active/quick-capture?mode=photo');
      break;
    }
  };

  return (
    <Tabs
      tabBar={(props) => (
        <CustomTabBar
          {...props}
          profileImageUrl={profileImageUrl}
          profileInitials={profileInitials}
          hasNotification={false}
          onCreateAction={handleCreateAction}
        />
      )}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="page" options={{ title: 'Page' }} />
      <Tabs.Screen name="create" options={{ title: 'Create' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}