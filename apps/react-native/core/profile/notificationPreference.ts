import * as SecureStore from 'expo-secure-store';

const NOTIFICATIONS_ENABLED_KEY = 'profile.notifications.enabled';

export async function getNotificationsEnabledPreference(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(NOTIFICATIONS_ENABLED_KEY)) !== '0';
  } catch {
    return true;
  }
}

export async function setNotificationsEnabledPreference(enabled: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(NOTIFICATIONS_ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // Keep the toggle usable even if local persistence is temporarily unavailable.
  }
}
