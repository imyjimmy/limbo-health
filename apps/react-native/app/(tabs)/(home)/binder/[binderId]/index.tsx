// app/binder/[binderId]/index.tsx
// Root directory — delegates to the shared BinderDirectory component.

import { useLocalSearchParams } from 'expo-router';
import { BinderDirectory } from '../../../../../components/binder/BinderDirectory';

export default function BinderRootScreen() {
  const { binderId } = useLocalSearchParams<{ binderId: string }>();
  return <BinderDirectory binderId={binderId!} dirPath="" title="Binder" />;
}
