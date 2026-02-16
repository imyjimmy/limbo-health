// components/binder/PatientInfoCard.tsx
// Summary card showing patient demographics from patient-info.json.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { MedicalDocument } from '../../types/document';
import { extractTitle } from '../../core/binder/DocumentModel';

interface PatientInfoCardProps {
  doc: MedicalDocument;
}

export function PatientInfoCard({ doc }: PatientInfoCardProps) {
  const name = extractTitle(doc);
  const dob = doc.metadata.tags?.find((t) => t.startsWith('dob:'))?.slice(4);
  const updated = doc.metadata.updated ?? doc.metadata.created;
  const updatedStr = formatRelative(updated);

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{name}</Text>
      {dob ? <Text style={styles.detail}>DOB: {dob}</Text> : null}
      <Text style={styles.updated}>Last updated {updatedStr}</Text>
    </View>
  );
}

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
  },
  name: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  detail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  updated: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 4,
  },
});
