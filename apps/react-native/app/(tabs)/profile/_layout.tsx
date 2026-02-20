import { Stack } from 'expo-router/stack';

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Profile' }} />
      <Stack.Screen
        name="account"
        options={{
          headerShown: true,
          title: 'Account',
          headerBackButtonDisplayMode: 'default',
          headerStyle: { backgroundColor: '#0f1923' },
          headerTintColor: '#007AFF',
          headerTitleStyle: { color: '#ffffff' },
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
