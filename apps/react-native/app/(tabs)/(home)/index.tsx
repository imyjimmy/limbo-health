// app/(tabs)/index.tsx
// Binder list → open → clone → decrypt → display.
// Refactored to use BinderService for all CRUD.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import RNFS from 'react-native-fs';
import { useAuthContext } from '../../../providers/AuthProvider';
import { useCryptoContext } from '../../../providers/CryptoProvider';
import { BinderService } from '../../../core/binder/BinderService';
import { API_BASE_URL } from '../../../constants/api';
import { useCamera } from '../../../hooks/useCamera';
import type { MedicalDocument } from '../../../types/document';
import { useShareSession } from '../../../hooks/useShareSession';
import { QRDisplay } from '../../../components/QRDisplay';

// --- Types ---

interface RepoSummary {
  id: string;
  name: string;
}

type ScreenState =
  | { phase: 'loading-repos' }
  | { phase: 'repos-loaded'; repos: RepoSummary[] }
  | { phase: 'cloning'; repoId: string }
  | { phase: 'decrypting'; repoId: string }
  | { phase: 'displaying'; repoId: string; entries: DecryptedEntry[] }
  | { phase: 'error'; message: string };

interface DecryptedEntry {
  path: string;
  doc: MedicalDocument;
}

// --- Helpers ---

const BINDERS_ROOT = `${RNFS.DocumentDirectoryPath}/binders`;

function repoDir(repoId: string): string {
  return `binders/${repoId}`;
}

async function isAlreadyCloned(repoId: string): Promise<boolean> {
  const gitDir = `${BINDERS_ROOT}/${repoId}/.git`;
  return RNFS.exists(gitDir);
}

// --- Screen ---

