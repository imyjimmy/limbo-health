import React from 'react';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { CustomTabBar } from '../../components/navigation/CustomTabBar';
import { getLastViewed, setPendingRestore } from '../../core/binder/LastViewedStore';

import { useAuthContext } from '../../providers/AuthProvider';

export default function TabLayout() {
  // Pull profile info from your auth context
  // Adjust these to match your actual AuthProvider shape
  const router = useRouter();
  const pathname = usePathname();
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

  // Extract binderId and dirPath from the current route so [+] is context-free.
  // Matches: /binder/{id}/browse/{...path}  or  /binder/{id}
  const binderContext = (() => {
    const browseMatch = pathname.match(/\/binder\/([^/]+)\/browse\/(.+)/);
    if (browseMatch) return { binderId: browseMatch[1], dirPath: browseMatch[2] };
    const binderMatch = pathname.match(/\/binder\/([^/]+)/);
    if (binderMatch) return { binderId: binderMatch[1], dirPath: '' };
    return null;
  })();

  const handleDocumentPress = () => {
    const last = getLastViewed();
    if (!last) {
      router.navigate('/(tabs)/(home)');
      return;
    }
    const { binderId, dirPath } = last;

    // Already viewing the target directory? Do nothing.
    const targetPath = dirPath
      ? `/binder/${binderId}/browse/${dirPath}`
      : `/binder/${binderId}`;
    if (pathname === targetPath) return;

    if (dirPath) {
      setPendingRestore(dirPath);
    }
    // Pop the (home) stack to root first (clears any stale binder),
    // then push a fresh binder instance
    router.navigate('/(tabs)/(home)');
    setTimeout(() => {
      router.push(`/binder/${binderId}`);
    }, 0);
  };

  const handleCreateAction = (action: 'note' | 'audio' | 'photo') => {
    if (!binderContext) return; // not inside a binder, nothing to do

    switch (action) {
      case 'note':
        router.push({
          pathname: `/binder/${binderContext.binderId}/entry/new`,
          params: { dirPath: binderContext.dirPath },
        });
        break;
      case 'audio':
        router.push(`/binder/${binderContext.binderId}/quick-capture?mode=audio`);
        break;
      case 'photo':
        router.push(`/binder/${binderContext.binderId}/quick-capture?mode=photo`);
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
          onDocumentPress={handleDocumentPress}
        />
      )}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="(home)" options={{ title: 'Home' }} />
      <Tabs.Screen name="page" options={{ title: 'Page' }} />
      <Tabs.Screen name="create" options={{ title: 'Create' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}