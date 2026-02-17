// app/binder/[binderId]/browse/[...path].tsx
// Subdirectory — delegates to the shared BinderDirectory component.

import { useLocalSearchParams } from 'expo-router';
import { BinderDirectory } from '../../../../../../components/binder/BinderDirectory';

export default function BrowseDirectoryScreen() {
  const { binderId, path } = useLocalSearchParams<{
    binderId: string;
    path: string[];
  }>();
  const dirPath = Array.isArray(path) ? path.join('/') : (path ?? '');
  const title = formatBreadcrumb(dirPath);
  return <BinderDirectory binderId={binderId!} dirPath={dirPath} title={title} />;
}

function formatBreadcrumb(dirPath: string): string {
  const last = dirPath.split('/').pop() ?? dirPath;
  return last
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