export default function BinderListScreen() {
  const { state: authState } = useAuthContext();
  const { ready: cryptoReady, masterConversationKey } = useCryptoContext();
  const { capture } = useCamera();
  const router = useRouter();

  const [screenState, setScreenState] = useState<ScreenState>({
    phase: 'loading-repos',
  });

  const binderRef = useRef<BinderService | null>(null);

  const jwt = authState.status === 'authenticated' ? authState.jwt : null;

  // --- Share session (active only when viewing a binder) ---

  const activeRepoId =
    screenState.phase === 'displaying' ? screenState.repoId : '';
  const activeRepoDir = activeRepoId ? repoDir(activeRepoId) : '';

  const { state: shareState, startShare, cancel: cancelShare } =
    useShareSession(activeRepoDir, masterConversationKey, jwt);

  // --- Build auth config ---

  function authConfig() {
    if (!jwt) throw new Error('Not authenticated');
    return { type: 'jwt' as const, token: jwt };
  }

  // --- Fetch repo list ---

  const fetchRepos = useCallback(async () => {
    if (!jwt) return;

    setScreenState({ phase: 'loading-repos' });

    try {
      const res = await fetch(`${API_BASE_URL}/api/mgit/user/repositories`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const data = await res.json();

      // Normalize response — may be an array or { repositories: [...] }
      const repoList: RepoSummary[] = (Array.isArray(data)
        ? data.map((r: any) => ({ id: r.id ?? r.repoId ?? r.name, name: r.name ?? r.id }))
        : (data.repositories ?? []).map((r: any) => ({
            id: r.id ?? r.repoId ?? r.name,
            name: r.name ?? r.id,
          }))
      ).filter((r: RepoSummary) => !r.id.startsWith('scan-'));

      setScreenState({ phase: 'repos-loaded', repos: repoList });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setScreenState({ phase: 'error', message: `Failed to load repos: ${msg}` });
    }
  }, [jwt]);

  useEffect(() => {
    if (jwt && cryptoReady) fetchRepos();
  }, [jwt, cryptoReady, fetchRepos]);

  // --- Open binder: clone if needed, list entries, decrypt ---

  const openBinder = useCallback(
    async (repo: RepoSummary) => {
      if (!jwt || !masterConversationKey) return;

      try {
        const cloned = await isAlreadyCloned(repo.id);
        if (!cloned) {
          setScreenState({ phase: 'cloning', repoId: repo.id });
          const { GitEngine } = await import('../../../core/git/GitEngine');
          await GitEngine.cloneRepo(repoDir(repo.id), repo.id, authConfig());
          setScreenState({ phase: 'repos-loaded', repos: (screenState as any).repos ?? [] });
        }

        router.push(`/binder/${repo.id}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        Alert.alert('Error', msg);
        fetchRepos();
      }
    },
    [jwt, masterConversationKey, fetchRepos, router, screenState],
  );

  // --- Back to repo list ---

  const goBack = useCallback(() => {
    binderRef.current = null;
    fetchRepos();
  }, [fetchRepos]);

  // --- Create binder (hardcoded for Week 1 testing) ---

  const createBinder = useCallback(async () => {
    if (!jwt || !masterConversationKey) return;

    const binderId = `binder-${Date.now()}`;
    const dir = repoDir(binderId);

    try {
      setScreenState({ phase: 'cloning', repoId: binderId });

      await BinderService.create(
        dir,
        binderId,
        authConfig(),
        masterConversationKey,
        'My Medical Binder',
      );

      await fetchRepos();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Create Failed', msg);
      fetchRepos();
    }
  }, [jwt, masterConversationKey, fetchRepos]);

  // --- Take photo and add to binder ---

  const addPhoto = useCallback(
    async (repoId: string) => {
      const service = binderRef.current;
      if (!service) return;

      try {
        const result = await capture();
        if (!result) return;

        await service.addPhoto('back-acne', result.binaryData, result.sizeBytes);

        // Refresh entry list
        await openBinder({ id: repoId, name: repoId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        Alert.alert('Photo Failed', msg);
      }
    },
    [capture, openBinder],
  );

  // --- Render ---

  if (!jwt || !cryptoReady) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111" />
        <Text style={styles.loadingText}>Initializing...</Text>
      </View>
    );
  }

  switch (screenState.phase) {
    case 'loading-repos':
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#111" />
          <Text style={styles.loadingText}>Loading binders...</Text>
        </View>
      );

    case 'error':
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{screenState.message}</Text>
          <Pressable style={styles.retryButton} onPress={fetchRepos}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      );

    case 'repos-loaded':
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerRow}>
            <Text style={styles.screenTitle}>Binders</Text>
          </View>

          {screenState.repos.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No binders yet.</Text>
              <Pressable style={styles.createButton} onPress={createBinder}>
                <Text style={styles.createButtonText}>Create Binder</Text>
              </Pressable>
            </View>
          ) : (
            screenState.repos.map((repo) => (
              <Pressable key={repo.id} style={styles.repoCard} onPress={() => openBinder(repo)}>
                <Text style={styles.repoName}>{repo.name}</Text>
                <Text style={styles.repoId}>{repo.id}</Text>
              </Pressable>
            ))
          )}
          {/* Header row */}
          
        </ScrollView>
      );

    case 'cloning':
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#111" />
          <Text style={styles.loadingText}>Cloning {screenState.repoId}...</Text>
        </View>
      );

    case 'decrypting':
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#111" />
          <Text style={styles.loadingText}>Decrypting records...</Text>
        </View>
      );

    case 'displaying':
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          <Pressable onPress={goBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Binders</Text>
          </Pressable>

          <Text style={styles.title}>{screenState.repoId}</Text>
          <Text style={styles.subtitle}>
            {screenState.entries.length} record{screenState.entries.length !== 1 ? 's' : ''}
          </Text>

          <Pressable
            style={styles.addPhotoButton}
            onPress={() => addPhoto(screenState.repoId)}
          >
            <Text style={styles.addPhotoButtonText}>Take Photo</Text>
          </Pressable>
          <Pressable
            style={styles.shareButton}
            onPress={startShare}
          >
            <Text style={styles.shareButtonText}>Share with Doctor</Text>
          </Pressable>

          {shareState.phase !== 'idle' && shareState.phase !== 'error' && (
            <View style={styles.shareOverlay}>
              {shareState.phase === 'showing-qr' && shareState.qrPayload ? (
                <QRDisplay payload={shareState.qrPayload} onCancel={cancelShare} />
              ) : (
                <View style={styles.centered}>
                  <ActivityIndicator size="large" color="#111" />
                  <Text style={styles.loadingText}>
                    {shareState.phase === 're-encrypting'
                      ? `Re-encrypting${shareState.progress ? ` (${shareState.progress.filesProcessed}/${shareState.progress.totalFiles})` : '...'}`
                      : shareState.phase === 'pushing-staging'
                        ? 'Uploading staging repo...'
                        : 'Creating session...'}
                  </Text>
                </View>
              )}
            </View>
          )}

          {shareState.phase === 'error' && (
            <Text style={styles.errorText}>{shareState.error}</Text>
          )}
          {screenState.entries.map((entry) => (
            <View key={entry.path} style={styles.entryCard}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryType}>
                  {entry.doc.metadata?.type ?? 'unknown'}
                </Text>
                <Text style={styles.entryDate}>
                  {entry.doc.metadata?.created ?? ''}
                </Text>
              </View>
              <Text style={styles.entryPath}>{entry.path}</Text>
              <Text style={styles.entryValue} numberOfLines={6}>
                {entry.doc.value}
              </Text>
            </View>
          ))}
        </ScrollView>
      );
  }
}

// --- Styles ---

const styles = StyleSheet.create({
addPhotoButton: {
    backgroundColor: '#007AFF', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginBottom: 24,
  },
  addPhotoButtonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  backButton: { marginBottom: 16 },
  backButtonText: { fontSize: 16, color: '#007AFF' },
  centered: {
    flex: 1, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  container: { flex: 1, backgroundColor: '#fff' },
  createButton: {
    backgroundColor: '#111', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 32, marginTop: 20,
  },
  createButtonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 48 },
  emptyText: { fontSize: 16, color: '#999', textAlign: 'center' },
  entryCard: {
    backgroundColor: '#f9f9f9', borderRadius: 12,
    padding: 16, marginBottom: 12,
  },
  entryDate: { fontSize: 13, color: '#999' },
  entryHeader: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6,
  },
  entryPath: {
    fontSize: 12, fontFamily: 'Courier', color: '#bbb', marginBottom: 8,
  },
  entryType: {
    fontSize: 13, fontWeight: '600', color: '#555', textTransform: 'uppercase',
  },
  entryValue: { fontSize: 15, color: '#333', lineHeight: 22 },
  errorText: { fontSize: 15, color: '#c00', textAlign: 'center', marginBottom: 16 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 0,
  },
  loadingText: { fontSize: 15, color: '#666', marginTop: 12 },
  repoCard: {
    backgroundColor: '#f5f5f5', borderRadius: 12,
    padding: 16, marginBottom: 12,
  },
  repoId: { fontSize: 13, fontFamily: 'Courier', color: '#999' },
  repoName: { fontSize: 17, fontWeight: '600', color: '#111', marginBottom: 4 },
  retryButton: {
    backgroundColor: '#111', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 32,
  },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
  },
  scrollContent: { paddingHorizontal: 24, paddingTop: 40, paddingBottom: 48 },
  shareButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  shareOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#fff',
    zIndex: 10,
  },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#111', marginBottom: 8 },
});