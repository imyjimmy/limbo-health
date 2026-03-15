import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBioProfile } from '../providers/BioProfileProvider';
import {
  emptyBioProfile,
  formatDateOfBirthInput,
  isValidDateOfBirth,
  type BioProfile,
} from '../types/bio';

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function validateProfile(profile: BioProfile): string | null {
  if (!profile.fullName.trim()) return 'Please enter your full name.';
  if (!isValidDateOfBirth(profile.dateOfBirth.trim())) return 'Please enter a valid date of birth.';
  if (!profile.addressLine1.trim()) return 'Please enter your street address.';
  if (!profile.city.trim()) return 'Please enter your city.';
  if (!profile.state.trim()) return 'Please enter your state.';
  if (profile.postalCode.trim().length < 5) return 'Please enter a valid postal code.';
  return null;
}

export default function BioSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = readParam(params.returnTo);
  const { status, profile, suggestedProfile, saveProfile, hasProfile } = useBioProfile();
  const [form, setForm] = useState<BioProfile>(emptyBioProfile());
  const [didHydrate, setDidHydrate] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEditingExistingProfile = useMemo(
    () => hasProfile || Boolean(returnTo),
    [hasProfile, returnTo],
  );

  useEffect(() => {
    if (status !== 'ready' || didHydrate) return;
    setForm(profile ?? suggestedProfile);
    setDidHydrate(true);
  }, [status, didHydrate, profile, suggestedProfile]);

  const handleSave = async () => {
    const validationError = validateProfile(form);
    if (validationError) {
      Alert.alert('Incomplete Bio Profile', validationError);
      return;
    }

    setSaving(true);
    try {
      await saveProfile(form);
      router.replace(returnTo || '/(tabs)');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save your bio profile.';
      Alert.alert('Could Not Save', message);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (returnTo) {
      router.replace(returnTo);
      return;
    }
    router.replace('/(tabs)');
  };

  if (status === 'loading' && !didHydrate) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 18,
            paddingBottom: insets.bottom + 28,
          },
        ]}
        keyboardDismissMode="interactive"
      >
        <View style={styles.hero}>
          {isEditingExistingProfile && (
            <Pressable onPress={handleBack} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          )}

          <Text style={styles.eyebrow}>Bio Profile</Text>
          <Text style={styles.title}>
            {hasProfile ? 'Keep your request details current.' : 'Set up your request identity.'}
          </Text>
          <Text style={styles.subtitle}>
            We use this information to prefill medical-records request packets on this device so
            you do not have to keep retyping it.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Basic details</Text>

          <Text style={styles.fieldLabel}>Full name</Text>
          <TextInput
            value={form.fullName}
            onChangeText={(value) => setForm((prev) => ({ ...prev, fullName: value }))}
            placeholder="Jane Doe"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            autoCapitalize="words"
            textContentType="name"
            returnKeyType="next"
          />

          <Text style={styles.fieldLabel}>Date of birth</Text>
          <TextInput
            value={form.dateOfBirth}
            onChangeText={(value) =>
              setForm((prev) => ({
                ...prev,
                dateOfBirth: formatDateOfBirthInput(value),
              }))
            }
            placeholder="MM/DD/YYYY"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            keyboardType="number-pad"
            returnKeyType="next"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Mailing address</Text>

          <Text style={styles.fieldLabel}>Address line 1</Text>
          <TextInput
            value={form.addressLine1}
            onChangeText={(value) => setForm((prev) => ({ ...prev, addressLine1: value }))}
            placeholder="123 Main St"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            autoCapitalize="words"
            textContentType="streetAddressLine1"
          />

          <Text style={styles.fieldLabel}>Address line 2</Text>
          <TextInput
            value={form.addressLine2}
            onChangeText={(value) => setForm((prev) => ({ ...prev, addressLine2: value }))}
            placeholder="Apt 4B"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            autoCapitalize="words"
            textContentType="streetAddressLine2"
          />

          <View style={styles.inlineRow}>
            <View style={styles.inlineFieldWide}>
              <Text style={styles.fieldLabel}>City</Text>
              <TextInput
                value={form.city}
                onChangeText={(value) => setForm((prev) => ({ ...prev, city: value }))}
                placeholder="Austin"
                placeholderTextColor="#94A3B8"
                style={styles.input}
                autoCapitalize="words"
                textContentType="addressCity"
              />
            </View>

            <View style={styles.inlineFieldNarrow}>
              <Text style={styles.fieldLabel}>State</Text>
              <TextInput
                value={form.state}
                onChangeText={(value) => setForm((prev) => ({ ...prev, state: value }))}
                placeholder="TX"
                placeholderTextColor="#94A3B8"
                style={styles.input}
                autoCapitalize="characters"
                textContentType="addressState"
                maxLength={24}
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Postal code</Text>
          <TextInput
            value={form.postalCode}
            onChangeText={(value) =>
              setForm((prev) => ({
                ...prev,
                postalCode: value.replace(/[^\d-]/g, '').slice(0, 10),
              }))
            }
            placeholder="78701"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            keyboardType="number-pad"
            textContentType="postalCode"
          />
        </View>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || saving) && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {saving ? 'Saving...' : hasProfile ? 'Save Bio Profile' : 'Continue'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  content: {
    paddingHorizontal: 20,
    gap: 16,
  },
  hero: {
    gap: 10,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#2563EB',
    fontSize: 15,
    fontWeight: '600',
  },
  eyebrow: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0F172A',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  subtitle: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 23,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  fieldLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#0F172A',
    fontSize: 16,
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
  primaryButton: {
    backgroundColor: '#0F766E',
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonPressed: {
    opacity: 0.86,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
