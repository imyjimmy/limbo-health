// app/(tabs)/index.tsx
// Week 1 milestone: fetch repos, clone, decrypt, display.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import RNFS from 'react-native-fs';
import { useAuthContext } from '../../providers/AuthProvider';
import { useCryptoContext } from '../../providers/CryptoProvider';
import { GitEngine } from '../../core/git/GitEngine';
import { API_BASE_URL } from '../../constants/api';
import type { MedicalDocument } from '../../types/document';
import { useCamera } from '../../hooks/useCamera';
import { generateDocPath, sidecarPathFrom, conditionFolder } from '../../core/binder/FileNaming';

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
  const { ready: cryptoReady, createEncryptedIO } = useCryptoContext();
  const { capture } = useCamera();

  const [screenState, setScreenState] = useState<ScreenState>({
    phase: 'loading-repos',
  });

  const jwt = authState.status === 'authenticated' ? authState.jwt : null;

  // --- Fetch repo list on mount ---

  const fetchRepos = useCallback(async () => {
    if (!jwt) return;

    setScreenState({ phase: 'loading-repos' });

    try {
      const res = await fetch(`${API_BASE_URL}/api/mgit/user/repositories`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data = await res.json();

      // Normalize response — may be an array or { repositories: [...] }
      const repoList: RepoSummary[] = Array.isArray(data)
        ? data.map((r: any) => ({ id: r.id ?? r.repoId ?? r.name, name: r.name ?? r.id }))
        : (data.repositories ?? []).map((r: any) => ({
            id: r.id ?? r.repoId ?? r.name,
            name: r.name ?? r.id,
          }));

      setScreenState({ phase: 'repos-loaded', repos: repoList });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setScreenState({ phase: 'error', message: `Failed to load repos: ${msg}` });
    }
  }, [jwt]);

  useEffect(() => {
    if (jwt && cryptoReady) {
      fetchRepos();
    }
  }, [jwt, cryptoReady, fetchRepos]);

  // --- Clone + decrypt a repo ---

  const openBinder = useCallback(
    async (repo: RepoSummary) => {
      if (!jwt || !cryptoReady) return;

      const dir = repoDir(repo.id);

      try {
        // Clone if needed
        const cloned = await isAlreadyCloned(repo.id);
        if (!cloned) {
          setScreenState({ phase: 'cloning', repoId: repo.id });
          await GitEngine.cloneRepo(dir, repo.id, { type: 'jwt', token: jwt });
        }

        // List files and decrypt .json documents
        setScreenState({ phase: 'decrypting', repoId: repo.id });

        const allFiles = await GitEngine.listFiles(dir);
        const jsonFiles = allFiles.filter(
          (f) => f.endsWith('.json') && !f.startsWith('.'),
        );

        const io = createEncryptedIO(dir);
        const entries: DecryptedEntry[] = [];

        for (const filePath of jsonFiles) {
          try {
            const doc = await io.readDocument('/' + filePath);
            entries.push({ path: filePath, doc });
          } catch (err) {
            console.warn(`Failed to decrypt ${filePath}:`, err);
            // Skip unreadable files rather than crashing
          }
        }

        setScreenState({ phase: 'displaying', repoId: repo.id, entries });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        Alert.alert('Error', msg);
        // Fall back to repo list
        fetchRepos();
      }
    },
    [jwt, cryptoReady, createEncryptedIO, fetchRepos],
  );

  // --- Back to repo list ---

  const goBack = useCallback(() => {
    fetchRepos();
  }, [fetchRepos]);

  // --- Capture photo and add to current binder ---
  const addPhoto = useCallback(
    async (repoId: string) => {
      if (!jwt || !cryptoReady) return;

      try {
        const result = await capture();
        if (!result) return; // user cancelled

        const dir = repoDir(repoId);
        const condition = conditionFolder('back-acne');

        // Generate collision-safe paths
        const docPath = await generateDocPath(dir, condition, 'photo');
        const encPath = sidecarPathFrom(docPath);

        const io = createEncryptedIO(dir);

        // Write encrypted sidecar (.enc) — the actual JPEG bytes
        await io.writeSidecar('/' + encPath, result.binaryData);

        // Write metadata document (.json) — points to the sidecar
        const doc: MedicalDocument = {
          value: encPath.split('/').pop()!, // just the filename: '2026-02-13-photo.enc'
          metadata: {
            type: 'attachment_ref',
            created: new Date().toISOString(),
            format: 'jpeg',
            encoding: 'base64',
            originalSizeBytes: result.sizeBytes,
            condition: 'back-acne',
          },
          children: [],
        };
        await io.writeDocument('/' + docPath, doc);

        // Commit both files and push
        await GitEngine.commitEntry(dir, [docPath, encPath], 'Add photo');
        await GitEngine.push(dir, repoId, { type: 'jwt', token: jwt });

        // Refresh the entry list
        await openBinder({ id: repoId, name: repoId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        Alert.alert('Photo Failed', msg);
      }
    },
    [jwt, cryptoReady, capture, createEncryptedIO, openBinder],
  );

  // --- Create a new binder ---

  const createBinder = useCallback(async () => {
    if (!jwt || !cryptoReady) return;

    const binderId = `binder-${Date.now()}`;
    const dir = repoDir(binderId);

    try {
      setScreenState({ phase: 'cloning', repoId: binderId });

      // Init local git repo
      await GitEngine.initBinder(dir);

      // Write encrypted patient-info.json
      const io = createEncryptedIO(dir);
      const patientInfo: MedicalDocument = {
        value: '# My Medical Binder\n\nCreated on ' + new Date().toISOString(),
        metadata: {
          type: 'patient-info',
          created: new Date().toISOString(),
        },
        children: [],
      };
      await io.writeDocument('/patient-info.json', patientInfo);

      // Commit and push
      await GitEngine.commitEntry(dir, ['patient-info.json'], 'Initialize binder');
      await GitEngine.push(dir, binderId, { type: 'jwt', token: jwt });

      // Refresh list
      await fetchRepos();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Create Failed', msg);
      fetchRepos();
    }
  }, [jwt, cryptoReady, createEncryptedIO, fetchRepos]);

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
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={styles.title}>Medical Binders</Text>

          {screenState.repos.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                No binders yet.
              </Text>
              <Pressable style={styles.createButton} onPress={createBinder}>
                <Text style={styles.createButtonText}>Create Medical Binder</Text>
              </Pressable>
            </View>
          ) : (
            screenState.repos.map((repo) => (
              <Pressable
                key={repo.id}
                style={styles.repoCard}
                onPress={() => openBinder(repo)}
              >
                <Text style={styles.repoName}>{repo.name}</Text>
                <Text style={styles.repoId}>{repo.id}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      );

    case 'cloning':
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#111" />
          <Text style={styles.loadingText}>
            Cloning {screenState.repoId}...
          </Text>
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
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
        >
          <Pressable onPress={goBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Binders</Text>
          </Pressable>

          <Text style={styles.title}>{screenState.repoId}</Text>
          <Text style={styles.subtitle}>
            {screenState.entries.length} record
            {screenState.entries.length !== 1 ? 's' : ''}
          </Text>

          <Pressable
            style={styles.addPhotoButton}
            onPress={() => addPhoto(screenState.repoId)}
          >
            <Text style={styles.addPhotoButtonText}>Take Photo</Text>
          </Pressable>

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
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  addPhotoButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  centered: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  createButton: {
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 20,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 32,
    textAlign: 'center',
  },
    entryCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  entryDate: {
    fontSize: 13,
    color: '#999',
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  entryPath: {
    fontSize: 12,
    fontFamily: 'Courier',
    color: '#bbb',
    marginBottom: 8,
  },
  entryType: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    textTransform: 'uppercase',
  },
  entryValue: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  errorText: {
    fontSize: 15,
    color: '#c00',
    textAlign: 'center',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 15,
    color: '#666',
    marginTop: 12,
  },
  retryButton: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  repoCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  repoName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
    marginBottom: 4,
  },
  repoId: {
    fontSize: 13,
    fontFamily: 'Courier',
    color: '#999',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 48,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
});