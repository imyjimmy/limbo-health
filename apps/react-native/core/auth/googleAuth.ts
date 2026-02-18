// core/auth/googleAuth.ts
// Thin wrapper around expo-auth-session for Google OAuth.

import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

// Needed for redirect after auth on iOS
WebBrowser.maybeCompleteAuthSession();

// TODO: Replace with your actual iOS client ID from Google Cloud Console
const IOS_CLIENT_ID = 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com';

export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: IOS_CLIENT_ID,
  });

  return { request, response, promptAsync };
}
