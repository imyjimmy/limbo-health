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
import { useBinderDetail } from '../../../../../hooks/useBinderDetail';
import { PatientInfoCard } from '../../../../../components/binder/PatientInfoCard';
import { CategoryGrid } from '../../../../../components/binder/CategoryGrid';
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

  const handleCategoryPress = (category: Category) => {
    router.push(`/binder/${binderId}/browse/${category.folder}`);
  };

  const handleSharePress = () => {
    // TODO: wire to share flow
    console.log('Share pressed for binder:', binderId);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'My Binder',
          headerRight: () => (
            <TouchableOpacity onPress={handleSharePress} style={styles.headerButton}>
              <Text style={styles.shareIcon}>↗</Text>
            </TouchableOpacity>
          ),
        }}
      />

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
  shareIcon: {
    fontSize: 20,
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
