import { Stack } from 'expo-router';
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
          headerShown: true,
          headerStatusBarHeight: insets.top,
        }}
      />
    </Stack>
  );
}
