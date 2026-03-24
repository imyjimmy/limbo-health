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
import {
  resolveBioProfileOwnerKeys,
  storageKeyForBioProfileOwner,
} from '../core/bio/storage';

type BioProfileStatus = 'loading' | 'ready';

interface BioProfileContextValue {
  status: BioProfileStatus;
  profile: BioProfile | null;
  hasProfile: boolean;
  suggestedProfile: BioProfile;
  saveProfile: (profile: BioProfile) => Promise<void>;
  clearProfile: () => Promise<void>;
}

const BioProfileContext = createContext<BioProfileContextValue | null>(null);

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

  const suggestedEmail = useMemo(
    () => state.googleProfile?.email?.trim() || '',
    [state.googleProfile?.email],
  );

  const defaultProfile = useMemo(
    () => emptyBioProfile(suggestedFullName || '', suggestedEmail),
    [suggestedEmail, suggestedFullName],
  );

  const suggestedProfile = useMemo(
    () => ({
      ...defaultProfile,
      ...(profile ?? {}),
    }),
    [defaultProfile, profile],
  );

  const ownerKeys = useMemo(
    () =>
      resolveBioProfileOwnerKeys({
        status: state.status,
        pubkey: state.pubkey,
        googleProfile: state.googleProfile,
        connections: state.connections,
      }),
    [state.status, state.pubkey, state.googleProfile, state.connections],
  );
  const ownerKey = ownerKeys[0] ?? null;

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
        let raw: string | null = null;
        let loadedFromOwnerKey: string | null = null;

        for (const candidateOwnerKey of ownerKeys) {
          raw = await SecureStore.getItemAsync(storageKeyForBioProfileOwner(candidateOwnerKey));
          if (raw) {
            loadedFromOwnerKey = candidateOwnerKey;
            break;
          }
        }
        if (cancelled) return;

        if (!raw) {
          setProfile(null);
          setStatus('ready');
          return;
        }

        const parsed = JSON.parse(raw) as Partial<BioProfile>;
        const normalizedProfile = {
          ...defaultProfile,
          ...parsed,
        };
        setProfile(isBioProfileComplete(normalizedProfile) ? normalizedProfile : normalizedProfile);

        if (loadedFromOwnerKey && loadedFromOwnerKey !== ownerKey) {
          try {
            await SecureStore.setItemAsync(storageKeyForBioProfileOwner(ownerKey), raw);
          } catch (error) {
            console.warn(
              '[BioProfileProvider] Failed to migrate bio profile to linked owner key',
              error,
            );
          }
        }
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
  }, [defaultProfile, ownerKey, ownerKeys]);

  const saveProfile = useCallback(
    async (nextProfile: BioProfile) => {
      if (!ownerKey) {
        throw new Error('You must be signed in before saving your personal info.');
      }

      await SecureStore.setItemAsync(
        storageKeyForBioProfileOwner(ownerKey),
        JSON.stringify({
          ...nextProfile,
          fullName: nextProfile.fullName.trim(),
          dateOfBirth: nextProfile.dateOfBirth.trim(),
          phoneNumber: nextProfile.phoneNumber.trim(),
          email: nextProfile.email.trim(),
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
        phoneNumber: nextProfile.phoneNumber.trim(),
        email: nextProfile.email.trim(),
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
    if (ownerKeys.length === 0) return;
    await Promise.all(
      ownerKeys.map((candidateOwnerKey) =>
        SecureStore.deleteItemAsync(storageKeyForBioProfileOwner(candidateOwnerKey)),
      ),
    );
    setProfile(null);
  }, [ownerKeys]);

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
