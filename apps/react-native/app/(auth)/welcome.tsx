import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useGoogleAuth } from '../../core/auth/googleAuth';
import { useAuthContext } from '../../providers/AuthProvider';
import { colors } from '../../constants/colors';

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.09 24.09 0 0 0 0 21.56l7.98-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

const SLIDES = [
  {
    eyebrow: 'Private by default',
    title: 'Own the record trail.',
    body:
      'Keep your medical-records requests, identity details, and binder data under your control instead of scattered across portals and forms.',
    accent: '#0F766E',
    pills: ['Encrypted access', 'Reusable profile', 'Device-first'],
  },
  {
    eyebrow: 'Workflow over chaos',
    title: 'Turn hospital bureaucracy into steps.',
    body:
      'Pick a Texas hospital system, review exactly what it requires, attach ID only when needed, and move through a guided request flow.',
    accent: '#1D4ED8',
    pills: ['System workflows', 'ID requirement detection', 'Official form links'],
  },
] as const;

function OnboardingArt({ color }: { color: string }) {
  return (
    <View style={styles.artFrame}>
      <View style={[styles.artPanelLarge, { backgroundColor: color }]} />
      <View style={styles.artCardTop}>
        <Text style={styles.artCardTitle}>Request packet</Text>
        <Text style={styles.artCardBody}>Bio details, workflow steps, and hospital-ready output.</Text>
      </View>
      <View style={styles.artCardBottom}>
        <View style={styles.artBadge} />
        <View style={[styles.artBadge, styles.artBadgeWide]} />
        <View style={styles.artDivider} />
        <View style={styles.artLine} />
        <View style={[styles.artLine, styles.artLineShort]} />
      </View>
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const { loginWithGoogle, loginWithStoredNostr, hasStoredNostrKey } = useAuthContext();
  const { request, response, promptAsync } = useGoogleAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [nostrLoading, setNostrLoading] = useState(false);

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
            <ActivityIndicator color={colors.brand.violet} />
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
      <View style={[styles.topGlow, { top: insets.top + 10 }]} />
      <View style={[styles.bottomGlow, { bottom: insets.bottom + 24 }]} />

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
        {SLIDES.map((slide, index) => (
          <View key={slide.title} style={[styles.slide, { width }]}>
            <View style={styles.slideInner}>
              {index === 0 ? <OnboardingArt color={slide.accent} /> : null}
              <Text style={styles.slideEyebrow}>{slide.eyebrow}</Text>
              <Text style={styles.slideTitle}>{slide.title}</Text>
              <Text style={styles.slideBody}>{slide.body}</Text>
              <View style={styles.pillRow}>
                {slide.pills.map((pill) => (
                  <View key={pill} style={styles.pill}>
                    <Text style={styles.pillText}>{pill}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}

        <View style={[styles.slide, { width }]}>
          <View style={styles.slideInner}>
            <View style={styles.finalHero}>
              <Text style={styles.slideEyebrow}>Ready when you are</Text>
              <Text style={styles.slideTitle}>Generate requests without starting from scratch.</Text>
              <Text style={styles.slideBody}>
                Sign in once, add your bio profile on the next screen, and start generating
                request packets for Texas hospital systems.
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
                <ActivityIndicator color="#0F172A" />
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F8FF',
  },
  topGlow: {
    position: 'absolute',
    right: -10,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#D6F5EE',
    opacity: 0.8,
  },
  bottomGlow: {
    position: 'absolute',
    left: -30,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#DBEAFE',
    opacity: 0.7,
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
    color: '#0F172A',
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
    color: '#2563EB',
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
    height: 280,
    borderRadius: 34,
    backgroundColor: '#FFFFFF',
    padding: 18,
    marginBottom: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  artPanelLarge: {
    position: 'absolute',
    top: -32,
    right: -24,
    width: 180,
    height: 180,
    borderRadius: 90,
    opacity: 0.16,
  },
  artCardTop: {
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 20,
    minHeight: 122,
    justifyContent: 'flex-end',
  },
  artCardTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  artCardBody: {
    color: '#CBD5E1',
    fontSize: 15,
    lineHeight: 22,
  },
  artCardBottom: {
    marginTop: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    padding: 18,
    flex: 1,
  },
  artBadge: {
    width: 96,
    height: 12,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
    marginBottom: 10,
  },
  artBadgeWide: {
    width: 148,
    backgroundColor: '#D1FAE5',
  },
  artDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  artLine: {
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
    marginBottom: 10,
  },
  artLineShort: {
    width: '68%',
  },
  slideEyebrow: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  slideTitle: {
    color: '#0F172A',
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 36,
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  slideBody: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 24,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
  },
  pill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D6E3FF',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pillText: {
    color: '#1E3A8A',
    fontSize: 13,
    fontWeight: '700',
  },
  finalHero: {
    marginBottom: 24,
  },
  authButton: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
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
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '700',
  },
  finalPrimaryButton: {
    marginTop: 4,
  },
  nostrButton: {
    alignSelf: 'center',
    backgroundColor: colors.surface.violetSoft,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7B1FF',
  },
  nostrButtonText: {
    color: colors.brand.violet,
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
    backgroundColor: '#CBD5E1',
  },
  paginationDotActive: {
    width: 28,
    backgroundColor: '#0F766E',
  },
  nextButton: {
    backgroundColor: '#0F766E',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextButtonPressed: {
    opacity: 0.88,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  footerNote: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
});
