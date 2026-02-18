// app/(auth)/welcome.tsx
// First launch screen. OAuth providers are the primary CTAs; Nostr tucked at bottom.

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useGoogleAuth } from '../../core/auth/googleAuth';
import { useAuthContext } from '../../providers/AuthProvider';

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

function AppleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#000"
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09z"
      />
      <Path
        fill="#000"
        d="M15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
      />
    </Svg>
  );
}

function GitHubLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#333"
        d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
      />
    </Svg>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const { loginWithGoogle } = useAuthContext();
  const { request, response, promptAsync } = useGoogleAuth();
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.accessToken) {
      setGoogleLoading(true);
      loginWithGoogle(response.authentication.accessToken)
        .then(() => router.replace('/(tabs)'))
        .catch((err) => {
          Alert.alert('Google Login Failed', err.message);
        })
        .finally(() => setGoogleLoading(false));
    }
  }, [response]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Limbo Health</Text>
        <Text style={styles.subtitle}>
          Your medical records, encrypted and under your control.
        </Text>
      </View>

      <View style={styles.buttons}>
        <Pressable
          style={[styles.authButton, (!request || googleLoading) && styles.buttonDisabled]}
          onPress={() => promptAsync()}
          disabled={!request || googleLoading}
        >
          {googleLoading ? (
            <ActivityIndicator color="#111" />
          ) : (
            <View style={styles.buttonContent}>
              <GoogleLogo size={20} />
              <Text style={styles.authButtonText}>Continue with Google</Text>
            </View>
          )}
        </Pressable>

        <Pressable
          style={[styles.authButton, styles.buttonDisabled]}
          disabled
        >
          <View style={styles.buttonContent}>
            <AppleLogo size={20} />
            <Text style={styles.authButtonText}>Continue with Apple</Text>
          </View>
        </Pressable>

        <Pressable
          style={[styles.authButton, styles.buttonDisabled]}
          disabled
        >
          <View style={styles.buttonContent}>
            <GitHubLogo size={20} />
            <Text style={styles.authButtonText}>Continue with GitHub</Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Pressable onPress={() => router.push('/(auth)/import-key')}>
          <Text style={styles.nostrLink}>I have a Nostr key --&gt;</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 17,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  buttons: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  authButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  authButtonText: {
    color: '#111',
    fontSize: 17,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 48,
  },
  nostrLink: {
    color: '#8d45dd',
    fontSize: 16,
  },
});
