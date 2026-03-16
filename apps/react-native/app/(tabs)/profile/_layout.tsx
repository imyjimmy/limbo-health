import { Stack } from 'expo-router/stack';
import { useTheme } from '../../../theme';

export default function ProfileLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Profile' }} />
      <Stack.Screen
        name="account"
        options={{
          headerShown: true,
          title: 'Account',
          headerBackButtonDisplayMode: 'default',
          headerStyle: { backgroundColor: theme.colors.headerBackground },
          headerTintColor: theme.colors.secondary,
          headerTitleStyle: { color: theme.colors.headerText },
        }}
      />
      <Stack.Screen
        name="personal-info"
        options={{
          headerShown: true,
          title: 'My Personal Info',
          headerBackButtonDisplayMode: 'default',
          headerStyle: { backgroundColor: theme.colors.headerBackground },
          headerTintColor: theme.colors.secondary,
          headerTitleStyle: { color: theme.colors.headerText },
        }}
      />
      <Stack.Screen
        name="encryption-keys"
        options={{
          headerShown: true,
          title: 'Encryption Keys',
          headerBackButtonDisplayMode: 'default',
        }}
      />
    </Stack>
  );
}
