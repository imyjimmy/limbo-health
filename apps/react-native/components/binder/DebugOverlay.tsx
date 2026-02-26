// components/binder/DebugOverlay.tsx
// Dev-only debug FAB + modal. Shows arbitrary JSON data.
// Reusable across directory views and entry views.

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  StyleSheet,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

interface DebugOverlayProps {
  /** Data to display as formatted JSON */
  data: unknown;
  /** Optional extra data loaded lazily (e.g., full file tree) */
  loadExtra?: () => Promise<unknown>;
  extraLabel?: string;
  /** Clarifies whether data is generated runtime state or repo-backed content */
  sourceInfo?: {
    kind: 'generated' | 'repo-file' | 'mixed';
    summary: string;
    details?: string;
  };
}

export function DebugOverlay({ data, loadExtra, extraLabel, sourceInfo }: DebugOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [extra, setExtra] = useState<unknown>(null);
  const [loadingExtra, setLoadingExtra] = useState(false);

  if (!__DEV__) return null;

  const handleOpen = () => {
    setVisible(true);
    setExtra(null);
  };

  const handleLoadExtra = async () => {
    if (!loadExtra) return;
    setLoadingExtra(true);
    try {
      const result = await loadExtra();
      setExtra(result);
    } catch (err) {
      setExtra({ error: String(err) });
    } finally {
      setLoadingExtra(false);
    }
  };

  const allData = extra ? { current: data, [extraLabel ?? 'extra']: extra } : data;
  const json = JSON.stringify(allData, null, 2);
  const sourceLabel = sourceInfo
    ? sourceInfo.kind === 'generated'
      ? 'Generated Runtime Data'
      : sourceInfo.kind === 'repo-file'
        ? 'Repo File Data'
        : 'Mixed Data Sources'
    : null;

  return (
    <>
      <TouchableOpacity style={styles.fab} onPress={handleOpen}>
        <Text style={styles.fabText}>{'>_'}</Text>
      </TouchableOpacity>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Debug</Text>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              {loadExtra && !extra && (
                <TouchableOpacity onPress={handleLoadExtra} disabled={loadingExtra}>
                  <Text style={styles.action}>
                    {loadingExtra ? 'Loading...' : extraLabel ?? 'Load Extra'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => Clipboard.setStringAsync(json)}>
                <Text style={styles.action}>Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Text style={styles.action}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
          {sourceInfo && sourceLabel && (
            <View style={styles.sourceBanner}>
              <Text style={styles.sourceLabel}>{sourceLabel}</Text>
              <Text style={styles.sourceSummary}>{sourceInfo.summary}</Text>
              {sourceInfo.details ? (
                <Text style={styles.sourceDetails}>{sourceInfo.details}</Text>
              ) : null}
            </View>
          )}
          <ScrollView style={styles.scroll}>
            <Text style={styles.json} selectable>
              {json}
            </Text>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4ade80',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modal: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4ade80',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  action: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  scroll: {
    flex: 1,
    padding: 16,
  },
  sourceBanner: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2f2f2f',
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 4,
  },
  sourceLabel: {
    color: '#f5c96a',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  sourceSummary: {
    color: '#f1f1f1',
    fontSize: 12,
    lineHeight: 18,
  },
  sourceDetails: {
    color: '#bfbfbf',
    fontSize: 11,
    lineHeight: 16,
  },
  json: {
    fontSize: 12,
    lineHeight: 18,
    color: '#e5e5e5',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
