import { Stack } from 'expo-router/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HomeStack() {
  const insets = useSafeAreaInsets();

  return (
    <Stack
      screenOptions={{
        contentStyle: { paddingTop: 0 },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="binder"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
