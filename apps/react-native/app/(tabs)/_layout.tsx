import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { Redirect, Tabs, useRouter, usePathname } from 'expo-router';
import { CustomTabBar } from '../../components/navigation/CustomTabBar';
import { ToastProvider, useToast } from '../../components/Toast';

import { useAuthContext } from '../../providers/AuthProvider';
import { useCryptoContext } from '../../providers/CryptoProvider';
import { InlineRecorderBar } from '../../components/audio/InlineRecorderBar';
import type { AudioRecordingResult } from '../../hooks/useAudioRecorder';
import { BinderService } from '../../core/binder/BinderService';
import { emitDirectoryChanged } from '../../core/binder/DirectoryEvents';
import { createThemedStyles, useThemedStyles } from '../../theme';

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
  const { state, needsOnboarding } = useAuthContext();
  const { masterConversationKey } = useCryptoContext();
  const { showToast } = useToast();
  const styles = useThemedStyles(createStyles);
  const [activeAudioContext, setActiveAudioContext] = useState<{
    binderId: string;
    dirPath: string;
  } | null>(null);

  if (state.status === 'loading') {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (state.status === 'onboarding') {
    return <Redirect href="/" withAnchor />;
  }

  if (state.status === 'expired' && state.loginMethod === 'google') {
    return <Redirect href="/" withAnchor />;
  }

  if (state.status === 'authenticated' && needsOnboarding) {
    return <Redirect href="/bio-setup" withAnchor />;
  }

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

  const contextualCreateAction = useMemo(() => {
    if (!binderContext) return null;
    const normalizeFolderKeyword = (value: string) =>
      decodeURIComponent(value)
        .toLowerCase()
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const normalized = binderContext.dirPath.replace(/^\/+|\/+$/g, '').toLowerCase();
    const segments = normalized.split('/').filter(Boolean);
    const currentFolderKeyword = segments.length > 0
      ? normalizeFolderKeyword(segments[segments.length - 1])
      : '';
    const isBioFolder = currentFolderKeyword === 'bio' || currentFolderKeyword === 'my info';
    const isMedicationFolder =
      normalized === 'medications' ||
      normalized.startsWith('medications/') ||
      normalized.endsWith('/medications');

    if (isBioFolder) {
      return {
        action: 'note' as const,
        label: 'Fill in Bio',
        icon: 'bio' as const,
      };
    }

    if (isMedicationFolder) {
      return {
        action: 'medication' as const,
        label: 'Add Medication',
        icon: 'medication' as const,
      };
    }

    return null;
  }, [binderContext?.dirPath]);

  const handleCreateAction = async (action: 'note' | 'audio' | 'photo' | 'medication') => {
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
        setActiveAudioContext({
          binderId: binderContext.binderId,
          dirPath: binderContext.dirPath,
        });
        break;
      }
      case 'photo':
        router.push({
          pathname: `/binder/${binderContext.binderId}/quick-capture`,
          params: { mode: 'photo', dirPath: binderContext.dirPath },
        });
        break;
      case 'medication':
        router.push({
          pathname: `/binder/${binderContext.binderId}/entry/new`,
          params: { dirPath: binderContext.dirPath, categoryType: 'medication' },
        });
        break;
    }
  };

  const recordingBinderService = useMemo(() => {
    if (!activeAudioContext || !masterConversationKey) return null;
    const jwt = state.status === 'authenticated' ? state.jwt : null;
    if (!jwt) return null;
    return new BinderService(
      {
        repoId: activeAudioContext.binderId,
        repoDir: `binders/${activeAudioContext.binderId}`,
        auth: { type: 'jwt' as const, token: jwt },
        author: {
          name: state.metadata?.name || state.googleProfile?.name || 'Limbo Health',
          email: state.googleProfile?.email || 'app@limbo.health',
        },
      },
      masterConversationKey,
    );
  }, [
    activeAudioContext,
    masterConversationKey,
    state.status,
    state.jwt,
    state.metadata?.name,
    state.googleProfile?.name,
    state.googleProfile?.email,
  ]);

  const handleInlineAudioComplete = async (result: AudioRecordingResult) => {
    if (!activeAudioContext || !recordingBinderService) {
      showToast('Unable to save recording');
      setActiveAudioContext(null);
      return;
    }

    try {
      const targetDir = activeAudioContext.dirPath
        ? activeAudioContext.dirPath
        : await recordingBinderService.ensureFolder('recordings', 'Recordings', '🎙️');

      await recordingBinderService.addAudio(
        targetDir,
        result.binaryData,
        result.sizeBytes,
        result.durationMs,
      );
      emitDirectoryChanged({
        binderId: activeAudioContext.binderId,
        dirPath: targetDir,
      });
      showToast('Recording saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Recording Failed', msg);
    } finally {
      setActiveAudioContext(null);
    }
  };

  const handleInlineAudioCancel = async () => {
    setActiveAudioContext(null);
  };

  return (
    <View style={styles.screen}>
      <Tabs
        tabBar={(props) => (
          <CustomTabBar
            {...props}
            profileImageUrl={profileImageUrl}
            profileInitials={profileInitials}
            hasNotification={false}
            onCreateAction={handleCreateAction}
            contextualCreateAction={contextualCreateAction}
          />
        )}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="home" options={{ title: 'Home' }} />
        <Tabs.Screen name="page" options={{ title: 'Requests' }} />
        <Tabs.Screen name="create" options={{ title: 'Create' }} />
        <Tabs.Screen name="(binders)" options={{ title: 'Digital Binders' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>

      {activeAudioContext && (
        <View style={styles.inlineRecorderWrap}>
          <InlineRecorderBar
            onComplete={handleInlineAudioComplete}
            onCancel={handleInlineAudioCancel}
          />
        </View>
      )}
    </View>
  );
}

const createStyles = createThemedStyles((theme) => ({
  screen: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundSubtle,
  },
  loadingIndicator: {
    color: theme.colors.secondary,
  },
  inlineRecorderWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 74,
  },
}));
