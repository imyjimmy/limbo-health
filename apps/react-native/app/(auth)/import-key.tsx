// app/(auth)/import-key.tsx
// Route wrapper for unauthenticated import-key flow (from welcome screen).

import { useLocalSearchParams } from 'expo-router';
import ImportKeyForm from '../../components/auth/ImportKeyForm';

export default function ImportKeyRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <ImportKeyForm mode={mode === 'keyOnly' ? 'keyOnly' : undefined} />;
}
