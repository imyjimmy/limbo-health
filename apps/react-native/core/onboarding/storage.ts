import * as SecureStore from 'expo-secure-store';

const LOCAL_ONBOARDING_COMPLETE_KEY = 'limbo_local_onboarding_complete_v1';

export async function readLocalOnboardingComplete(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(LOCAL_ONBOARDING_COMPLETE_KEY)) === '1';
  } catch (error) {
    console.warn('[OnboardingStorage] Failed to read onboarding completion flag', error);
    return false;
  }
}

export async function markLocalOnboardingComplete(): Promise<void> {
  try {
    await SecureStore.setItemAsync(LOCAL_ONBOARDING_COMPLETE_KEY, '1');
  } catch (error) {
    console.warn('[OnboardingStorage] Failed to persist onboarding completion flag', error);
  }
}

export async function clearLocalOnboardingComplete(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(LOCAL_ONBOARDING_COMPLETE_KEY);
  } catch (error) {
    console.warn('[OnboardingStorage] Failed to clear onboarding completion flag', error);
  }
}
