// app/binder/[binderId]/index.tsx
// Binder detail screen: patient info card + category grid / timeline toggle.

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { IconShare3 } from '@tabler/icons-react-native';
import { useBinderDetail } from '../../../../../hooks/useBinderDetail';
import { PatientInfoCard } from '../../../../../components/binder/PatientInfoCard';
import { CategoryGrid } from '../../../../../components/binder/CategoryGrid';
import { QRDisplay } from '../../../../../components/QRDisplay';
import { useShareSession } from '../../../../../hooks/useShareSession';
import type { Category } from '../../../../../core/binder/categories';
import { useAuthContext } from '../../../../../providers/AuthProvider';
import { useCryptoContext } from '../../../../../providers/CryptoProvider';

export default function BinderDetailScreen() {
  const { binderId } = useLocalSearchParams<{ binderId: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'categories' | 'timeline'>(
    'categories',
  );

  const { state: authState } = useAuthContext();
  const { masterConversationKey } = useCryptoContext();
  const jwt = authState.status === 'authenticated' ? authState.jwt : null;

  const binderInfo = useMemo(() => {
    if (!jwt || !binderId) return null;
    return {
      repoId: binderId,
      repoDir: `binders/${binderId}`,
      auth: { type: 'jwt' as const, token: jwt },
    };
  }, [binderId, jwt]);

  const { binderService, patientInfo, loading, error } = useBinderDetail(
    binderInfo,
    masterConversationKey,
  );

  const binderRepoDir = `binders/${binderId}`;
  const { state: shareState, startShare, cancel: cancelShare } = useShareSession(
    binderRepoDir,
    masterConversationKey,
    jwt,
  );

  const handleCategoryPress = (category: Category) => {
    router.push(`/binder/${binderId}/browse/${category.folder}`);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Full-screen QR display when sharing
  if (shareState.phase === 'showing-qr' && shareState.qrPayload) {
    return (
      <>
        <Stack.Screen options={{ title: 'Share with Doctor' }} />
        <QRDisplay payload={shareState.qrPayload} onCancel={cancelShare} />
      </>
    );
  }

  const isSharing = shareState.phase !== 'idle' && shareState.phase !== 'error';

  return (
    <>
      <Stack.Screen
        options={{
          title: 'My Binder',
          headerRight: () => (
            <TouchableOpacity
              onPress={startShare}
              style={styles.headerButton}
              disabled={isSharing}
            >
              {isSharing ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <IconShare3 size={22} color="#007AFF" strokeWidth={2} />
              )}
            </TouchableOpacity>
          ),
        }}
      />

      {/* Share progress overlay */}
      {shareState.phase === 're-encrypting' && shareState.progress && (
        <View style={styles.shareProgress}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.shareProgressText}>
            Encrypting {shareState.progress.filesProcessed}/{shareState.progress.totalFiles} files...
          </Text>
        </View>
      )}
      {shareState.phase === 'pushing-staging' && (
        <View style={styles.shareProgress}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.shareProgressText}>Uploading...</Text>
        </View>
      )}
      {shareState.phase === 'creating-session' && (
        <View style={styles.shareProgress}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.shareProgressText}>Creating session...</Text>
        </View>
      )}
      {shareState.phase === 'error' && (
        <View style={styles.shareError}>
          <Text style={styles.shareErrorText}>{shareState.error}</Text>
          <TouchableOpacity onPress={startShare}>
            <Text style={styles.shareRetryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {/* Patient info */}
        {patientInfo ? (
          <PatientInfoCard doc={patientInfo} />
        ) : (
          <View style={styles.patientPlaceholder}>
            <Text style={styles.placeholderText}>
              {error ?? 'Loading patient info...'}
            </Text>
          </View>
        )}

        {/* Tab toggle */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'categories' && styles.activeTab]}
            onPress={() => setActiveTab('categories')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'categories' && styles.activeTabText,
              ]}
            >
              Categories
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'timeline' && styles.activeTab]}
            onPress={() => setActiveTab('timeline')}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === 'timeline' && styles.activeTabText,
              ]}
            >
              Timeline
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {activeTab === 'categories' ? (
          <CategoryGrid onSelectCategory={handleCategoryPress} />
        ) : (
          <View style={styles.timelinePlaceholder}>
            <Text style={styles.placeholderText}>
              Timeline view -- coming soon
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  content: {
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  shareProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#EBF5FF',
  },
  shareProgressText: {
    fontSize: 13,
    color: '#007AFF',
  },
  shareError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF0F0',
  },
  shareErrorText: {
    fontSize: 13,
    color: '#c00',
    flex: 1,
  },
  shareRetryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    paddingLeft: 12,
  },
  patientPlaceholder: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
  },
  placeholderText: {
    fontSize: 14,
    color: '#999',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
  },
  activeTabText: {
    color: '#1a1a1a',
  },
  timelinePlaceholder: {
    padding: 40,
    alignItems: 'center',
  },
});
