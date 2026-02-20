import React from 'react';
import { Alert } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { CustomTabBar } from '../../components/navigation/CustomTabBar';
import { getLastViewed, setPendingRestore } from '../../core/binder/LastViewedStore';
import { ToastProvider, useToast } from '../../components/Toast';

import { useAuthContext } from '../../providers/AuthProvider';

export default function TabLayout() {
  return (
    <ToastProvider>
      <TabLayoutInner />
    </ToastProvider>
  );
}

function TabLayoutInner() {
  // Pull profile info from your auth context
  // Adjust these to match your actual AuthProvider shape
  const router = useRouter();
  const pathname = usePathname();
  const { state } = useAuthContext();
  const { showToast } = useToast();

  const profileImageUrl = state.metadata?.picture ?? state.googleProfile?.picture ?? null;
  const profileName = state.metadata?.name ?? state.googleProfile?.name;
  const profileInitials = profileName
    ? profileName
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

  const handleCreateAction = async (action: 'note' | 'audio' | 'photo') => {
    if (!binderContext) {
      showToast('Open a binder first');
      return;
    }

    switch (action) {
      case 'note':
        router.push({
          pathname: `/binder/${binderContext.binderId}/entry/new`,
          params: { dirPath: binderContext.dirPath, categoryType: 'note' },
        });
        break;
      case 'audio': {
        const { Audio } = await import('expo-av');
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) {
          Alert.alert('Microphone Access', 'Microphone permission is required to record audio.');
          return;
        }
        router.push({
          pathname: `/binder/${binderContext.binderId}/quick-capture`,
          params: { mode: 'audio', dirPath: binderContext.dirPath },
        });
        break;
      }
      case 'photo':
        router.push({
          pathname: `/binder/${binderContext.binderId}/quick-capture`,
          params: { mode: 'photo', dirPath: binderContext.dirPath },
        });
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