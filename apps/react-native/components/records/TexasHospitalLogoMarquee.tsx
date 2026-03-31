import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  type ViewStyle,
  View,
} from 'react-native';
import { SvgUri } from 'react-native-svg';
import { createThemedStyles, useThemedStyles } from '../../theme';
import {
  PRESENTABLE_TEXAS_HOSPITAL_LOGOS,
  type TexasHospitalLogo,
} from '../../constants/texasHospitalLogos';

const LOGO_TILE_WIDTH = 112;
const LOGO_TILE_HEIGHT = 58;
const LOGO_TILE_GAP = 10;
const MARQUEE_SCROLL_SPEED_PX_PER_SECOND = 15;

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

export function TexasHospitalLogoMarquee({ style }: { style?: ViewStyle }) {
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
    [failedLogos, markLogoFailed, styles.logoFallbackText, styles.logoFallbackMark, styles.logoImage],
  );

  return (
    <View style={[styles.hospitalLogoPanel, style]}>
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
  );
}

const createStyles = createThemedStyles((theme) => ({
  hospitalLogoPanel: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.logoPanelBorder,
    backgroundColor: theme.colors.logoPanelBackground,
    paddingVertical: 8,
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
}));
