import { Stack } from 'expo-router/stack';
import { useTheme } from '../../theme';

export default function LegalLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackButtonDisplayMode: 'default',
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { color: theme.colors.text },
        contentStyle: { backgroundColor: theme.colors.backgroundSubtle },
      }}
    >
      <Stack.Screen
        name="privacy-policy"
        options={{ title: 'Privacy Policy' }}
      />
      <Stack.Screen
        name="terms-of-service"
        options={{ title: 'Terms of Service' }}
      />
    </Stack>
  );
}
