import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

const FORCE_MOCK_MEDIA = process.env.EXPO_PUBLIC_MOCK_MEDIA === '1';

export function shouldUseMockMedia(): boolean {
  if (FORCE_MOCK_MEDIA) return true;
  if (!__DEV__) return false;
  if (Platform.OS !== 'ios') return false;

  // iOS simulator paths include CoreSimulator. Real devices do not.
  return RNFS.DocumentDirectoryPath.includes('CoreSimulator');
}
