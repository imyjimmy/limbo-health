import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createThemedStyles, useTheme, useThemedStyles } from '../theme';
import { useBioProfile } from '../providers/BioProfileProvider';
import {
  emptyBioProfile,
  formatDateOfBirthInput,
  isValidDateOfBirth,
  validateBioProfile,
  validateBioProfileAddress,
  validateBioProfileBasicDetails,
  type BioProfile,
} from '../types/bio';

const STEP_COUNT = 3;
const FIELD_SCROLL_TOP_PADDING = 28;
const FIELD_SCROLL_KEYBOARD_PADDING = 92;

type BioFieldKey =
  | 'fullName'
  | 'dateOfBirth'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'state'
  | 'postalCode';

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function validateStep(step: number, profile: BioProfile): string | null {
  if (step === 1) return validateBioProfileBasicDetails(profile);
  if (step === 2) return validateBioProfileAddress(profile);
  return null;
}

export default function BioSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = readParam(params.returnTo);
  const { status, profile, suggestedProfile, saveProfile, hasProfile } = useBioProfile();
  const [form, setForm] = useState<BioProfile>(emptyBioProfile());
  const [didHydrate, setDidHydrate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const fieldLayoutsRef = useRef<Partial<Record<BioFieldKey, number>>>({});
  const focusedFieldRef = useRef<BioFieldKey | null>(null);

  const isEditingExistingProfile = useMemo(
    () => hasProfile || Boolean(returnTo),
    [hasProfile, returnTo],
  );

  const steps = useMemo(
    () => [
      {
        eyebrow: 'Personal Info',
        title: hasProfile ? 'Keep your request details current.' : 'Set up your request identity.',
        body:
          'We keep this profile on your device and use it to prefill medical-records request packets so you do not have to keep retyping it.',
      },
      {
        eyebrow: 'Step 2 of 3',
        title: 'Basic details',
        body: 'Add the name and date of birth hospitals use to identify your records request.',
      },
      {
        eyebrow: 'Step 3 of 3',
        title: 'Mailing address',
        body: 'Add the address that should appear on outgoing request forms and response mail.',
      },
    ],
    [hasProfile],
  );

  useEffect(() => {
    if (status !== 'ready' || didHydrate) return;
    setForm(profile ?? suggestedProfile);
    setDidHydrate(true);
  }, [status, didHydrate, profile, suggestedProfile]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      if (focusedFieldRef.current) {
        requestAnimationFrame(() => {
          const y = fieldLayoutsRef.current[focusedFieldRef.current!];
          if (typeof y === 'number') {
            scrollRef.current?.scrollTo({
              y: Math.max(y - FIELD_SCROLL_KEYBOARD_PADDING, 0),
              animated: true,
            });
          }
        });
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const registerFieldLayout = useCallback(
    (field: BioFieldKey) => (event: LayoutChangeEvent) => {
      fieldLayoutsRef.current[field] = event.nativeEvent.layout.y;
    },
    [],
  );

  const focusField = useCallback((field: BioFieldKey) => {
    focusedFieldRef.current = field;
    const y = fieldLayoutsRef.current[field];
    if (typeof y !== 'number') return;

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(
          y - (keyboardVisible ? FIELD_SCROLL_KEYBOARD_PADDING : FIELD_SCROLL_TOP_PADDING),
          0,
        ),
        animated: true,
      });
    });
  }, [keyboardVisible]);

  const blurField = useCallback((field: BioFieldKey) => {
    if (focusedFieldRef.current === field) {
      focusedFieldRef.current = null;
    }
  }, []);

  const dismissKeyboard = useCallback(() => {
    focusedFieldRef.current = null;
    Keyboard.dismiss();
  }, []);

  const handleSave = async () => {
    const validationError = validateBioProfile(form);
    if (validationError) {
      Alert.alert('Incomplete Personal Info', validationError);
      return;
    }

    setSaving(true);
    try {
      await saveProfile(form);
      router.replace(returnTo || '/(tabs)/home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save your personal info.';
      Alert.alert('Could Not Save', message);
    } finally {
      setSaving(false);
    }
  };

  const handleExit = () => {
    if (returnTo) {
      router.replace(returnTo);
      return;
    }
    router.replace('/(tabs)/home');
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      return;
    }
    handleExit();
  };

  const handleNext = async () => {
    if (currentStep < STEP_COUNT - 1) {
      const validationError = validateStep(currentStep, form);
      if (validationError) {
        Alert.alert('Incomplete Personal Info', validationError);
        return;
      }
      setCurrentStep((prev) => prev + 1);
      return;
    }

    await handleSave();
  };

  const handleStepSelect = (targetStep: number) => {
    if (targetStep === currentStep) return;
    if (targetStep < currentStep) {
      setCurrentStep(targetStep);
      return;
    }
    if (targetStep !== currentStep + 1) return;

    const validationError = validateStep(currentStep, form);
    if (validationError) {
      Alert.alert('Incomplete Personal Info', validationError);
      return;
    }
    setCurrentStep(targetStep);
  };

  if (status === 'loading' && !didHydrate) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={theme.colors.secondary} />
      </View>
    );
  }

  const activeStep = steps[currentStep];
  const topBarLabel =
    currentStep > 0 ? 'Previous' : isEditingExistingProfile ? 'Back' : null;
  const showsDateOfBirthDoneButton = isValidDateOfBirth(form.dateOfBirth.trim());
  const showsPostalCodeDoneButton = form.postalCode.trim().length >= 5;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.topGlow, { top: insets.top + 6 }]} />
      <View style={[styles.bottomGlow, { bottom: insets.bottom + 90 }]} />

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topBarActionSlot}>
          {topBarLabel ? (
            <Pressable onPress={handlePrevious} style={styles.backButton}>
              <Text style={styles.backButtonText}>{topBarLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={dismissKeyboard}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={dismissKeyboard}
          disabled={!keyboardVisible}
          style={[styles.hero, currentStep === 0 && styles.heroIntro]}
        >
          <Text style={styles.eyebrow}>{activeStep.eyebrow}</Text>
          <Text style={styles.title}>{activeStep.title}</Text>
          <Text style={styles.subtitle}>{activeStep.body}</Text>
        </Pressable>

        {currentStep === 0 ? (
          <View style={styles.introCard}>
            <Text style={styles.introCardTitle}>What we will ask for</Text>
            <Text style={styles.introCardBody}>Full name</Text>
            <Text style={styles.introCardBody}>Date of birth</Text>
            <Text style={styles.introCardBody}>Mailing address</Text>
            <Text style={styles.introCardFootnote}>Stored only on this device.</Text>
          </View>
        ) : null}

        {currentStep === 1 ? (
          <View style={styles.card}>
            <View onLayout={registerFieldLayout('fullName')}>
              <Text style={styles.fieldLabel}>Full name</Text>
              <TextInput
                value={form.fullName}
                onChangeText={(value) => setForm((prev) => ({ ...prev, fullName: value }))}
                onFocus={() => focusField('fullName')}
                onBlur={() => blurField('fullName')}
                placeholder="Jane Doe"
                placeholderTextColor={theme.colors.inputPlaceholder}
                style={styles.input}
                autoCapitalize="words"
                textContentType="name"
                returnKeyType="next"
              />
            </View>

            <View onLayout={registerFieldLayout('dateOfBirth')}>
              <Text style={styles.fieldLabel}>Date of birth</Text>
              <TextInput
                value={form.dateOfBirth}
                onChangeText={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    dateOfBirth: formatDateOfBirthInput(value),
                  }))
                }
                onFocus={() => focusField('dateOfBirth')}
                onBlur={() => blurField('dateOfBirth')}
                onSubmitEditing={dismissKeyboard}
                placeholder="MM/DD/YYYY"
                placeholderTextColor={theme.colors.inputPlaceholder}
                style={styles.input}
                keyboardType="number-pad"
                inputAccessoryViewButtonLabel={
                  Platform.OS === 'ios' && showsDateOfBirthDoneButton ? 'Done' : undefined
                }
              />
            </View>
          </View>
        ) : null}

        {currentStep === 2 ? (
          <View style={styles.card}>
            <View onLayout={registerFieldLayout('addressLine1')}>
              <Text style={styles.fieldLabel}>Address line 1</Text>
              <TextInput
                value={form.addressLine1}
                onChangeText={(value) => setForm((prev) => ({ ...prev, addressLine1: value }))}
                onFocus={() => focusField('addressLine1')}
                onBlur={() => blurField('addressLine1')}
                placeholder="123 Main St"
                placeholderTextColor={theme.colors.inputPlaceholder}
                style={styles.input}
                autoCapitalize="words"
                textContentType="streetAddressLine1"
              />
            </View>

            <View onLayout={registerFieldLayout('addressLine2')}>
              <Text style={styles.fieldLabel}>Address line 2</Text>
              <TextInput
                value={form.addressLine2}
                onChangeText={(value) => setForm((prev) => ({ ...prev, addressLine2: value }))}
                onFocus={() => focusField('addressLine2')}
                onBlur={() => blurField('addressLine2')}
                placeholder="Apt 4B"
                placeholderTextColor={theme.colors.inputPlaceholder}
                style={styles.input}
                autoCapitalize="words"
                textContentType="streetAddressLine2"
              />
            </View>

            <View style={styles.inlineRow}>
              <View style={styles.inlineFieldWide} onLayout={registerFieldLayout('city')}>
                <Text style={styles.fieldLabel}>City</Text>
                <TextInput
                  value={form.city}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, city: value }))}
                  onFocus={() => focusField('city')}
                  onBlur={() => blurField('city')}
                  placeholder="Austin"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={styles.input}
                  autoCapitalize="words"
                  textContentType="addressCity"
                />
              </View>

              <View style={styles.inlineFieldNarrow} onLayout={registerFieldLayout('state')}>
                <Text style={styles.fieldLabel}>State</Text>
                <TextInput
                  value={form.state}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, state: value }))}
                  onFocus={() => focusField('state')}
                  onBlur={() => blurField('state')}
                  placeholder="TX"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={styles.input}
                  autoCapitalize="characters"
                  textContentType="addressState"
                  maxLength={24}
                />
              </View>
            </View>

            <View onLayout={registerFieldLayout('postalCode')}>
              <Text style={styles.fieldLabel}>Postal code</Text>
              <TextInput
                value={form.postalCode}
                onChangeText={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    postalCode: value.replace(/[^\d-]/g, '').slice(0, 10),
                  }))
                }
                onFocus={() => focusField('postalCode')}
                onBlur={() => blurField('postalCode')}
                onSubmitEditing={dismissKeyboard}
                placeholder="78701"
                placeholderTextColor={theme.colors.inputPlaceholder}
                style={styles.input}
                keyboardType="number-pad"
                textContentType="postalCode"
                inputAccessoryViewButtonLabel={
                  Platform.OS === 'ios' && showsPostalCodeDoneButton ? 'Done' : undefined
                }
              />
            </View>
          </View>
        ) : null}

        <Pressable
          onPress={dismissKeyboard}
          disabled={!keyboardVisible}
          style={styles.dismissArea}
        />
      </ScrollView>

      {!keyboardVisible ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + 18,
            },
          ]}
        >
          <View style={styles.paginationRow}>
            {steps.map((step, index) => (
              <Pressable
                key={step.title}
                onPress={() => handleStepSelect(index)}
                style={[
                  styles.paginationDot,
                  currentStep === index && styles.paginationDotActive,
                ]}
              />
            ))}
          </View>

          <Pressable
            onPress={handleNext}
            disabled={saving}
            style={({ pressed }) => [
              styles.primaryButton,
              (pressed || saving) && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {saving
                ? 'Saving...'
                : currentStep === 0
                  ? 'Get started'
                  : currentStep === STEP_COUNT - 1
                    ? hasProfile
                      ? 'Save Personal Info'
                      : 'Save and continue'
                    : 'Continue'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const createStyles = createThemedStyles((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  topGlow: {
    position: 'absolute',
    right: -10,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: theme.colors.primarySoft,
    opacity: 0.8,
  },
  bottomGlow: {
    position: 'absolute',
    left: -34,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: theme.colors.secondarySoft,
    opacity: 0.72,
  },
  topBar: {
    paddingHorizontal: 20,
    minHeight: 44,
  },
  topBarActionSlot: {
    minHeight: 34,
    justifyContent: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  backButtonText: {
    color: theme.colors.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 18,
  },
  hero: {
    gap: 10,
  },
  heroIntro: {
    paddingTop: 10,
  },
  eyebrow: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    lineHeight: 23,
  },
  introCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 28,
    padding: 22,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  introCardTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  introCardBody: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
  },
  introCardFootnote: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  fieldLabel: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  input: {
    backgroundColor: theme.colors.inputBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: theme.colors.text,
    fontSize: 16,
  },
  dismissArea: {
    flexGrow: 1,
    minHeight: 72,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inlineFieldWide: {
    flex: 1,
    gap: 10,
  },
  inlineFieldNarrow: {
    width: 96,
    gap: 10,
  },
  footer: {
    paddingHorizontal: 20,
    gap: 14,
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
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.86,
  },
  primaryButtonText: {
    color: theme.colors.primaryForeground,
    fontSize: 17,
    fontWeight: '700',
  },
}));
