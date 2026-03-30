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
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createThemedStyles, useTheme, useThemedStyles } from '../theme';
import { useBioProfile } from '../providers/BioProfileProvider';
import { useAuthContext } from '../providers/AuthProvider';
import {
  shouldShowBioSetupDoneButton,
  validateBioSetupStep,
  type BioSetupDoneFieldKey,
} from '../core/bio/setupValidation';
import {
  emptyBioProfile,
  formatDateOfBirthInput,
  formatLast4SsnInput,
  validateBioProfile,
  type BioProfile,
} from '../types/bio';

const STEP_COUNT = 3;
const FIELD_SCROLL_TOP_PADDING = 28;
const FIELD_SCROLL_KEYBOARD_PADDING = 92;

type BioFieldKey =
  | 'fullName'
  | 'dateOfBirth'
  | 'last4Ssn'
  | 'phoneNumber'
  | 'email'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'state'
  | 'postalCode';

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function BioSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = readParam(params.returnTo);
  const { completeOnboarding } = useAuthContext();
  const { status, profile, suggestedProfile, saveProfile, hasProfile } = useBioProfile();
  const [form, setForm] = useState<BioProfile>(emptyBioProfile());
  const [didHydrate, setDidHydrate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const pagerRef = useRef<ScrollView>(null);
  const stepScrollRefs = useRef<Array<ScrollView | null>>([]);
  const inputRefs = useRef<Partial<Record<BioFieldKey, TextInput | null>>>({});
  const fieldLayoutsRef = useRef<Partial<Record<number, Partial<Record<BioFieldKey, number>>>>>({});
  const focusedFieldRef = useRef<BioFieldKey | null>(null);
  const focusedFieldStepRef = useRef<number | null>(null);

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
        body:
          'Add the identity details that hospitals commonly require on request forms, including date of birth and the last 4 digits of your Social Security number.',
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
      if (focusedFieldRef.current && focusedFieldStepRef.current !== null) {
        requestAnimationFrame(() => {
          const stepIndex = focusedFieldStepRef.current!;
          const y = fieldLayoutsRef.current[stepIndex]?.[focusedFieldRef.current!];
          if (typeof y === 'number') {
            stepScrollRefs.current[stepIndex]?.scrollTo({
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
    (stepIndex: number, field: BioFieldKey) => (event: LayoutChangeEvent) => {
      fieldLayoutsRef.current[stepIndex] = {
        ...fieldLayoutsRef.current[stepIndex],
        [field]: event.nativeEvent.layout.y,
      };
    },
    [],
  );

  const registerInputRef = useCallback(
    (field: BioFieldKey) => (node: TextInput | null) => {
      inputRefs.current[field] = node;
    },
    [],
  );

  const focusField = useCallback((stepIndex: number, field: BioFieldKey) => {
    focusedFieldRef.current = field;
    focusedFieldStepRef.current = stepIndex;
    const y = fieldLayoutsRef.current[stepIndex]?.[field];
    if (typeof y !== 'number') return;

    requestAnimationFrame(() => {
      stepScrollRefs.current[stepIndex]?.scrollTo({
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
      focusedFieldStepRef.current = null;
    }
  }, []);

  const dismissKeyboard = useCallback(() => {
    focusedFieldRef.current = null;
    focusedFieldStepRef.current = null;
    Keyboard.dismiss();
  }, []);

  const activateField = useCallback((field: BioFieldKey) => {
    inputRefs.current[field]?.focus();
  }, []);

  const goToStep = useCallback(
    (targetStep: number, animated = true) => {
      setCurrentStep(targetStep);
      pagerRef.current?.scrollTo({ x: width * targetStep, animated });
    },
    [width],
  );

  const transitionToStep = useCallback(
    (targetStep: number, animated = true) => {
      dismissKeyboard();
      goToStep(targetStep, animated);
    },
    [dismissKeyboard, goToStep],
  );

  const getDoneKeyboardState = useCallback(
    (field: BioSetupDoneFieldKey) => {
      const shouldShowDone = shouldShowBioSetupDoneButton(field, form);
      return {
        returnKeyType: shouldShowDone ? 'done' : 'default',
        inputAccessoryViewButtonLabel:
          Platform.OS === 'ios' && shouldShowDone ? 'Done' : undefined,
      } as const;
    },
    [form],
  );

  const validateStepBeforeAdvance = useCallback(
    (stepIndex: number) => {
      const validationError = validateBioSetupStep(stepIndex, form);
      if (validationError) {
        Alert.alert('Incomplete Personal Info', validationError);
        return false;
      }

      return true;
    },
    [form],
  );

  const handleSave = async () => {
    const validationError = validateBioProfile(form);
    if (validationError) {
      Alert.alert('Incomplete Personal Info', validationError);
      return;
    }

    setSaving(true);
    try {
      await saveProfile(form);
      await completeOnboarding();
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
      transitionToStep(currentStep - 1);
      return;
    }
    handleExit();
  };

  const handleNext = async () => {
    if (currentStep < STEP_COUNT - 1) {
      if (!validateStepBeforeAdvance(currentStep)) {
        return;
      }
      transitionToStep(currentStep + 1);
      return;
    }

    await handleSave();
  };

  const handleStepSelect = (targetStep: number) => {
    if (targetStep === currentStep) return;
    if (targetStep < currentStep) {
      transitionToStep(targetStep);
      return;
    }
    if (targetStep !== currentStep + 1) return;

    if (!validateStepBeforeAdvance(currentStep)) {
      return;
    }
    transitionToStep(targetStep);
  };

  const dateOfBirthDoneKeyboardState = getDoneKeyboardState('dateOfBirth');
  const last4SsnDoneKeyboardState = getDoneKeyboardState('last4Ssn');
  const phoneNumberDoneKeyboardState = getDoneKeyboardState('phoneNumber');
  const emailDoneKeyboardState = getDoneKeyboardState('email');
  const postalCodeDoneKeyboardState = getDoneKeyboardState('postalCode');

  useEffect(() => {
    pagerRef.current?.scrollTo({ x: width * currentStep, animated: false });
  }, [width]);

  if (status === 'loading' && !didHydrate) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={theme.colors.secondary} />
      </View>
    );
  }

  const topBarLabel = currentStep === 0 && isEditingExistingProfile ? 'Back' : null;

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
        ref={pagerRef}
        horizontal
        pagingEnabled
        bounces={false}
        directionalLockEnabled
        scrollEnabled={!keyboardVisible}
        showsHorizontalScrollIndicator={false}
        keyboardDismissMode="interactive"
        scrollEventThrottle={16}
        style={styles.scrollView}
        onMomentumScrollEnd={(event) => {
          const nextStep = Math.round(event.nativeEvent.contentOffset.x / width);
          if (nextStep === currentStep) {
            return;
          }

          dismissKeyboard();

          if (nextStep < currentStep) {
            setCurrentStep(nextStep);
            return;
          }

          if (!validateStepBeforeAdvance(currentStep)) {
            requestAnimationFrame(() => {
              pagerRef.current?.scrollTo({ x: width * currentStep, animated: true });
            });
            return;
          }

          setCurrentStep(nextStep);
        }}
      >
        <ScrollView
          ref={(node) => {
            stepScrollRefs.current[0] = node;
          }}
          style={[styles.page, { width }]}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={dismissKeyboard}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <Pressable
            onPress={dismissKeyboard}
            disabled={!keyboardVisible}
            style={[styles.hero, styles.heroIntro]}
          >
            <Text style={styles.eyebrow}>{steps[0].eyebrow}</Text>
            <Text style={styles.title}>{steps[0].title}</Text>
            <Text style={styles.subtitle}>{steps[0].body}</Text>
          </Pressable>

          <View style={styles.introCard}>
            <Text style={styles.introCardTitle}>What we will ask for</Text>
            <Text style={styles.introCardBody}>Full name</Text>
            <Text style={styles.introCardBody}>Date of birth</Text>
            <Text style={styles.introCardBody}>Last 4 of Social Security number</Text>
            <Text style={styles.introCardBody}>Phone number (optional)</Text>
            <Text style={styles.introCardBody}>Email (optional)</Text>
            <Text style={styles.introCardBody}>Mailing address</Text>
            <Text style={styles.introCardFootnote}>Stored only on this device.</Text>
          </View>

          <Pressable
            onPress={dismissKeyboard}
            disabled={!keyboardVisible}
            style={styles.dismissArea}
          />
        </ScrollView>

        <ScrollView
          ref={(node) => {
            stepScrollRefs.current[1] = node;
          }}
          style={[styles.page, { width }]}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={dismissKeyboard}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <Pressable onPress={dismissKeyboard} disabled={!keyboardVisible} style={styles.hero}>
            <Text style={styles.eyebrow}>{steps[1].eyebrow}</Text>
            <Text style={styles.title}>{steps[1].title}</Text>
            <Text style={styles.subtitle}>{steps[1].body}</Text>
          </Pressable>

          <View style={styles.card}>
            <View onLayout={registerFieldLayout(1, 'fullName')}>
              <Text style={styles.fieldLabel}>Full name</Text>
              <View style={styles.inputShell}>
                <TextInput
                  ref={registerInputRef('fullName')}
                  testID="bio-setup-full-name-input"
                  value={form.fullName}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, fullName: value }))}
                  onFocus={() => focusField(1, 'fullName')}
                  onBlur={() => blurField('fullName')}
                  placeholder="Jane Doe"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={styles.input}
                  autoCapitalize="words"
                  textContentType="name"
                  returnKeyType="next"
                />
                {!keyboardVisible ? (
                  <Pressable
                    onPress={() => activateField('fullName')}
                    style={styles.inputActivationOverlay}
                  />
                ) : null}
              </View>
            </View>

            <View onLayout={registerFieldLayout(1, 'dateOfBirth')}>
              <Text style={styles.fieldLabel}>Date of birth</Text>
              <View style={styles.inputShell}>
                <TextInput
                  ref={registerInputRef('dateOfBirth')}
                  testID="bio-setup-date-of-birth-input"
                  value={form.dateOfBirth}
                  onChangeText={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      dateOfBirth: formatDateOfBirthInput(value),
                    }))
                  }
                  onFocus={() => focusField(1, 'dateOfBirth')}
                  onBlur={() => blurField('dateOfBirth')}
                  onSubmitEditing={dismissKeyboard}
                  placeholder="MM/DD/YYYY"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={styles.input}
                  keyboardType="number-pad"
                  returnKeyType={dateOfBirthDoneKeyboardState.returnKeyType}
                  inputAccessoryViewButtonLabel={
                    dateOfBirthDoneKeyboardState.inputAccessoryViewButtonLabel
                  }
                  textContentType="birthdate"
                />
                {!keyboardVisible ? (
                  <Pressable
                    onPress={() => activateField('dateOfBirth')}
                    style={styles.inputActivationOverlay}
                  />
                ) : null}
              </View>
            </View>

            <View onLayout={registerFieldLayout(1, 'last4Ssn')}>
              <Text style={styles.fieldLabel}>Last 4 of Social Security number</Text>
              <View style={styles.inputShell}>
                <TextInput
                  ref={registerInputRef('last4Ssn')}
                  testID="bio-setup-last4-ssn-input"
                  value={form.last4Ssn}
                  onChangeText={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      last4Ssn: formatLast4SsnInput(value),
                    }))
                  }
                  onFocus={() => focusField(1, 'last4Ssn')}
                  onBlur={() => blurField('last4Ssn')}
                  onSubmitEditing={dismissKeyboard}
                  placeholder="1234"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={styles.input}
                  keyboardType="number-pad"
                  returnKeyType={last4SsnDoneKeyboardState.returnKeyType}
                  inputAccessoryViewButtonLabel={
                    last4SsnDoneKeyboardState.inputAccessoryViewButtonLabel
                  }
                  maxLength={4}
                />
                {!keyboardVisible ? (
                  <Pressable
                    onPress={() => activateField('last4Ssn')}
                    style={styles.inputActivationOverlay}
                  />
                ) : null}
              </View>
            </View>

            <View onLayout={registerFieldLayout(1, 'phoneNumber')}>
              <Text style={styles.fieldLabel}>Phone number</Text>
              <View style={styles.inputShell}>
                <TextInput
                  ref={registerInputRef('phoneNumber')}
                  testID="bio-setup-phone-number-input"
                  value={form.phoneNumber}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, phoneNumber: value }))}
                  onFocus={() => focusField(1, 'phoneNumber')}
                  onBlur={() => blurField('phoneNumber')}
                  onSubmitEditing={dismissKeyboard}
                  placeholder="512 555 0123"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={styles.input}
                  keyboardType="phone-pad"
                  returnKeyType={phoneNumberDoneKeyboardState.returnKeyType}
                  inputAccessoryViewButtonLabel={
                    phoneNumberDoneKeyboardState.inputAccessoryViewButtonLabel
                  }
                  textContentType="telephoneNumber"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {!keyboardVisible ? (
                  <Pressable
                    onPress={() => activateField('phoneNumber')}
                    style={styles.inputActivationOverlay}
                  />
                ) : null}
              </View>
            </View>

            <View onLayout={registerFieldLayout(1, 'email')}>
              <Text style={styles.fieldLabel}>Email</Text>
              <View style={styles.inputShell}>
                <TextInput
                  ref={registerInputRef('email')}
                  testID="bio-setup-email-input"
                  value={form.email}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, email: value }))}
                  onFocus={() => focusField(1, 'email')}
                  onBlur={() => blurField('email')}
                  onSubmitEditing={dismissKeyboard}
                  placeholder="name@example.com"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={styles.input}
                  keyboardType="email-address"
                  returnKeyType={emailDoneKeyboardState.returnKeyType}
                  textContentType="emailAddress"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {!keyboardVisible ? (
                  <Pressable
                    onPress={() => activateField('email')}
                    style={styles.inputActivationOverlay}
                  />
                ) : null}
              </View>
            </View>
          </View>

          <Pressable
            onPress={dismissKeyboard}
            disabled={!keyboardVisible}
            style={styles.dismissArea}
          />
        </ScrollView>

        <ScrollView
          ref={(node) => {
            stepScrollRefs.current[2] = node;
          }}
          style={[styles.page, { width }]}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={dismissKeyboard}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <Pressable onPress={dismissKeyboard} disabled={!keyboardVisible} style={styles.hero}>
            <Text style={styles.eyebrow}>{steps[2].eyebrow}</Text>
            <Text style={styles.title}>{steps[2].title}</Text>
            <Text style={styles.subtitle}>{steps[2].body}</Text>
          </Pressable>

          <View style={styles.card}>
            <View onLayout={registerFieldLayout(2, 'addressLine1')}>
              <Text style={styles.fieldLabel}>Address line 1</Text>
              <View style={styles.inputShell}>
                <TextInput
                  ref={registerInputRef('addressLine1')}
                  testID="bio-setup-address-line1-input"
                  value={form.addressLine1}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, addressLine1: value }))}
                  onFocus={() => focusField(2, 'addressLine1')}
                  onBlur={() => blurField('addressLine1')}
                  placeholder="123 Main St"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={styles.input}
                  autoCapitalize="words"
                  textContentType="streetAddressLine1"
                />
                {!keyboardVisible ? (
                  <Pressable
                    onPress={() => activateField('addressLine1')}
                    style={styles.inputActivationOverlay}
                  />
                ) : null}
              </View>
            </View>

            <View onLayout={registerFieldLayout(2, 'addressLine2')}>
              <Text style={styles.fieldLabel}>Address line 2</Text>
              <View style={styles.inputShell}>
                <TextInput
                  ref={registerInputRef('addressLine2')}
                  testID="bio-setup-address-line2-input"
                  value={form.addressLine2}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, addressLine2: value }))}
                  onFocus={() => focusField(2, 'addressLine2')}
                  onBlur={() => blurField('addressLine2')}
                  placeholder="Apt 4B"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={styles.input}
                  autoCapitalize="words"
                  textContentType="streetAddressLine2"
                />
                {!keyboardVisible ? (
                  <Pressable
                    onPress={() => activateField('addressLine2')}
                    style={styles.inputActivationOverlay}
                  />
                ) : null}
              </View>
            </View>

            <View style={styles.inlineRow}>
              <View style={styles.inlineFieldWide} onLayout={registerFieldLayout(2, 'city')}>
                <Text style={styles.fieldLabel}>City</Text>
                <View style={styles.inputShell}>
                  <TextInput
                    ref={registerInputRef('city')}
                    testID="bio-setup-city-input"
                    value={form.city}
                    onChangeText={(value) => setForm((prev) => ({ ...prev, city: value }))}
                    onFocus={() => focusField(2, 'city')}
                    onBlur={() => blurField('city')}
                    placeholder="Austin"
                    placeholderTextColor={theme.colors.inputPlaceholder}
                    style={styles.input}
                    autoCapitalize="words"
                    textContentType="addressCity"
                  />
                  {!keyboardVisible ? (
                    <Pressable
                      onPress={() => activateField('city')}
                      style={styles.inputActivationOverlay}
                    />
                  ) : null}
                </View>
              </View>

              <View style={styles.inlineFieldNarrow} onLayout={registerFieldLayout(2, 'state')}>
                <Text style={styles.fieldLabel}>State</Text>
                <View style={styles.inputShell}>
                  <TextInput
                    ref={registerInputRef('state')}
                    testID="bio-setup-state-input"
                    value={form.state}
                    onChangeText={(value) => setForm((prev) => ({ ...prev, state: value }))}
                    onFocus={() => focusField(2, 'state')}
                    onBlur={() => blurField('state')}
                    placeholder="TX"
                    placeholderTextColor={theme.colors.inputPlaceholder}
                    style={styles.input}
                    autoCapitalize="characters"
                    textContentType="addressState"
                    maxLength={24}
                  />
                  {!keyboardVisible ? (
                    <Pressable
                      onPress={() => activateField('state')}
                      style={styles.inputActivationOverlay}
                    />
                  ) : null}
                </View>
              </View>
            </View>

            <View onLayout={registerFieldLayout(2, 'postalCode')}>
              <Text style={styles.fieldLabel}>Postal code</Text>
              <View style={styles.inputShell}>
                <TextInput
                  ref={registerInputRef('postalCode')}
                  testID="bio-setup-postal-code-input"
                  value={form.postalCode}
                  onChangeText={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      postalCode: value.replace(/[^\d-]/g, '').slice(0, 10),
                    }))
                  }
                  onFocus={() => focusField(2, 'postalCode')}
                  onBlur={() => blurField('postalCode')}
                  onSubmitEditing={dismissKeyboard}
                  placeholder="78701"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  style={styles.input}
                  keyboardType="number-pad"
                  returnKeyType={postalCodeDoneKeyboardState.returnKeyType}
                  inputAccessoryViewButtonLabel={
                    postalCodeDoneKeyboardState.inputAccessoryViewButtonLabel
                  }
                  textContentType="postalCode"
                />
                {!keyboardVisible ? (
                  <Pressable
                    onPress={() => activateField('postalCode')}
                    style={styles.inputActivationOverlay}
                  />
                ) : null}
              </View>
            </View>
          </View>

          <Pressable
            onPress={dismissKeyboard}
            disabled={!keyboardVisible}
            style={styles.dismissArea}
          />
        </ScrollView>
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

          <Text style={styles.paginationHint}>Swipe between steps or tap the dots.</Text>

          <Pressable
            testID="bio-setup-primary-action"
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
  page: {
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
  inputShell: {
    position: 'relative',
  },
  inputActivationOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 16,
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
  paginationHint: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
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
