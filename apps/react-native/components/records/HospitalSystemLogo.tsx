import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SvgUri } from 'react-native-svg';
import {
  TEXAS_HOSPITAL_LOGOS,
  type TexasHospitalLogo,
} from '../../constants/texasHospitalLogos';

const MONOGRAM_STOP_WORDS = new Set([
  'and',
  'of',
  'the',
  'health',
  'healthcare',
  'system',
  'division',
  'international',
]);

function getSystemMonogram(systemName: string): string {
  const parts = systemName
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !MONOGRAM_STOP_WORDS.has(part.toLowerCase()));

  if (parts.length === 0) return 'H';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function findLogo(systemName: string): TexasHospitalLogo | null {
  const normalized = systemName.trim().toLowerCase();
  return TEXAS_HOSPITAL_LOGOS.find(
    (logo) => logo.systemName.trim().toLowerCase() === normalized,
  ) || null;
}

interface HospitalSystemLogoProps {
  systemName: string;
  width?: number;
  height?: number;
}

export function HospitalSystemLogo({
  systemName,
  width = 120,
  height = 56,
}: HospitalSystemLogoProps) {
  const [failed, setFailed] = useState(false);
  const logo = useMemo(() => findLogo(systemName), [systemName]);

  if (!logo || failed) {
    return (
      <View style={[styles.fallbackWrap, { width, height }]}>
        <Text style={styles.fallbackText}>{getSystemMonogram(systemName)}</Text>
      </View>
    );
  }

  if (logo.format === 'svg') {
    const assetSource = Image.resolveAssetSource(logo.asset);
    if (!assetSource?.uri) {
      return (
        <View style={[styles.fallbackWrap, { width, height }]}>
          <Text style={styles.fallbackText}>{getSystemMonogram(systemName)}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.wrap, { width, height }]}>
        <SvgUri
          uri={assetSource.uri}
          width="100%"
          height="100%"
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { width, height }]}>
      <Image
        source={logo.asset}
        resizeMode="contain"
        style={styles.bitmap}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bitmap: {
    width: '100%',
    height: '100%',
  },
  fallbackWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
  },
  fallbackText: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '700',
  },
});
