import React, { useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { SvgUri } from 'react-native-svg';
import {
  TEXAS_HOSPITAL_LOGOS,
  type TexasHospitalLogo,
} from '../../constants/texasHospitalLogos';
import { createThemedStyles, useThemedStyles } from '../../theme';

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

function normalizeLookupName(value: string): string {
  return String(value || '')
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .toLowerCase()
    .trim();
}

function normalizeDomain(value?: string | null): string | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');

  return normalized || null;
}

const LOGOS_BY_NORMALIZED_NAME = new Map<string, TexasHospitalLogo>();
const LOGOS_BY_NORMALIZED_DOMAIN = new Map<string, TexasHospitalLogo>();

for (const logo of TEXAS_HOSPITAL_LOGOS) {
  const normalizedName = normalizeLookupName(logo.systemName);
  if (normalizedName && !LOGOS_BY_NORMALIZED_NAME.has(normalizedName)) {
    LOGOS_BY_NORMALIZED_NAME.set(normalizedName, logo);
  }

  const normalizedDomain = normalizeDomain(logo.domain);
  if (normalizedDomain && !LOGOS_BY_NORMALIZED_DOMAIN.has(normalizedDomain)) {
    LOGOS_BY_NORMALIZED_DOMAIN.set(normalizedDomain, logo);
  }
}

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

export function findHospitalSystemLogo(
  systemName: string,
  systemDomain?: string | null,
): TexasHospitalLogo | null {
  const normalizedName = normalizeLookupName(systemName);
  if (normalizedName && LOGOS_BY_NORMALIZED_NAME.has(normalizedName)) {
    return LOGOS_BY_NORMALIZED_NAME.get(normalizedName) || null;
  }

  const normalizedDomain = normalizeDomain(systemDomain);
  if (normalizedDomain && LOGOS_BY_NORMALIZED_DOMAIN.has(normalizedDomain)) {
    return LOGOS_BY_NORMALIZED_DOMAIN.get(normalizedDomain) || null;
  }

  return null;
}

export function hasHospitalSystemLogo(
  systemName: string,
  systemDomain?: string | null,
): boolean {
  return Boolean(findHospitalSystemLogo(systemName, systemDomain));
}

interface HospitalSystemLogoProps {
  systemName: string;
  systemDomain?: string | null;
  width?: number;
  height?: number;
}

export function HospitalSystemLogo({
  systemName,
  systemDomain,
  width = 120,
  height = 56,
}: HospitalSystemLogoProps) {
  const [failed, setFailed] = useState(false);
  const logo = useMemo(
    () => findHospitalSystemLogo(systemName, systemDomain),
    [systemDomain, systemName],
  );
  const styles = useThemedStyles(createStyles);

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

const createStyles = createThemedStyles((theme) => ({
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
    backgroundColor: theme.colors.surfaceSubtle,
  },
  fallbackText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
}));
