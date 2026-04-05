import { Stack } from 'expo-router/stack';
import { useTheme } from '../../../theme';
import { getProfileChrome } from './profileChrome';

export default function ProfileLayout() {
  const theme = useTheme();
  const chrome = getProfileChrome(theme);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Profile' }} />
      <Stack.Screen
        name="account"
        options={{
          headerShown: true,
          title: 'Account',
          headerBackButtonDisplayMode: 'default',
          headerStyle: { backgroundColor: chrome.headerBackground },
          headerTintColor: chrome.primaryText,
          headerTitleStyle: { color: chrome.primaryText },
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          headerShown: true,
          title: 'Settings',
          headerBackButtonDisplayMode: 'default',
          headerStyle: { backgroundColor: chrome.headerBackground },
          headerTintColor: chrome.primaryText,
          headerTitleStyle: { color: chrome.primaryText },
        }}
      />
      <Stack.Screen
        name="medical-info"
        options={{
          headerShown: true,
          title: 'My Medical Info',
          headerBackButtonDisplayMode: 'default',
          headerStyle: { backgroundColor: chrome.headerBackground },
          headerTintColor: chrome.primaryText,
          headerTitleStyle: { color: chrome.primaryText },
        }}
      />
      <Stack.Screen
        name="encryption-keys"
        options={{
          headerShown: true,
          title: 'Encryption Keys',
          headerBackButtonDisplayMode: 'default',
          headerStyle: { backgroundColor: chrome.headerBackground },
          headerTintColor: chrome.primaryText,
          headerTitleStyle: { color: chrome.primaryText },
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          headerShown: true,
          title: 'Notifications',
          headerBackButtonDisplayMode: 'default',
          headerStyle: { backgroundColor: chrome.headerBackground },
          headerTintColor: chrome.primaryText,
          headerTitleStyle: { color: chrome.primaryText },
        }}
      />
      <Stack.Screen
        name="about"
        options={{
          headerShown: true,
          title: 'About',
          headerBackButtonDisplayMode: 'default',
          headerStyle: { backgroundColor: chrome.headerBackground },
          headerTintColor: chrome.primaryText,
          headerTitleStyle: { color: chrome.primaryText },
        }}
      />
    </Stack>
  );
}
