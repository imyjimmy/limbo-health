import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { useAuthContext } from './AuthProvider';
import { emptyBioProfile, isBioProfileComplete, type BioProfile } from '../types/bio';

type BioProfileStatus = 'loading' | 'ready';

interface BioProfileContextValue {
  status: BioProfileStatus;
  profile: BioProfile | null;
  hasProfile: boolean;
  suggestedProfile: BioProfile;
  saveProfile: (profile: BioProfile) => Promise<void>;
  clearProfile: () => Promise<void>;
}

const STORAGE_KEY_PREFIX = 'limbo_bio_profile_v1';

const BioProfileContext = createContext<BioProfileContextValue | null>(null);

function ownerKeyForAuthState(
  status: string,
  pubkey: string | null,
  loginMethod: string | null,
  googleId?: string | null,
  googleEmail?: string | null,
): string | null {
  if (status !== 'authenticated' && status !== 'expired') return null;

  if (pubkey) return `nostr:${pubkey}`;
  if (loginMethod === 'google' && googleId) return `google-id:${googleId}`;
  if (loginMethod === 'google' && googleEmail) return `google-email:${googleEmail}`;
  return null;
}

function storageKeyForOwner(ownerKey: string): string {
  return `${STORAGE_KEY_PREFIX}:${encodeURIComponent(ownerKey)}`;
}

export function BioProfileProvider({ children }: { children: React.ReactNode }) {
  const { state } = useAuthContext();
  const [status, setStatus] = useState<BioProfileStatus>('loading');
  const [profile, setProfile] = useState<BioProfile | null>(null);

  const suggestedFullName = useMemo(() => {
    return (
      state.metadata?.name ||
      state.googleProfile?.name ||
      [state.metadata?.first_name, state.metadata?.last_name].filter(Boolean).join(' ').trim()
    );
  }, [
    state.metadata?.name,
    state.metadata?.first_name,
    state.metadata?.last_name,
    state.googleProfile?.name,
  ]);

  const suggestedProfile = useMemo(
    () => ({
      ...emptyBioProfile(suggestedFullName || ''),
      ...(profile ?? {}),
    }),
    [profile, suggestedFullName],
  );

  const ownerKey = useMemo(
    () =>
      ownerKeyForAuthState(
        state.status,
        state.pubkey,
        state.loginMethod,
        state.googleProfile?.googleId ?? null,
        state.googleProfile?.email ?? null,
      ),
    [
      state.status,
      state.pubkey,
      state.loginMethod,
      state.googleProfile?.googleId,
      state.googleProfile?.email,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!ownerKey) {
        setProfile(null);
        setStatus('ready');
        return;
      }

      setStatus('loading');

      try {
        const raw = await SecureStore.getItemAsync(storageKeyForOwner(ownerKey));
        if (cancelled) return;

        if (!raw) {
          setProfile(null);
          setStatus('ready');
          return;
        }

        const parsed = JSON.parse(raw) as BioProfile;
        setProfile(isBioProfileComplete(parsed) ? parsed : parsed);
      } catch (error) {
        console.warn('[BioProfileProvider] Failed to load bio profile', error);
        if (!cancelled) {
          setProfile(null);
        }
      } finally {
        if (!cancelled) {
          setStatus('ready');
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [ownerKey]);

  const saveProfile = useCallback(
    async (nextProfile: BioProfile) => {
      if (!ownerKey) {
        throw new Error('You must be signed in before saving your bio profile.');
      }

      await SecureStore.setItemAsync(
        storageKeyForOwner(ownerKey),
        JSON.stringify({
          ...nextProfile,
          fullName: nextProfile.fullName.trim(),
          dateOfBirth: nextProfile.dateOfBirth.trim(),
          addressLine1: nextProfile.addressLine1.trim(),
          addressLine2: nextProfile.addressLine2.trim(),
          city: nextProfile.city.trim(),
          state: nextProfile.state.trim(),
          postalCode: nextProfile.postalCode.trim(),
        }),
      );

      setProfile({
        ...nextProfile,
        fullName: nextProfile.fullName.trim(),
        dateOfBirth: nextProfile.dateOfBirth.trim(),
        addressLine1: nextProfile.addressLine1.trim(),
        addressLine2: nextProfile.addressLine2.trim(),
        city: nextProfile.city.trim(),
        state: nextProfile.state.trim(),
        postalCode: nextProfile.postalCode.trim(),
      });
    },
    [ownerKey],
  );

  const clearProfile = useCallback(async () => {
    if (!ownerKey) return;
    await SecureStore.deleteItemAsync(storageKeyForOwner(ownerKey));
    setProfile(null);
  }, [ownerKey]);

  const value = useMemo<BioProfileContextValue>(
    () => ({
      status,
      profile,
      hasProfile: isBioProfileComplete(profile),
      suggestedProfile,
      saveProfile,
      clearProfile,
    }),
    [status, profile, suggestedProfile, saveProfile, clearProfile],
  );

  return <BioProfileContext.Provider value={value}>{children}</BioProfileContext.Provider>;
}

export function useBioProfile() {
  const ctx = useContext(BioProfileContext);
  if (!ctx) {
    throw new Error('useBioProfile must be used inside BioProfileProvider');
  }
  return ctx;
}
