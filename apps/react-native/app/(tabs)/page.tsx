import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { fetchHospitalSystems, fetchRecordsRequestPacket } from '../../core/recordsWorkflow/api';
import {
  HOSPITAL_SYSTEM_SEARCH_DEBOUNCE_MS,
  normalizeHospitalSystemSearchQuery,
} from '../../core/recordsWorkflow/search';
import { PortalCredentialVault } from '../../core/portal/PortalCredentialVault';
import { PortalProfileStore } from '../../core/portal/PortalProfileStore';
import {
  buildCredentialFillScript,
  buildPortalCommandScript,
  detectPortalFamily,
  getPortalAdapter,
} from '../../core/portal/adapters';
import {
  buildPortalBridgeScript,
  derivePortalSessionState,
  parsePortalBridgeMessage,
} from '../../core/portal/session';
import { resolvePortalOwnerKey } from '../../core/portal/storageScope';
import { useAuthContext } from '../../providers/AuthProvider';
import { useBioProfile } from '../../providers/BioProfileProvider';
import { createThemedStyles, useTheme, useThemedStyles } from '../../theme';
import type {
  HospitalSystemOption,
  RecordsRequestPacket,
} from '../../types/recordsRequest';
import type {
  PortalHumanRequiredReason,
  PortalNavigationAction,
  PortalProfile,
  PortalSessionState,
} from '../../types/portal';

const HERO_PILLS = ['Local credential vault', 'Human-required steps stay visible', 'Live portal browser'];

function createPortalProfileId(systemId: string, loginUrl: string): string {
  const normalizedUrl = loginUrl
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  return `${systemId}-${normalizedUrl}`;
}

