import React, { useCallback, useEffect, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBioProfile } from '../../../providers/BioProfileProvider';
import {
  emptyBioProfile,
  formatDateOfBirthInput,
  formatLast4SsnInput,
  type BioProfile,
  validateBioProfile,
} from '../../../types/bio';
import { createThemedStyles, useTheme, useThemedStyles } from '../../../theme';
import { getProfileChrome } from './profileChrome';

export default function PersonalInfoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const chrome = getProfileChrome(theme);
  const { status, profile, suggestedProfile, saveProfile } = useBioProfile();
  const [form, setForm] = useState<BioProfile>(emptyBioProfile());
  const [didHydrate, setDidHydrate] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status !== 'ready' || didHydrate) return;
    setForm(profile ?? suggestedProfile);
    setDidHydrate(true);
  }, [status, didHydrate, profile, suggestedProfile]);

  const handleSave = useCallback(async () => {
    const validationError = validateBioProfile(form);
    if (validationError) {
      Alert.alert('Incomplete Personal Info', validationError);
      return;
    }

    setSaving(true);
    try {
      await saveProfile(form);
      router.replace('/(tabs)/profile');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save your personal info.';
      Alert.alert('Could Not Save', message);
    } finally {
      setSaving(false);
    }
  }, [form, router, saveProfile]);

  if (status === 'loading' && !didHydrate) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={theme.colors.secondary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.card}>
          <Text style={styles.helperText}>
            Used to prefill medical-records request packets, including contact fields when a form
            asks for them. Stored only on this device.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>BASIC DETAILS</Text>
        <View style={styles.card}>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Full name</Text>
            <TextInput
              value={form.fullName}
              onChangeText={(value) => setForm((prev) => ({ ...prev, fullName: value }))}
              placeholder="Jane Doe"
              placeholderTextColor={chrome.secondaryText}
              style={styles.fieldInput}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="name"
              returnKeyType="next"
            />
          </View>

          <View style={styles.rowSeparator} />

          <View style={styles.fieldBlock}>
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
              placeholderTextColor={chrome.secondaryText}
              style={styles.fieldInput}
              keyboardType="number-pad"
              textContentType="birthdate"
            />
          </View>

          <View style={styles.rowSeparator} />

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Last 4 of Social Security number</Text>
            <TextInput
              value={form.last4Ssn}
              onChangeText={(value) =>
                setForm((prev) => ({
                  ...prev,
                  last4Ssn: formatLast4SsnInput(value),
                }))
              }
              placeholder="1234"
              placeholderTextColor={chrome.secondaryText}
              style={styles.fieldInput}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>CONTACT DETAILS</Text>
        <View style={styles.card}>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Phone number</Text>
            <TextInput
              value={form.phoneNumber}
              onChangeText={(value) => setForm((prev) => ({ ...prev, phoneNumber: value }))}
              placeholder="512 555 0123"
              placeholderTextColor={chrome.secondaryText}
              style={styles.fieldInput}
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="telephoneNumber"
            />
          </View>

          <View style={styles.rowSeparator} />

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              value={form.email}
              onChangeText={(value) => setForm((prev) => ({ ...prev, email: value }))}
              placeholder="name@example.com"
              placeholderTextColor={chrome.secondaryText}
              style={styles.fieldInput}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>MAILING ADDRESS</Text>
        <View style={styles.card}>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Address line 1</Text>
            <TextInput
              value={form.addressLine1}
              onChangeText={(value) => setForm((prev) => ({ ...prev, addressLine1: value }))}
              placeholder="123 Main St"
              placeholderTextColor={chrome.secondaryText}
              style={styles.fieldInput}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="streetAddressLine1"
            />
          </View>

          <View style={styles.rowSeparator} />

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Address line 2</Text>
            <TextInput
              value={form.addressLine2}
              onChangeText={(value) => setForm((prev) => ({ ...prev, addressLine2: value }))}
              placeholder="Apt 4B"
              placeholderTextColor={chrome.secondaryText}
              style={styles.fieldInput}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="streetAddressLine2"
            />
          </View>

          <View style={styles.rowSeparator} />

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>City</Text>
            <TextInput
              value={form.city}
              onChangeText={(value) => setForm((prev) => ({ ...prev, city: value }))}
              placeholder="Austin"
              placeholderTextColor={chrome.secondaryText}
              style={styles.fieldInput}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="addressCity"
            />
          </View>

          <View style={styles.rowSeparator} />

          <View style={styles.inlineRow}>
            <View style={[styles.fieldBlock, styles.inlineField]}>
              <Text style={styles.fieldLabel}>State</Text>
              <TextInput
                value={form.state}
                onChangeText={(value) => setForm((prev) => ({ ...prev, state: value }))}
                placeholder="TX"
                placeholderTextColor={chrome.secondaryText}
                style={styles.fieldInput}
                autoCapitalize="characters"
                autoCorrect={false}
                textContentType="addressState"
                maxLength={24}
              />
            </View>

            <View style={styles.inlineDivider} />

            <View style={[styles.fieldBlock, styles.inlineField]}>
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
                placeholderTextColor={chrome.secondaryText}
                style={styles.fieldInput}
                keyboardType="number-pad"
                textContentType="postalCode"
              />
            </View>
          </View>
        </View>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveButton,
            (pressed || saving) && styles.saveButtonPressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.primaryForeground} />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = createThemedStyles((theme) => {
  const chrome = getProfileChrome(theme);

  return {
    container: {
      flex: 1,
      backgroundColor: chrome.pageBackground,
    },
    loadingScreen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chrome.pageBackground,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 16,
      gap: 0,
    },
    sectionLabel: {
      color: chrome.secondaryText,
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0.5,
      marginBottom: 8,
      marginTop: 24,
      marginLeft: 4,
    },
    card: {
      backgroundColor: chrome.cardBackground,
      borderRadius: 12,
    },
    helperText: {
      color: chrome.secondaryText,
      fontSize: 15,
      lineHeight: 22,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    fieldBlock: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 8,
    },
    fieldLabel: {
      color: chrome.secondaryText,
      fontSize: 13,
      fontWeight: '600',
    },
    fieldInput: {
      color: chrome.primaryText,
      fontSize: 16,
      padding: 0,
    },
    rowSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: chrome.divider,
      marginLeft: 16,
    },
    inlineRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    inlineField: {
      flex: 1,
    },
    inlineDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: chrome.divider,
    },
    saveButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 54,
      marginTop: 28,
    },
    saveButtonPressed: {
      opacity: 0.82,
    },
    saveButtonText: {
      color: theme.colors.primaryForeground,
      fontSize: 16,
      fontWeight: '700',
    },
  };
});
