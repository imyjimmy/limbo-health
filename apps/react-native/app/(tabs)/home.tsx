import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  IconMedicalCross,
  IconCirclePlus,
  IconChevronRight,
} from '@tabler/icons-react-native';
import { SvgUri } from 'react-native-svg';
import { createThemedStyles, useTheme, useThemedStyles } from '../../theme';
import {
  TEXAS_HOSPITAL_LOGOS,
  type TexasHospitalLogo,
} from '../../constants/texasHospitalLogos';

const LOGO_TILE_WIDTH = 112;
const LOGO_TILE_HEIGHT = 58;
const LOGO_TILE_GAP = 10;

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

type MarqueeDirection = 'left' | 'right';

interface LogoMarqueeRowProps {
  logos: TexasHospitalLogo[];
  direction: MarqueeDirection;
  durationMs: number;
  renderHospitalLogo: (logo: TexasHospitalLogo) => React.ReactNode;
  startOffsetPx?: number;
  style?: ViewStyle;
}

function LogoMarqueeRow({
  logos,
  direction,
  durationMs,
  renderHospitalLogo,
  startOffsetPx = 0,
  style,
}: LogoMarqueeRowProps) {
  const styles = useThemedStyles(createStyles);
  const translateX = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const loopDistance = useMemo(
    () => logos.length * (LOGO_TILE_WIDTH + LOGO_TILE_GAP),
    [logos.length],
  );
  const normalizedOffset = useMemo(() => {
    if (loopDistance === 0) return 0;
    const mod = startOffsetPx % loopDistance;
    return mod < 0 ? mod + loopDistance : mod;
  }, [loopDistance, startOffsetPx]);
  const repeatedLogos = useMemo(() => [...logos, ...logos], [logos]);

  useEffect(() => {
    if (loopDistance === 0) return;

    loopRef.current?.stop();

    const from =
      direction === 'left' ? -normalizedOffset : -loopDistance + normalizedOffset;
    const to = direction === 'left' ? from - loopDistance : normalizedOffset;

    translateX.setValue(from);
    loopRef.current = Animated.loop(
      Animated.timing(translateX, {
        toValue: to,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    loopRef.current.start();

    return () => {
      loopRef.current?.stop();
    };
  }, [direction, durationMs, loopDistance, normalizedOffset, translateX]);

  return (
    <View style={[styles.marqueeRow, style]}>
      <Animated.View style={[styles.marqueeTrack, { transform: [{ translateX }] }]}>
        {repeatedLogos.map((logo, index) => (
          <View key={`${logo.id}-${index}`} style={styles.logoTile}>
            <View style={styles.logoVisualWrap}>{renderHospitalLogo(logo)}</View>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [failedLogos, setFailedLogos] = useState<Record<string, boolean>>({});
  const logoRows = useMemo(() => {
    const midpoint = Math.ceil(TEXAS_HOSPITAL_LOGOS.length / 2);
    return [
      TEXAS_HOSPITAL_LOGOS.slice(0, midpoint),
      TEXAS_HOSPITAL_LOGOS.slice(midpoint),
    ] as const;
  }, []);

  const markLogoFailed = useCallback((logoId: string) => {
    setFailedLogos((prev) => (prev[logoId] ? prev : { ...prev, [logoId]: true }));
  }, []);

  const renderHospitalLogo = useCallback(
    (logo: TexasHospitalLogo) => {
      if (failedLogos[logo.id]) {
        return (
          <View style={styles.logoFallbackMark}>
            <Text style={styles.logoFallbackText}>{getSystemMonogram(logo.systemName)}</Text>
          </View>
        );
      }

      if (logo.format === 'svg') {
        const assetSource = Image.resolveAssetSource(logo.asset);
        if (!assetSource?.uri) {
          return (
            <View style={styles.logoFallbackMark}>
              <Text style={styles.logoFallbackText}>{getSystemMonogram(logo.systemName)}</Text>
            </View>
          );
        }

        return (
          <SvgUri
            uri={assetSource.uri}
            width="100%"
            height="100%"
            onError={() => markLogoFailed(logo.id)}
          />
        );
      }

      return (
        <Image
          source={logo.asset}
          style={styles.logoImage}
          resizeMode="contain"
          onError={() => markLogoFailed(logo.id)}
        />
      );
    },
    [failedLogos, markLogoFailed],
  );

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.screenTitle}>Home</Text>
        </View>

        <View style={styles.contentArea}>
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <View style={styles.infoIconWrap}>
                <IconMedicalCross size={20} color={theme.colors.danger} strokeWidth={2} />
              </View>
              <View style={styles.infoHeadingWrap}>
                <Text style={styles.infoTitle}>Request Your Records</Text>
                <Text style={styles.infoSubtitle}>Guided request packets</Text>
              </View>
            </View>

            <Text style={styles.infoBody}>
              Search supported hospital systems, reuse your saved request details, and generate a
              ready-to-send PDF without starting from scratch.
            </Text>

            <View style={styles.infoPillRow}>
              <View style={styles.infoPill}>
                <Text style={styles.infoPillText}>Supported systems</Text>
              </View>
              <View style={styles.infoPill}>
                <Text style={styles.infoPillText}>Official form links</Text>
              </View>
              <View style={styles.infoPill}>
                <Text style={styles.infoPillText}>Reusable profile</Text>
              </View>
            </View>
          </View>

          <View style={styles.hospitalLogoPanel}>
            <View style={styles.logoPanelHeader}>
              <Text style={styles.logoPanelTitle}>Featured systems</Text>
              <Text style={styles.logoPanelCaption}>
                Examples from current verified request coverage.
              </Text>
            </View>
            <LogoMarqueeRow
              logos={logoRows[0]}
              direction="left"
              durationMs={84000}
              renderHospitalLogo={renderHospitalLogo}
              startOffsetPx={24}
              style={styles.marqueeRowTop}
            />
            <LogoMarqueeRow
              logos={logoRows[1]}
              direction="right"
              durationMs={92000}
              renderHospitalLogo={renderHospitalLogo}
              startOffsetPx={LOGO_TILE_WIDTH * 0.65}
            />
          </View>

          <Pressable
            onPress={() => router.push('/records-request')}
            style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
          >
            <IconCirclePlus size={22} color={theme.colors.primaryForeground} strokeWidth={2} />
            <Text style={styles.ctaText}>Start Records Request</Text>
            <IconChevronRight size={20} color={theme.colors.primaryForeground} strokeWidth={2} />
          </Pressable>

          <Text style={styles.supportNote}>
            Coverage expands as more hospital workflows are verified. Binder tools stay available
            once records arrive.
          </Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = createThemedStyles((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 48,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 12,
  },
  screenTitle: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  contentArea: {
    flex: 1,
  },
  hospitalLogoPanel: {
    flex: 1,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.logoPanelBorder,
    backgroundColor: theme.colors.logoPanelBackground,
    paddingVertical: 14,
    marginBottom: 16,
    justifyContent: 'center',
  },
  logoPanelHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 4,
  },
  logoPanelTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  logoPanelCaption: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  marqueeRow: {
    height: LOGO_TILE_HEIGHT + 14,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  marqueeRowTop: {
    marginBottom: 10,
  },
  marqueeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoTile: {
    width: LOGO_TILE_WIDTH,
    height: LOGO_TILE_HEIGHT,
    marginRight: LOGO_TILE_GAP,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.logoTileBorder,
    backgroundColor: theme.colors.logoTileBackground,
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoVisualWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoFallbackMark: {
    alignItems: 'center',
    backgroundColor: theme.colors.logoFallbackBackground,
    borderRadius: 8,
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  logoFallbackText: {
    color: theme.colors.logoFallbackText,
    fontSize: 12,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.dangerSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
  },
  infoHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 8,
  },
  infoIconWrap: {
    alignItems: 'center',
    backgroundColor: theme.colors.dangerSoft,
    borderRadius: 10,
    height: 34,
    justifyContent: 'center',
    marginRight: 12,
    width: 34,
  },
  infoHeadingWrap: {
    flex: 1,
  },
  infoTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  infoSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 22,
  },
  infoBody: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    paddingRight: 6,
  },
  infoPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  infoPill: {
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  infoPillText: {
    color: theme.colors.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  ctaButtonPressed: {
    opacity: 0.9,
  },
  ctaText: {
    color: theme.colors.primaryForeground,
    flex: 1,
    fontSize: 19,
    fontWeight: '600',
    marginLeft: 10,
  },
  supportNote: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    paddingHorizontal: 4,
  },
}));
