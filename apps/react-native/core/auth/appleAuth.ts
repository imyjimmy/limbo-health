import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

export interface AppleLoginPayload {
  identityToken: string;
  user: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
}

function asNonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatAppleName(fullName: AppleAuthentication.AppleAuthenticationFullName | null): {
  firstName: string | null;
  lastName: string | null;
  name: string | null;
} {
  const firstName = asNonEmptyString(fullName?.givenName);
  const lastName = asNonEmptyString(fullName?.familyName);
  const name = [firstName, lastName].filter(Boolean).join(' ').trim() || null;

  return { firstName, lastName, name };
}

export function useAppleAuth() {
  const [isAvailable, setIsAvailable] = useState(Platform.OS === 'ios');

  useEffect(() => {
    let active = true;

    if (Platform.OS !== 'ios') {
      setIsAvailable(false);
      return () => {
        active = false;
      };
    }

    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (active) {
          setIsAvailable(available);
        }
      })
      .catch(() => {
        if (active) {
          setIsAvailable(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const signInAsync = useCallback(async (): Promise<AppleLoginPayload> => {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      throw new Error('Apple did not return an identity token.');
    }

    const { firstName, lastName, name } = formatAppleName(credential.fullName ?? null);

    return {
      identityToken: credential.identityToken,
      user: credential.user,
      email: asNonEmptyString(credential.email),
      firstName,
      lastName,
      name,
    };
  }, []);

  return {
    isAvailable,
    signInAsync,
  };
}
