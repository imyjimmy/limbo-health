import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  closeRecordsWizardSession,
  fetchRecordsWizardSession,
  respondToRecordsWizardSession,
  startRecordsWizardSession,
} from '../core/recordsWorkflow/api';
import { createThemedStyles, useTheme, useThemedStyles } from '../theme';
import type { RecordsWizardField, RecordsWizardSession } from '../types/wizard';

type RouteParams = {
  launchUrl?: string | string[];
  systemName?: string | string[];
};

function normalizeParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function getFieldKeyboardType(field: RecordsWizardField) {
  if (field.type === 'email') return 'email-address';
  if (field.type === 'phone') return 'phone-pad';
  return 'default';
}

export default function RecordsRequestWizardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<RouteParams>();
  const launchUrl = normalizeParam(params.launchUrl);
  const systemName = normalizeParam(params.systemName);
  const sessionIdRef = useRef<string | null>(null);
  const unmountedRef = useRef(false);
  const [session, setSession] = useState<RecordsWizardSession | null>(null);
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentStep = session?.step || null;
  const primaryAction = currentStep?.primaryAction || null;

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!launchUrl) {
      setError('A supported wizard launch URL is required.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    startRecordsWizardSession(launchUrl)
      .then((nextSession) => {
        if (cancelled) return;
        sessionIdRef.current = nextSession.id;
        setSession(nextSession);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to start the hosted wizard session.',
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sessionId) {
        closeRecordsWizardSession(sessionId).catch(() => undefined);
      }
    };
  }, [launchUrl]);

  useEffect(() => {
    const currentFields = session?.step?.fields || [];
    if (currentFields.length === 0) {
      setFieldDrafts({});
      return;
    }

    setFieldDrafts((currentDrafts) => {
      const nextDrafts: Record<string, string> = {};
      for (const field of currentFields) {
        nextDrafts[field.id] = currentDrafts[field.id] ?? field.value ?? '';
      }
      return nextDrafts;
    });
  }, [session?.step?.fields]);

  useEffect(() => {
    if (!session?.id) return;

    const intervalId = setInterval(() => {
      if (submitting) return;

      fetchRecordsWizardSession(session.id)
        .then((nextSession) => {
          if (!unmountedRef.current) {
            setSession(nextSession);
            setError(null);
          }
        })
        .catch(() => undefined);
    }, 2500);

    return () => {
      clearInterval(intervalId);
    };
  }, [session?.id, submitting]);

  const submitResponse = async (input: {
    optionId?: string;
    actionId?: string;
    includeFieldValues?: boolean;
  }) => {
    if (!session) return;

    setSubmitting(true);
    setError(null);

    try {
      const nextSession = await respondToRecordsWizardSession({
        sessionId: session.id,
        optionId: input.optionId,
        actionId: input.actionId,
        fieldValues: input.includeFieldValues ? fieldDrafts : undefined,
      });

      if (!unmountedRef.current) {
        setSession(nextSession);
      }
    } catch (requestError) {
      if (!unmountedRef.current) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to send that response to the hosted wizard.',
        );
      }
    } finally {
      if (!unmountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 14,
            paddingBottom: insets.bottom + 32,
          },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Hosted Wizard</Text>
          <View style={styles.backButtonSpacer} />
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>CloakBrowser Bridge</Text>
          <Text style={styles.heroTitle}>
            {systemName ? `${systemName} online request` : 'Online records request'}
          </Text>
          <Text style={styles.heroBody}>
            Limbo is reading the official hosted request wizard, showing the current step natively,
            and sending your choices back to the website.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={theme.colors.secondary} />
            <Text style={styles.loadingText}>Starting the hosted wizard session...</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Wizard issue</Text>
            <Text style={styles.errorBody}>{error}</Text>
          </View>
        ) : null}

        {!loading && currentStep ? (
          <View style={styles.sectionCard}>
            <Text style={styles.stepEyebrow}>
              {currentStep.kind === 'dialog' ? 'Dialog' : 'Current Step'}
            </Text>
            <Text style={styles.stepTitle}>{currentStep.prompt}</Text>

            {currentStep.notes.map((note) => (
              <Text key={note} style={styles.stepNote}>
                {note}
              </Text>
            ))}

            {currentStep.manualRequiredReason ? (
              <View style={styles.warningCard}>
                <Text style={styles.warningTitle}>Manual step required</Text>
                <Text style={styles.warningBody}>{currentStep.manualRequiredReason}</Text>
              </View>
            ) : null}

            {currentStep.options.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Choices</Text>
                {currentStep.options.map((option) => (
                  <Pressable
                    key={option.id}
                    disabled={option.disabled || submitting}
                    onPress={() => submitResponse({ optionId: option.id })}
                    style={({ pressed }) => [
                      styles.choiceCard,
                      option.selected && styles.choiceCardSelected,
                      (pressed || option.disabled || submitting) && styles.choiceCardPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        option.selected && styles.choiceTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text style={styles.choiceMeta}>
                      {option.kind === 'checkbox' ? 'Toggle' : 'Select'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {currentStep.fields.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Inputs</Text>
                {currentStep.fields.map((field) => (
                  <View key={field.id} style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>
                      {field.label}
                      {field.required ? ' *' : ''}
                    </Text>
                    {field.type === 'select' && field.options.length > 0 ? (
                      <View style={styles.selectList}>
                        {field.options.map((option) => {
                          const selected = fieldDrafts[field.id] === option.value;
                          return (
                            <Pressable
                              key={`${field.id}:${option.value}`}
                              onPress={() =>
                                setFieldDrafts((currentDrafts) => ({
                                  ...currentDrafts,
                                  [field.id]: option.value,
                                }))
                              }
                              style={({ pressed }) => [
                                styles.selectChip,
                                selected && styles.selectChipSelected,
                                pressed && styles.selectChipPressed,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.selectChipText,
                                  selected && styles.selectChipTextSelected,
                                ]}
                              >
                                {option.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : (
                      <TextInput
                        value={fieldDrafts[field.id] ?? ''}
                        onChangeText={(value) =>
                          setFieldDrafts((currentDrafts) => ({
                            ...currentDrafts,
                            [field.id]: value,
                          }))
                        }
                        editable={!submitting && field.supported}
                        multiline={field.type === 'textarea'}
                        keyboardType={getFieldKeyboardType(field)}
                        autoCapitalize={field.type === 'email' ? 'none' : 'sentences'}
                        autoCorrect={false}
                        placeholder={field.placeholder || field.label}
                        placeholderTextColor={theme.colors.inputPlaceholder}
                        style={[
                          styles.input,
                          field.type === 'textarea' && styles.textarea,
                          !field.supported && styles.disabledField,
                        ]}
                      />
                    )}
                    {!field.supported ? (
                      <Text style={styles.fieldHint}>
                        This field type still needs manual browser input.
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Actions</Text>

              {primaryAction ? (
                <Pressable
                  disabled={primaryAction.disabled || submitting}
                  onPress={() =>
                    submitResponse({
                      actionId: primaryAction.id,
                      includeFieldValues: true,
                    })
                  }
                  style={({ pressed }) => [
                    styles.primaryButton,
                    (pressed || primaryAction.disabled || submitting) &&
                      styles.primaryButtonPressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>
                    {submitting ? 'Sending response...' : primaryAction.label}
                  </Text>
                </Pressable>
              ) : null}

              {currentStep.secondaryActions.map((action) => (
                <Pressable
                  key={action.id}
                  disabled={action.disabled || submitting}
                  onPress={() => submitResponse({ actionId: action.id, includeFieldValues: true })}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    (pressed || action.disabled || submitting) && styles.secondaryButtonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>{action.label}</Text>
                </Pressable>
              ))}

              <Pressable
                onPress={() => {
                  if (launchUrl) {
                    Linking.openURL(launchUrl).catch(() => undefined);
                  }
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Open Official Page</Text>
              </Pressable>
            </View>

            <Text style={styles.footerMeta}>
              Status: {session?.status.replace(/_/g, ' ') || 'awaiting input'} • Updated{' '}
              {session ? new Date(session.updatedAt).toLocaleTimeString() : '--:--'}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = createThemedStyles((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSubtle,
  },
  content: {
    paddingHorizontal: 20,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    minWidth: 64,
  },
  backButtonText: {
    color: theme.colors.secondary,
    fontSize: 16,
    fontWeight: '600',
  },
  backButtonSpacer: {
    minWidth: 64,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
    gap: 10,
  },
  eyebrow: {
    color: theme.colors.secondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
  },
  heroBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  loadingCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
  errorCard: {
    backgroundColor: theme.colors.dangerSoft,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    padding: 18,
    gap: 8,
  },
  errorTitle: {
    color: theme.colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
  errorBody: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
    gap: 18,
  },
  stepEyebrow: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  stepTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
  },
  stepNote: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  warningCard: {
    backgroundColor: theme.colors.warningSoft,
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  warningTitle: {
    color: theme.colors.warning,
    fontSize: 15,
    fontWeight: '700',
  },
  warningBody: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  block: {
    gap: 12,
  },
  blockTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  choiceCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    padding: 16,
    gap: 6,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  choiceCardSelected: {
    borderColor: theme.colors.secondary,
    backgroundColor: theme.colors.secondarySoft,
  },
  choiceCardPressed: {
    opacity: 0.72,
  },
  choiceText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  choiceTextSelected: {
    color: theme.colors.secondary,
  },
  choiceMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: theme.colors.inputBackground,
  },
  textarea: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  disabledField: {
    opacity: 0.6,
  },
  fieldHint: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  selectList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  selectChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  selectChipSelected: {
    borderColor: theme.colors.secondary,
    backgroundColor: theme.colors.secondarySoft,
  },
  selectChipPressed: {
    opacity: 0.72,
  },
  selectChipText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  selectChipTextSelected: {
    color: theme.colors.secondary,
  },
  primaryButton: {
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.72,
  },
  primaryButtonText: {
    color: theme.colors.primaryForeground,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
  },
  secondaryButtonPressed: {
    opacity: 0.72,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  footerMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
}));
