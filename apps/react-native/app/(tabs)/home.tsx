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
  IconCirclePlus,
  IconCheck,
  IconChevronRight,
} from '@tabler/icons-react-native';
import { SvgUri } from 'react-native-svg';
import { createThemedStyles, useTheme, useThemedStyles } from '../../theme';
import {
  PRESENTABLE_TEXAS_HOSPITAL_LOGOS,
  type TexasHospitalLogo,
} from '../../constants/texasHospitalLogos';

const LOGO_TILE_WIDTH = 112;
const LOGO_TILE_HEIGHT = 58;
const LOGO_TILE_GAP = 10;
const MARQUEE_SCROLL_SPEED_PX_PER_SECOND = 15;
const INFO_PILLS = ['Find hospital systems', 'Re-Use Your Bio', 'Send Official Forms'];
const APP_ICON = require('../../assets/icon.png');

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
  speedPxPerSecond: number;
  renderHospitalLogo: (logo: TexasHospitalLogo) => React.ReactNode;
  startOffsetPx?: number;
  style?: ViewStyle;
}

function LogoMarqueeRow({
  logos,
  direction,
  speedPxPerSecond,
  renderHospitalLogo,
  startOffsetPx = 0,
  style,
}: LogoMarqueeRowProps) {
  const styles = useThemedStyles(createStyles);
  const translateX = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const normalizedSpeedPxPerSecond = Math.max(speedPxPerSecond, 1);
  const loopDistance = useMemo(
    () => logos.length * (LOGO_TILE_WIDTH + LOGO_TILE_GAP),
    [logos.length],
  );
  const loopDurationMs = useMemo(() => {
    if (loopDistance === 0) return 0;
    return (loopDistance / normalizedSpeedPxPerSecond) * 1000;
  }, [loopDistance, normalizedSpeedPxPerSecond]);
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
        duration: loopDurationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    loopRef.current.start();

    return () => {
      loopRef.current?.stop();
    };
  }, [direction, loopDistance, loopDurationMs, normalizedOffset, translateX]);

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
    const midpoint = Math.ceil(PRESENTABLE_TEXAS_HOSPITAL_LOGOS.length / 2);
    return [
      PRESENTABLE_TEXAS_HOSPITAL_LOGOS.slice(0, midpoint),
      PRESENTABLE_TEXAS_HOSPITAL_LOGOS.slice(midpoint),
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
          <Text style={styles.screenTitle}>Request Your Records</Text>
        </View>

        <View style={styles.contentArea}>
          <View style={styles.topSection}>
            <View style={styles.infoCard}>
              <View style={styles.infoIconShell}>
                <Image source={APP_ICON} style={styles.infoIcon} resizeMode="cover" />
              </View>
              <View style={styles.infoPillRow}>
                {INFO_PILLS.map((pill) => (
                  <View key={pill} style={styles.infoPill}>
                    <IconCheck size={14} color={theme.colors.secondary} strokeWidth={2.4} />
                    <Text style={styles.infoPillText}>{pill}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.hospitalLogoPanel}>
              <LogoMarqueeRow
                logos={logoRows[0]}
                direction="left"
                speedPxPerSecond={MARQUEE_SCROLL_SPEED_PX_PER_SECOND}
                renderHospitalLogo={renderHospitalLogo}
                startOffsetPx={24}
                style={styles.marqueeRowTop}
              />
              <LogoMarqueeRow
                logos={logoRows[1]}
                direction="right"
                speedPxPerSecond={MARQUEE_SCROLL_SPEED_PX_PER_SECOND}
                renderHospitalLogo={renderHospitalLogo}
                startOffsetPx={LOGO_TILE_WIDTH * 0.65}
              />
            </View>

            <View style={styles.pendingSection}>
              <Text style={styles.pendingSectionTitle}>Pending Requests</Text>
              <View style={styles.pendingEmptyState}>
                <Text style={styles.pendingEmptyText}>No Pending Requests</Text>
              </View>
            </View>
          </View>

          <View style={styles.bottomSection}>
            <Pressable
              onPress={() => router.push('/records-request')}
              style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
            >
              <IconCirclePlus size={22} color={theme.colors.primaryForeground} strokeWidth={2} />
              <Text style={styles.ctaText}>Start Records Request</Text>
              <IconChevronRight size={20} color={theme.colors.primaryForeground} strokeWidth={2} />
            </Pressable>

            {/* <Text style={styles.supportNote}>
              Coverage will expand to all 50 States.
            </Text> */}
          </View>
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
    paddingBottom: 20,
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
  topSection: {
    flex: 1,
    gap: 0,
  },
  bottomSection: {
    marginTop: 'auto',
    paddingTop: 20,
  },
  hospitalLogoPanel: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.logoPanelBorder,
    backgroundColor: theme.colors.logoPanelBackground,
    paddingVertical: 8,
    marginBottom: 16,
    justifyContent: 'center',
  },
  marqueeRow: {
    height: LOGO_TILE_HEIGHT + 8,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  marqueeRowTop: {
    marginBottom: 6,
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
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.dangerSoft,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  infoIconShell: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    height: 74,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 74,
  },
  infoIcon: {
    height: 74,
    width: 74,
  },
  infoPillRow: {
    flex: 1,
    gap: 6,
    paddingLeft: 4,
  },
  infoPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  infoPillText: {
    color: theme.colors.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  pendingSection: {
    flex: 1,
    marginTop: 2,
  },
  pendingEmptyState: {
    flex: 1,
    justifyContent: 'center',
  },
  pendingSectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  pendingEmptyText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
    opacity: 0.9,
    textAlign: 'center',
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
