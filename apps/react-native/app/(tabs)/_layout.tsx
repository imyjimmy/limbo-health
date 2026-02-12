// app/(tabs)/_layout.tsx
// Authenticated tab navigator. Placeholder for Week 2.

import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#fff' },
        tabBarActiveTintColor: '#111',
        tabBarInactiveTintColor: '#999',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Binders' }}
      />
    </Tabs>
  );
}