function formatPortalScope(scope: string): string {
  return scope
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatPortalFamilyLabel(family: PortalProfile['portalFamily']): string {
  switch (family) {
    case 'mychart':
      return 'MyChart';
    case 'athena':
      return 'athenahealth';
    case 'nextgen':
      return 'NextGen';
    case 'eclinicalworks':
      return 'eClinicalWorks';
    default:
      return 'Generic portal';
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'Not yet';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not yet';
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatHumanRequiredReason(reason: PortalHumanRequiredReason): string {
  switch (reason) {
    case 'captcha':
      return 'This security check needs you to complete it in the portal.';
    case 'otp':
      return 'Enter the verification code, then we can continue.';
    case 'passkey':
      return 'Use your passkey or security key in the live portal view.';
    case 'consent':
      return 'Review and accept the portal consent text yourself.';
    case 'security_check':
      return 'The portal is asking for an identity check that needs your attention.';
    case 'manual_review':
      return 'This page needs a manual review before Limbo should act.';
    default:
      return 'The portal needs you for the next step.';
  }
}

function formatPhaseLabel(phase: PortalSessionState['phase']): string {
  switch (phase) {
    case 'login':
      return 'Login';
    case 'registration':
      return 'Registration';
    case 'challenge':
      return 'Needs you';
    case 'authenticated':
      return 'Connected';
    case 'unsupported':
      return 'Manual';
    default:
      return 'Loading';
  }
}

function getAssistCopy(input: {
  assistEnabled: boolean;
  phase: PortalSessionState['phase'];
  hasCredential: boolean;
  humanRequiredReason: PortalHumanRequiredReason;
}): { title: string; body: string } {
  if (!input.assistEnabled) {
    return {
      title: 'Manual browsing mode',
      body: 'You are in control of the live portal page. Limbo will keep the session visible and only assist when you ask.',
    };
  }

  switch (input.phase) {
    case 'login':
      return input.hasCredential
        ? {
            title: 'Ready to unlock and fill',
            body: 'Use Face ID to unlock your saved login, fill the page, and optionally submit when the adapter is confident.',
          }
        : {
            title: 'One-time setup for an existing portal',
            body: 'Enter your existing login once or save it in Limbo so future logins can use biometric unlock on this device.',
          };
    case 'registration':
      return {
        title: 'We will help, you stay in the loop',
        body: 'You can keep moving through sign-up while Limbo watches for the right moments to resume assistance.',
      };
    case 'challenge':
      return {
        title: 'Human step required',
        body: formatHumanRequiredReason(input.humanRequiredReason),
      };
    case 'authenticated':
      return {
        title: 'Portal session is live',
        body: 'You are back in. Limbo can keep the authenticated page open and steer to messages, labs, appointments, or visit summaries next.',
      };
    case 'unsupported':
      return {
        title: 'Manual mode recommended',
        body: 'This portal page does not expose enough stable signals yet. You can still browse in-app while we keep the feature local and safe.',
      };
    default:
      return {
        title: 'Opening the portal',
        body: 'Limbo is observing the page state so we can show the right assist mode without pretending to bypass security.',
      };
  }
}

function buildPortalProfile(
  system: HospitalSystemOption,
  packet: RecordsRequestPacket,
): PortalProfile | null {
  if (!packet.portal.url) {
    return null;
  }

  const portalFamily = detectPortalFamily({
    url: packet.portal.url,
    portalName: packet.portal.name,
    healthSystemName: system.name,
  });
  const adapter = getPortalAdapter(portalFamily);
  const id = createPortalProfileId(system.id, packet.portal.url);
  const lastVerifiedAt = packet.sources.find((source) => source.lastVerifiedAt)?.lastVerifiedAt ?? null;
  let baseUrl = packet.portal.url;

  try {
    baseUrl = new URL(packet.portal.url).origin;
  } catch (_error) {}

  return {
    id,
    healthSystemId: system.id,
    healthSystemName: system.name,
    portalFamily,
    displayName: packet.portal.name ? `${system.name} ${packet.portal.name}` : `${system.name} Portal`,
    portalName: packet.portal.name,
    portalScope: packet.portal.scope,
    baseUrl,
    loginUrl: packet.portal.url,
    registrationUrl: packet.portal.url,
    usernameHint: adapter.usernameHint,
    credentialKey: `portal:${id}`,
    lastSuccessfulLoginAt: null,
    lastVerifiedAt,
    status: 'active',
  };
}

export default function PageScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { state } = useAuthContext();
  const { profile } = useBioProfile();
  const ownerKey = useMemo(
    () =>
      resolvePortalOwnerKey({
        status: state.status,
        pubkey: state.pubkey,
        loginMethod: state.loginMethod,
        googleId: state.googleProfile?.googleId ?? null,
        googleEmail: state.googleProfile?.email ?? null,
      }),
    [
      state.status,
      state.pubkey,
      state.loginMethod,
      state.googleProfile?.googleId,
      state.googleProfile?.email,
    ],
  );
  const profileStore = useMemo(
    () => (ownerKey ? new PortalProfileStore(SecureStore, ownerKey) : null),
    [ownerKey],
  );
  const credentialVault = useMemo(() => new PortalCredentialVault(SecureStore), []);
  const portalWebViewRef = useRef<WebView | null>(null);
  const lastAuthenticatedPortalIdRef = useRef<string | null>(null);
  const [savedPortals, setSavedPortals] = useState<PortalProfile[]>([]);
  const [savedPortalsLoading, setSavedPortalsLoading] = useState(true);
  const [credentialAvailability, setCredentialAvailability] = useState<Record<string, boolean>>(
    {},
  );
  const [activePortalId, setActivePortalId] = useState<string | null>(null);
  const [assistEnabled, setAssistEnabled] = useState(true);
  const [browserReloadKey, setBrowserReloadKey] = useState(0);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<PortalSessionState | null>(null);
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedSearchQuery = normalizeHospitalSystemSearchQuery(searchQuery);
  const deferredSearchQuery = useDeferredValue(normalizedSearchQuery);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(deferredSearchQuery);
  const [systems, setSystems] = useState<HospitalSystemOption[]>([]);
  const [systemsLoading, setSystemsLoading] = useState(false);
  const [systemsError, setSystemsError] = useState<string | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<HospitalSystemOption | null>(null);
  const [selectedPacket, setSelectedPacket] = useState<RecordsRequestPacket | null>(null);
  const [packetLoading, setPacketLoading] = useState(false);
  const [packetError, setPacketError] = useState<string | null>(null);
  const [isCredentialModalVisible, setIsCredentialModalVisible] = useState(false);
  const [credentialUsername, setCredentialUsername] = useState(profile?.email?.trim() || '');
  const [credentialPassword, setCredentialPassword] = useState('');
  const [credentialNotes, setCredentialNotes] = useState('');
  const [credentialSaving, setCredentialSaving] = useState(false);

  const activePortal = useMemo(
    () => savedPortals.find((portal) => portal.id === activePortalId) ?? null,
    [activePortalId, savedPortals],
  );
  const activeAdapter = useMemo(
    () => getPortalAdapter(activePortal?.portalFamily ?? 'generic'),
    [activePortal?.portalFamily],
  );
  const activeHasCredential = activePortal
    ? credentialAvailability[activePortal.id] ?? false
    : false;
  const assistCopy = getAssistCopy({
    assistEnabled,
    phase: sessionState?.phase ?? 'loading',
    hasCredential: activeHasCredential,
    humanRequiredReason: sessionState?.humanRequiredReason ?? null,
  });

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(deferredSearchQuery);
    }, HOSPITAL_SYSTEM_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [deferredSearchQuery]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedPortals() {
      if (!profileStore) {
        setSavedPortals([]);
        setCredentialAvailability({});
        setSavedPortalsLoading(false);
        return;
      }

      setSavedPortalsLoading(true);

      try {
        const profiles = await profileStore.listProfiles();
        const availabilityEntries = await Promise.all(
          profiles.map(async (portal) => {
            try {
              return [portal.id, await credentialVault.hasCredential(portal.credentialKey)] as const;
            } catch (_error) {
              return [portal.id, false] as const;
            }
          }),
        );

        if (cancelled) {
          return;
        }

        startTransition(() => {
          setSavedPortals(profiles);
          setCredentialAvailability(Object.fromEntries(availabilityEntries));
          setActivePortalId((current) => {
            if (!current) {
              return current;
            }

            return profiles.some((portal) => portal.id === current) ? current : null;
          });
        });
      } catch (error) {
        console.warn('[PortalScreen] Failed to load saved portals', error);
        if (!cancelled) {
          setSavedPortals([]);
          setCredentialAvailability({});
        }
      } finally {
        if (!cancelled) {
          setSavedPortalsLoading(false);
        }
      }
    }

    loadSavedPortals();

    return () => {
      cancelled = true;
    };
  }, [credentialVault, profileStore]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadSystems() {
      if (!isAddPanelOpen || !ownerKey) {
        return;
      }

      setSystemsLoading(true);
      setSystemsError(null);

      try {
        const results = await fetchHospitalSystems(debouncedSearchQuery, {
          signal: controller.signal,
        });

        if (!cancelled) {
          startTransition(() => {
            setSystems(results);
          });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        if (!cancelled) {
          setSystemsError(
            error instanceof Error
              ? error.message
              : 'Unable to load health systems right now.',
          );
        }
      } finally {
        if (!cancelled) {
          setSystemsLoading(false);
        }
      }
    }

    loadSystems();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debouncedSearchQuery, isAddPanelOpen, ownerKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadPacket() {
      if (!selectedSystem) {
        setSelectedPacket(null);
        setPacketError(null);
        setPacketLoading(false);
        return;
      }

      setPacketLoading(true);
      setPacketError(null);

      try {
        const packet = await fetchRecordsRequestPacket(selectedSystem.id);
        if (!cancelled) {
          setSelectedPacket(packet);
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedPacket(null);
          setPacketError(
            error instanceof Error
              ? error.message
              : 'Unable to load portal details for that system.',
          );
        }
      } finally {
        if (!cancelled) {
          setPacketLoading(false);
        }
      }
    }

    loadPacket();

    return () => {
      cancelled = true;
    };
  }, [selectedSystem]);

  useEffect(() => {
    if (!activePortal) {
      setSessionState(null);
      setBrowserError(null);
      setAssistEnabled(true);
      lastAuthenticatedPortalIdRef.current = null;
      return;
    }

    setSessionState({
      portalProfileId: activePortal.id,
      phase: 'loading',
      currentUrl: activePortal.loginUrl,
      pageTitle: activePortal.displayName,
      isHumanRequired: false,
      humanRequiredReason: null,
      lastAdapterAction: null,
      lastActivityAt: null,
      suggestedActions: [],
    });
    setBrowserError(null);
    setAssistEnabled(true);
  }, [activePortal]);

  useEffect(() => {
    if (!activePortal || !profileStore || sessionState?.phase !== 'authenticated') {
      return;
    }

    if (lastAuthenticatedPortalIdRef.current === activePortal.id) {
      return;
    }

    lastAuthenticatedPortalIdRef.current = activePortal.id;

    const nextPortal: PortalProfile = {
      ...activePortal,
      lastSuccessfulLoginAt: new Date().toISOString(),
      lastVerifiedAt: activePortal.lastVerifiedAt ?? new Date().toISOString(),
      status: 'active',
    };

    profileStore
      .upsertProfile(nextPortal)
      .then((profiles) => {
        startTransition(() => {
          setSavedPortals(profiles);
        });
      })
      .catch((error) => {
        console.warn('[PortalScreen] Failed to persist successful login timestamp', error);
      });
  }, [activePortal, profileStore, sessionState?.phase]);

  const openCredentialModal = () => {
    if (!activePortal) {
      return;
    }

    setCredentialUsername(profile?.email?.trim() || '');
    setCredentialPassword('');
    setCredentialNotes(activePortal.usernameHint);
    setIsCredentialModalVisible(true);
  };

  const handleSaveCredential = async () => {
    if (!activePortal) {
      return;
    }

    const username = credentialUsername.trim();
    if (!username || !credentialPassword) {
      Alert.alert('Saved Login', 'Add both a username and password before saving.');
      return;
    }

    setCredentialSaving(true);

    try {
      const now = new Date().toISOString();
      await credentialVault.saveCredential(activePortal.credentialKey, {
        username,
        password: credentialPassword,
        notes: credentialNotes.trim() || null,
        createdAt: now,
        lastUsedAt: null,
        lastVerifiedAt: now,
      });

      startTransition(() => {
        setCredentialAvailability((current) => ({
          ...current,
          [activePortal.id]: true,
        }));
      });
      setIsCredentialModalVisible(false);
      setCredentialPassword('');
    } catch (error) {
      Alert.alert(
        'Saved Login',
        error instanceof Error
          ? error.message
          : 'Unable to save this login in secure device storage.',
      );
    } finally {
      setCredentialSaving(false);
    }
  };

  const handleAddPortal = async () => {
    if (!profileStore || !selectedSystem || !selectedPacket) {
      return;
    }

    const nextPortal = buildPortalProfile(selectedSystem, selectedPacket);
    if (!nextPortal) {
      return;
    }

    try {
      const profiles = await profileStore.upsertProfile(nextPortal);
      const hasCredential = await credentialVault.hasCredential(nextPortal.credentialKey);

      startTransition(() => {
        setSavedPortals(profiles);
        setCredentialAvailability((current) => ({
          ...current,
          [nextPortal.id]: hasCredential,
        }));
        setActivePortalId(nextPortal.id);
        setIsAddPanelOpen(false);
      });
    } catch (error) {
      Alert.alert(
        'Add Portal',
        error instanceof Error ? error.message : 'Unable to save this portal right now.',
      );
    }
  };

  const handleDeletePortal = (portal: PortalProfile) => {
    if (!profileStore) {
      return;
    }

    Alert.alert(
      'Remove portal',
      `Remove ${portal.displayName} and its saved login from this device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            Promise.all([
              profileStore.deleteProfile(portal.id),
              credentialVault.deleteCredential(portal.credentialKey).catch(() => undefined),
            ])
              .then(([profiles]) => {
                startTransition(() => {
                  setSavedPortals(profiles);
                  setCredentialAvailability((current) => {
                    const next = { ...current };
                    delete next[portal.id];
                    return next;
                  });
                  setActivePortalId((current) => (current === portal.id ? null : current));
                });
              })
              .catch((error) => {
                Alert.alert(
                  'Remove portal',
                  error instanceof Error ? error.message : 'Unable to remove that portal.',
                );
              });
          },
        },
      ],
    );
  };

  const requestPortalSnapshot = () => {
    portalWebViewRef.current?.injectJavaScript(
      'window.__limboCollectPortalSnapshot && window.__limboCollectPortalSnapshot(); true;',
    );
  };

  const handleUnlockAndFill = async () => {
    if (!activePortal) {
      return;
    }

    try {
      const credential = await credentialVault.getCredential(activePortal.credentialKey);
      if (!credential) {
        Alert.alert(
          'Unlock and fill',
          'No saved login was found for this portal on this device.',
        );
        return;
      }

      const script = buildCredentialFillScript(activeAdapter, credential, {
        autoSubmit: assistEnabled && activeAdapter.login.safeAutoSubmit,
      });
      portalWebViewRef.current?.injectJavaScript(script);
    } catch (error) {
      Alert.alert(
        'Unlock and fill',
        error instanceof Error
          ? error.message
          : 'Unable to unlock the saved login right now.',
      );
    }
  };

  const handleRunPortalAction = (action: PortalNavigationAction) => {
    const script = buildPortalCommandScript(activeAdapter, action);
    portalWebViewRef.current?.injectJavaScript(script);
  };

  const handlePortalMessage = (event: WebViewMessageEvent) => {
    const message = parsePortalBridgeMessage(event.nativeEvent.data);
    if (!message || !activePortal) {
      return;
    }

    if (message.type === 'portal.pageSnapshot') {
      const nextSession = derivePortalSessionState({
        portalProfileId: activePortal.id,
        snapshot: message.payload,
        lastAdapterAction: sessionState?.lastAdapterAction ?? null,
      });
      setBrowserError(null);
      setSessionState(nextSession);
      return;
    }

    if (message.type === 'portal.fillResult' && !message.payload.filled) {
      Alert.alert(
        'Unlock and fill',
        'Limbo could not confidently find the login fields on this page. You can keep going in manual mode.',
      );
      return;
    }

    if (message.type === 'portal.commandResult') {
      setSessionState((current) =>
        current
          ? {
              ...current,
              lastAdapterAction: message.payload.action,
            }
          : current,
      );

      if (!message.payload.matched) {
        Alert.alert(
          'Portal navigation',
          'That section was not exposed in a stable way on this page yet. You can keep browsing manually.',
        );
      }
    }
  };

  const handleNavigationStateChange = (navigationState: WebViewNavigation) => {
    setSessionState((current) =>
      current
        ? {
            ...current,
            currentUrl: navigationState.url,
            pageTitle: navigationState.title || current.pageTitle,
          }
        : current,
    );
  };

  const handleBrowserReload = () => {
    setBrowserReloadKey((current) => current + 1);
  };

  const renderSavedPortals = () => {
    if (savedPortalsLoading) {
      return (
        <View style={styles.stateCard}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.stateCardText}>Loading saved portals...</Text>
        </View>
      );
    }

    if (savedPortals.length === 0) {
      return (
        <View style={styles.stateCard}>
          <Text style={styles.stateCardTitle}>No saved portals yet</Text>
          <Text style={styles.stateCardText}>
            Search a health system, save a portal locally, and keep the login flow inside Limbo.
          </Text>
        </View>
      );
    }

    return savedPortals.map((portal) => {
      const hasCredential = credentialAvailability[portal.id] ?? false;

      return (
        <View key={portal.id} style={styles.portalCard}>
          <View style={styles.portalCardHeader}>
            <View style={styles.portalCardHeaderCopy}>
              <Text style={styles.portalCardTitle}>{portal.displayName}</Text>
              <Text style={styles.portalCardSubtitle}>
                {formatPortalFamilyLabel(portal.portalFamily)} • {formatPortalScope(portal.portalScope || 'unknown')}
              </Text>
            </View>
            <View
              style={[
                styles.credentialBadge,
                hasCredential ? styles.credentialBadgeReady : styles.credentialBadgePending,
              ]}
            >
              <Text
                style={[
                  styles.credentialBadgeText,
                  hasCredential
                    ? styles.credentialBadgeTextReady
                    : styles.credentialBadgeTextPending,
                ]}
              >
                {hasCredential ? 'Face ID ready' : 'Needs saved login'}
              </Text>
            </View>
          </View>

          <Text style={styles.portalMetaText}>Last login: {formatTimestamp(portal.lastSuccessfulLoginAt)}</Text>
          <Text style={styles.portalMetaText}>Last verified: {formatTimestamp(portal.lastVerifiedAt)}</Text>

          <View style={styles.portalCardActions}>
            <Pressable
              onPress={() => setActivePortalId(portal.id)}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Open</Text>
            </Pressable>

            <Pressable
              onPress={() => handleDeletePortal(portal)}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      );
    });
  };

  const renderAddPortalPanel = () => {
    const previewProfile =
      selectedSystem && selectedPacket ? buildPortalProfile(selectedSystem, selectedPacket) : null;

    return (
      <View style={styles.addPanel}>
        <View style={styles.addPanelHeader}>
          <Text style={styles.sectionTitle}>Add portal</Text>
          <Pressable onPress={() => setIsAddPanelOpen(false)}>
            <Text style={styles.addPanelDismiss}>Close</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionBody}>
          Search a health system and open the best-known portal URL we have for that organization.
        </Text>

        <TextInput
          value={searchQuery}
          onChangeText={(value) => {
            setSearchQuery(value);
            setSelectedSystem(null);
            setSelectedPacket(null);
            setPacketError(null);
          }}
          placeholder="Search health systems"
          placeholderTextColor={theme.colors.inputPlaceholder}
          autoCapitalize="words"
          autoCorrect={false}
          style={styles.searchInput}
        />

        {systemsLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.stateCardText}>Searching systems...</Text>
          </View>
        ) : null}

        {systemsError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorCardTitle}>Search unavailable</Text>
            <Text style={styles.errorCardText}>{systemsError}</Text>
          </View>
        ) : null}

        {!selectedSystem ? (
          <View style={styles.systemResults}>
            {systems.slice(0, 10).map((system) => (
              <Pressable
                key={system.id}
                onPress={() => setSelectedSystem(system)}
                style={({ pressed }) => [
                  styles.systemResultCard,
                  pressed && styles.systemResultCardPressed,
                ]}
              >
                <Text style={styles.systemResultTitle}>{system.name}</Text>
                <Text style={styles.systemResultSubtitle}>
                  {system.state}
                  {system.domain ? ` • ${system.domain}` : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {selectedSystem ? (
          <View style={styles.portalPreviewCard}>
            <Text style={styles.portalPreviewEyebrow}>{selectedSystem.name}</Text>
            <Text style={styles.portalPreviewTitle}>
              {selectedPacket?.portal.name || 'Portal details'}
            </Text>
            {packetLoading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={styles.stateCardText}>Loading portal metadata...</Text>
              </View>
            ) : null}

            {packetError ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorCardTitle}>Portal data unavailable</Text>
                <Text style={styles.errorCardText}>{packetError}</Text>
              </View>
            ) : null}

            {selectedPacket && !packetLoading ? (
              <>
                {selectedPacket.portal.url ? (
                  <>
                    <Text style={styles.portalPreviewBody}>
                      {previewProfile ? formatPortalFamilyLabel(previewProfile.portalFamily) : 'Portal'} •{' '}
                      {formatPortalScope(selectedPacket.portal.scope || 'unknown')}
                    </Text>
                    <Text style={styles.portalPreviewLink}>{selectedPacket.portal.url}</Text>
                    <Text style={styles.portalPreviewBody}>
                      Last verified: {formatTimestamp(previewProfile?.lastVerifiedAt ?? null)}
                    </Text>

                    <View style={styles.portalCardActions}>
                      <Pressable
                        onPress={handleAddPortal}
                        style={({ pressed }) => [
                          styles.primaryButton,
                          pressed && styles.primaryButtonPressed,
                        ]}
                      >
                        <Text style={styles.primaryButtonText}>Add portal and open</Text>
                      </Pressable>

                      <Pressable
                        onPress={() => setSelectedSystem(null)}
                        style={({ pressed }) => [
                          styles.secondaryButton,
                          pressed && styles.secondaryButtonPressed,
                        ]}
                      >
                        <Text style={styles.secondaryButtonText}>Choose another</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <View style={styles.errorCard}>
                    <Text style={styles.errorCardTitle}>Portal URL not available yet</Text>
                    <Text style={styles.errorCardText}>
                      We found workflow data for this health system, but not a supported portal URL to open in the in-app browser yet.
                    </Text>
                  </View>
                )}
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  if (!ownerKey) {
    return (
      <View style={[styles.container, styles.centeredState]}>
        <Text style={styles.sectionTitle}>Sign in to manage portals</Text>
        <Text style={styles.sectionBody}>
          Portal profiles stay local to your signed-in Limbo account on this device.
        </Text>
      </View>
    );
  }

  if (activePortal) {
    return (
      <View style={styles.browserScreen}>
        <View style={[styles.browserChrome, { paddingTop: insets.top + 8 }]}>
          <View style={styles.browserTopRow}>
            <Pressable
              onPress={() => setActivePortalId(null)}
              style={({ pressed }) => [
                styles.inlineTextButton,
                pressed && styles.inlineTextButtonPressed,
              ]}
            >
              <Text style={styles.inlineTextButtonText}>Back</Text>
            </Pressable>

            <View style={styles.browserTitleWrap}>
              <Text style={styles.browserTitle}>{activePortal.displayName}</Text>
              <Text style={styles.browserSubtitle}>
                {formatPhaseLabel(sessionState?.phase ?? 'loading')} • {formatPortalFamilyLabel(activePortal.portalFamily)}
              </Text>
            </View>

            <Pressable
              onPress={handleBrowserReload}
              style={({ pressed }) => [
                styles.inlineTextButton,
                pressed && styles.inlineTextButtonPressed,
              ]}
            >
              <Text style={styles.inlineTextButtonText}>Reload</Text>
            </Pressable>
          </View>

          <View style={styles.assistCard}>
            <Text style={styles.assistCardTitle}>{assistCopy.title}</Text>
            <Text style={styles.assistCardBody}>{assistCopy.body}</Text>
            <View style={styles.browserActionWrap}>
              {activeHasCredential ? (
                <Pressable
                  onPress={handleUnlockAndFill}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.primaryButtonPressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>Unlock and fill</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={openCredentialModal}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.primaryButtonPressed,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>Save existing login</Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => setAssistEnabled((current) => !current)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>
                  {assistEnabled ? 'Take over' : 'Resume assist'}
                </Text>
              </Pressable>

              <Pressable
                onPress={openCredentialModal}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>
                  {activeHasCredential ? 'Update saved login' : 'Add login'}
                </Text>
              </Pressable>
            </View>
          </View>

          {sessionState?.suggestedActions.length ? (
            <View style={styles.suggestedActionsRow}>
              {sessionState.suggestedActions.map((action) => (
                <Pressable
                  key={action}
                  onPress={() => handleRunPortalAction(action)}
                  style={({ pressed }) => [
                    styles.actionPill,
                    pressed && styles.actionPillPressed,
                  ]}
                >
                  <Text style={styles.actionPillText}>
                    {action === 'openMessages'
                      ? 'Messages'
                      : action === 'openLabs'
                        ? 'Labs'
                        : action === 'openAppointments'
                          ? 'Appointments'
                          : 'Visit summaries'}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {browserError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorCardTitle}>Portal browser issue</Text>
            <Text style={styles.errorCardText}>{browserError}</Text>
          </View>
        ) : null}

        <View style={styles.webViewCard}>
          <WebView
            key={`${activePortal.id}-${browserReloadKey}`}
            ref={portalWebViewRef}
            source={{ uri: activePortal.loginUrl }}
            style={styles.webView}
            onMessage={handlePortalMessage}
            onNavigationStateChange={handleNavigationStateChange}
            onLoadEnd={requestPortalSnapshot}
            onError={(event) => {
              setBrowserError(event.nativeEvent.description || 'Unable to load the portal page.');
            }}
            injectedJavaScriptBeforeContentLoaded={buildPortalBridgeScript()}
            sharedCookiesEnabled
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
          />
        </View>

        <Modal
          animationType="slide"
          presentationStyle="pageSheet"
          transparent
          visible={isCredentialModalVisible}
          onRequestClose={() => setIsCredentialModalVisible(false)}
        >
          <View style={styles.modalScrim}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalWrap}
            >
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Saved portal login</Text>
                <Text style={styles.modalBody}>
                  The username and password stay on this device in secure storage and require biometrics to unlock.
                </Text>

                <TextInput
                  value={credentialUsername}
                  onChangeText={setCredentialUsername}
                  placeholder={activePortal.usernameHint}
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.modalInput}
                />

                <TextInput
                  value={credentialPassword}
                  onChangeText={setCredentialPassword}
                  placeholder="Password"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.modalInput}
                />

                <TextInput
                  value={credentialNotes}
                  onChangeText={setCredentialNotes}
                  placeholder="Notes, for example username is email"
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  autoCapitalize="sentences"
                  autoCorrect={false}
                  style={[styles.modalInput, styles.modalTextArea]}
                  multiline
                />

                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => setIsCredentialModalVisible(false)}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.secondaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.secondaryButtonText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    onPress={handleSaveCredential}
                    disabled={credentialSaving}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      (pressed || credentialSaving) && styles.primaryButtonPressed,
                    ]}
                  >
                    <Text style={styles.primaryButtonText}>
                      {credentialSaving ? 'Saving...' : 'Save to device'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 10,
            paddingBottom: insets.bottom + 120,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>User-assisted portal login</Text>
          <Text style={styles.heroTitle}>Keep portal access on device.</Text>
          <Text style={styles.heroBody}>
            Save a supported hospital portal locally, use biometric unlock to fill your login, and keep the live browser session inside Limbo when human steps appear.
          </Text>

          <View style={styles.heroPills}>
            {HERO_PILLS.map((pill) => (
              <View key={pill} style={styles.heroPill}>
                <Text style={styles.heroPillText}>{pill}</Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => setIsAddPanelOpen(true)}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
          >
            <Text style={styles.primaryButtonText}>Add portal</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Saved portals</Text>
          <Text style={styles.sectionBody}>
            The second tab is now the portal workspace, so this is where we reopen saved sessions and local logins.
          </Text>
        </View>

        {renderSavedPortals()}

        {isAddPanelOpen ? renderAddPortalPanel() : null}
      </ScrollView>
    </View>
  );
}

const createStyles = createThemedStyles((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centeredState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingHorizontal: 18,
    gap: 18,
  },
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 14,
  },
  heroEyebrow: {
    color: theme.colors.secondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '800',
  },
  heroBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
  },
  heroPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  heroPill: {
    borderRadius: 999,
    backgroundColor: theme.colors.secondarySoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroPillText: {
    color: theme.colors.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeader: {
    gap: 6,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  sectionBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  stateCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
    alignItems: 'flex-start',
  },
  stateCardTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  stateCardText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  portalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 10,
  },
  portalCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  portalCardHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  portalCardTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  portalCardSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  portalMetaText: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  credentialBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  credentialBadgeReady: {
    backgroundColor: theme.colors.successSoft,
    borderColor: theme.colors.success,
  },
  credentialBadgePending: {
    backgroundColor: theme.colors.warningSoft,
    borderColor: theme.colors.warning,
  },
  credentialBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  credentialBadgeTextReady: {
    color: theme.colors.success,
  },
  credentialBadgeTextPending: {
    color: theme.colors.warning,
  },
  portalCardActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.84,
  },
  primaryButtonText: {
    color: theme.colors.primaryForeground,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  addPanel: {
    backgroundColor: theme.colors.surface,
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 14,
  },
  addPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  addPanelDismiss: {
    color: theme.colors.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  searchInput: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    backgroundColor: theme.colors.inputBackground,
    color: theme.colors.text,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  systemResults: {
    gap: 10,
  },
  systemResultCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 16,
    gap: 4,
  },
  systemResultCardPressed: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  systemResultTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  systemResultSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  portalPreviewCard: {
    borderRadius: 20,
    backgroundColor: theme.colors.backgroundSubtle,
    padding: 18,
    gap: 10,
  },
  portalPreviewEyebrow: {
    color: theme.colors.secondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  portalPreviewTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  portalPreviewBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  portalPreviewLink: {
    color: theme.colors.secondary,
    fontSize: 13,
    lineHeight: 19,
  },
  errorCard: {
    borderRadius: 20,
    backgroundColor: theme.colors.dangerSoft,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    gap: 6,
  },
  errorCardTitle: {
    color: theme.colors.danger,
    fontSize: 15,
    fontWeight: '800',
  },
  errorCardText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  browserScreen: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSubtle,
  },
  browserChrome: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  browserTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  browserTitleWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  browserTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  browserSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  inlineTextButton: {
    minHeight: 36,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineTextButtonPressed: {
    opacity: 0.75,
  },
  inlineTextButtonText: {
    color: theme.colors.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  assistCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 10,
  },
  assistCardTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  assistCardBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  browserActionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  suggestedActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionPill: {
    borderRadius: 999,
    backgroundColor: theme.colors.secondarySoft,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  actionPillPressed: {
    opacity: 0.82,
  },
  actionPillText: {
    color: theme.colors.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  webViewCard: {
    flex: 1,
    margin: 14,
    marginTop: 12,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  webView: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  modalScrim: {
    flex: 1,
    backgroundColor: theme.colors.overlayStrong,
    justifyContent: 'flex-end',
  },
  modalWrap: {
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 14,
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  modalBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  modalInput: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    backgroundColor: theme.colors.inputBackground,
    color: theme.colors.text,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  modalTextArea: {
    minHeight: 92,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
}));
