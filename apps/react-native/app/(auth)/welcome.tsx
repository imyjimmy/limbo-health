import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GoogleLogo } from '../../components/branding/GoogleLogo';
import { OnboardingBackdrop } from '../../components/onboarding/OnboardingBackdrop';
import { useGoogleAuth } from '../../core/auth/googleAuth';
import { useAuthContext } from '../../providers/AuthProvider';
import { createThemedStyles, useTheme, useThemedStyles } from '../../theme';

type WelcomeSlide = {
  eyebrow?: string;
  title: string;
  accent: string;
  body?: string;
  pills?: string[];
};

function OnboardingArt({
  color,
  styles,
  style,
}: {
  color: string;
  styles: ReturnType<typeof createStyles>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.artFrame, style]}>
      <View style={[styles.artPanelLarge, { backgroundColor: color }]} />
      <View style={styles.artPanelSecondary} />
      <View style={styles.artOrbitRing} />

      <View style={styles.artSheet}>
        <Text style={styles.artSheetEyebrow}>Request packet</Text>
        <Text style={styles.artSheetTitle}>Portal-ready workflow</Text>
        <View style={styles.artSheetDivider} />
        <View style={styles.artSheetRow}>
          <View style={[styles.artTag, { backgroundColor: color }]} />
          <View style={styles.artSheetLine} />
        </View>
        <View style={styles.artSheetRow}>
          <View style={styles.artTagSecondary} />
          <View style={[styles.artSheetLine, styles.artSheetLineShort]} />
        </View>
        <View style={styles.artSheetMetrics}>
          <View style={styles.artMetricCard}>
            <Text style={styles.artMetricLabel}>Identity</Text>
            <Text style={styles.artMetricValue}>Matched</Text>
          </View>
          <View style={styles.artMetricCard}>
            <Text style={styles.artMetricLabel}>Workflow</Text>
            <Text style={styles.artMetricValue}>Guided</Text>
          </View>
        </View>
      </View>

      <View style={styles.artFloatingCard}>
        <View style={styles.artFloatingHeader}>
          <View style={[styles.artFloatingDot, { backgroundColor: color }]} />
          <Text style={styles.artFloatingLabel}>Record trail ready</Text>
        </View>
        <View style={styles.artFloatingPillRow}>
          <View style={styles.artFloatingPill} />
          <View style={[styles.artFloatingPill, styles.artFloatingPillWide]} />
        </View>
        <View style={styles.artFloatingStrip} />
      </View>

      <View style={styles.artTimeline}>
        <View style={styles.artTimelineRailLine} />
        {['Sign in', 'Verify', 'Collect'].map((label, index) => (
          <View key={label} style={styles.artTimelineStop}>
            <View
              style={[
                styles.artTimelineDot,
                index === 1
                  ? [styles.artTimelineDotActive, { borderColor: color, backgroundColor: color }]
                  : styles.artTimelineDotMuted,
              ]}
            />
            <Text style={styles.artTimelineLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const scrollRef = useRef<ScrollView>(null);
  const { loginWithGoogle, loginWithStoredNostr, hasStoredNostrKey } = useAuthContext();
  const { request, response, promptAsync } = useGoogleAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [nostrLoading, setNostrLoading] = useState(false);
  const slides: WelcomeSlide[] = [
    {
      // eyebrow: 'Self Sovereign Tech',
      title: 'Find & Keep Your Medical Records',
      body: 'Fill out your medical info one time, use it everywhere.',
      accent: theme.colors.primary,
      pills: ['Enable Private AI', 'Unlock Medical Tourism', 'Get Second Opinions'],
    },
    {
      // eyebrow: 'Workflow over chaos',
      title: 'Conquer Hospital Bureaucracy.',
      body:
        'Let us guide you through hospital paperwork. Interact with legacy systems without headaches.',
      accent: theme.colors.secondary,
      pills: ['Conquer Legacy Systems', 'Access Your Records', 'Manage Your Health'],
    },
  ];

  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.accessToken) {
      setGoogleLoading(true);
      loginWithGoogle(response.authentication.accessToken)
        .then(() => router.replace('/'))
        .catch((err) => {
          const message = err instanceof Error ? err.message : 'Unable to continue with Google.';
          Alert.alert('Google Login Failed', message);
        })
        .finally(() => setGoogleLoading(false));
    }
  }, [response, loginWithGoogle, router]);

  const handleNostrLogin = async () => {
    setNostrLoading(true);
    try {
      await loginWithStoredNostr();
      router.replace('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to sign in with your stored key.';
      Alert.alert('Nostr Login Failed', message);
    } finally {
      setNostrLoading(false);
    }
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
    scrollRef.current?.scrollTo({ x: width * index, animated: true });
  };

  const renderNostrEntryPoint = () => {
    if (hasStoredNostrKey) {
      return (
        <Pressable
          style={[styles.nostrButton, nostrLoading && styles.authButtonDisabled]}
          onPress={handleNostrLogin}
          disabled={nostrLoading}
        >
          {nostrLoading ? (
            <ActivityIndicator color={theme.colors.accentForeground} />
          ) : (
            <Text style={styles.nostrButtonText}>Sign in with Nostr</Text>
          )}
        </Pressable>
      );
    }

    return (
      <Pressable
        style={styles.nostrButton}
        onPress={() => router.push('/(auth)/import-key')}
      >
        <Text style={styles.nostrButtonText}>Sign in with Nostr</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <OnboardingBackdrop
        colors={theme.colors}
        currentSlide={currentSlide}
        height={height}
        style={styles.backdropLayer}
        width={width}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.brand}>Limbo Health</Text>
        <View style={styles.topBarActionSlot}>
          <Pressable
            onPress={() => goToSlide(2)}
            style={[styles.skipButton, currentSlide === 2 && styles.skipButtonHidden]}
            disabled={currentSlide === 2}
          >
            <Text style={styles.skipButtonText}>Skip</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(event) => {
          const nextSlide = Math.round(event.nativeEvent.contentOffset.x / width);
          setCurrentSlide(nextSlide);
        }}
      >
        {slides.map((slide, index) => (
          <View key={slide.title} style={[styles.slide, { width }]}>
            <View style={styles.slideInner}>
              {slide.eyebrow ? <Text style={styles.slideEyebrow}>{slide.eyebrow}</Text> : null}
              <Text style={styles.slideTitle}>{slide.title}</Text>
              {slide.body ? <Text style={styles.slideBody}>{slide.body}</Text> : null}
              {slide.pills?.length ? (
                <View style={styles.pillRow}>
                  {slide.pills.map((pill) => (
                    <View key={pill} style={styles.pill}>
                      <Text style={styles.pillText}>{pill}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {index === 0 ? (
                <OnboardingArt
                  color={slide.accent}
                  styles={styles}
                  style={styles.artFrameAfterCopy}
                />
              ) : null}
            </View>
          </View>
        ))}

        <View style={[styles.slide, { width }]}>
          <View style={styles.slideInner}>
            <View style={styles.finalHero}>
              <Text style={styles.slideEyebrow}>Ready when you are</Text>
              <Text style={styles.slideTitle}>Fill Out Once. Ready Everywhere.</Text>
              <Text style={styles.slideBody}>
                Fill out your medical info{' '}
                <Text style={styles.slideBodyEmphasis}>one time</Text>, use it{' '}
                <Text style={styles.slideBodyEmphasis}>everywhere</Text>.
              </Text>
              <Text style={styles.supportNote}>
                Coverage will expand to all 50 States.
              </Text>
            </View>

            <Pressable
              style={[
                styles.authButton,
                styles.finalPrimaryButton,
                (!request || googleLoading) && styles.authButtonDisabled,
              ]}
              onPress={() => promptAsync()}
              disabled={!request || googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator color={theme.colors.text} />
              ) : (
                <View style={styles.authButtonContent}>
                  <GoogleLogo size={20} />
                  <Text style={styles.authButtonText}>Continue with Google</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.secondaryFooterSlot}>
          {currentSlide === 2 ? renderNostrEntryPoint() : null}
        </View>

        <View style={styles.paginationRow}>
          {[0, 1, 2].map((index) => (
            <Pressable
              key={index}
              onPress={() => goToSlide(index)}
              style={[
                styles.paginationDot,
                currentSlide === index && styles.paginationDotActive,
              ]}
            />
          ))}
        </View>

        <View style={styles.footerActionSlot}>
          {currentSlide < 2 ? (
            <Pressable
              onPress={() => goToSlide(currentSlide + 1)}
              style={({ pressed }) => [styles.nextButton, pressed && styles.nextButtonPressed]}
            >
              <Text style={styles.nextButtonText}>Next</Text>
            </Pressable>
          ) : (
            <Text style={styles.footerNote}>Bio setup comes right after sign-in.</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const createStyles = createThemedStyles((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  backdropLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8,
    minHeight: 44,
  },
  topBarActionSlot: {
    minWidth: 48,
    minHeight: 34,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  brand: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  skipButton: {
    paddingVertical: 8,
  },
  skipButtonHidden: {
    opacity: 0,
  },
  skipButtonText: {
    color: theme.colors.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  slide: {
    flex: 1,
  },
  slideInner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    justifyContent: 'center',
  },
  artFrame: {
    height: 292,
    borderRadius: 34,
    backgroundColor: theme.colors.surface,
    padding: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.text,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  artPanelLarge: {
    position: 'absolute',
    top: -48,
    right: -36,
    width: 228,
    height: 228,
    borderRadius: 114,
    opacity: 0.18,
  },
  artPanelSecondary: {
    position: 'absolute',
    bottom: 12,
    left: -46,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: theme.colors.secondarySoft,
    opacity: 0.75,
  },
  artOrbitRing: {
    position: 'absolute',
    top: 26,
    right: 26,
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 1,
    borderColor: theme.colors.overlay,
    opacity: 0.16,
  },
  artFrameAfterCopy: {
    marginTop: 26,
  },
  artSheet: {
    width: '74%',
    borderRadius: 28,
    padding: 20,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  artSheetEyebrow: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  artSheetTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
  },
  artSheetDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 14,
  },
  artSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  artTag: {
    width: 54,
    height: 10,
    borderRadius: 999,
  },
  artTagSecondary: {
    width: 40,
    height: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.secondarySoft,
  },
  artSheetLine: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  artSheetLineShort: {
    flex: 0,
    width: '62%',
  },
  artSheetMetrics: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  artMetricCard: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  artMetricLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  artMetricValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  artFloatingCard: {
    position: 'absolute',
    right: 18,
    top: 118,
    width: 154,
    borderRadius: 24,
    padding: 16,
    backgroundColor: theme.colors.surfaceInverse,
  },
  artFloatingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  artFloatingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  artFloatingLabel: {
    flex: 1,
    color: theme.colors.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
  artFloatingPillRow: {
    gap: 8,
  },
  artFloatingPill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.secondarySoft,
  },
  artFloatingPillWide: {
    width: '72%',
    backgroundColor: theme.colors.primarySoft,
  },
  artFloatingStrip: {
    marginTop: 14,
    height: 44,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    opacity: 0.9,
  },
  artTimeline: {
    marginTop: 'auto',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  artTimelineRailLine: {
    position: 'absolute',
    left: 28,
    right: 28,
    top: 24,
    height: 2,
    backgroundColor: theme.colors.border,
  },
  artTimelineStop: {
    width: 74,
    alignItems: 'center',
    gap: 8,
  },
  artTimelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  artTimelineDotMuted: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
  },
  artTimelineDotActive: {
    shadowColor: theme.colors.text,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  artTimelineLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  slideEyebrow: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  slideTitle: {
    color: theme.colors.text,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 36,
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  slideBody: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
  },
  slideBodyEmphasis: {
    color: theme.colors.text,
    fontWeight: '800',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
  },
  pill: {
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.secondarySoft,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pillText: {
    color: theme.colors.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  finalHero: {
    marginBottom: 24,
  },
  supportNote: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
  authButton: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  authButtonDisabled: {
    opacity: 0.45,
  },
  authButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  authButtonText: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  finalPrimaryButton: {
    marginTop: 4,
  },
  nostrButton: {
    alignSelf: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  nostrButtonText: {
    color: theme.colors.accentForeground,
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 24,
    gap: 14,
  },
  secondaryFooterSlot: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerActionSlot: {
    minHeight: 56,
    justifyContent: 'center',
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  paginationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.border,
  },
  paginationDotActive: {
    width: 28,
    backgroundColor: theme.colors.primary,
  },
  nextButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextButtonPressed: {
    opacity: 0.88,
  },
  nextButtonText: {
    color: theme.colors.primaryForeground,
    fontSize: 17,
    fontWeight: '700',
  },
  footerNote: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
}));
