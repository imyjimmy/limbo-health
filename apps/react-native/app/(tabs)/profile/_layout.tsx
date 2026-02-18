import { Stack } from 'expo-router/stack';

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Profile' }} />
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
