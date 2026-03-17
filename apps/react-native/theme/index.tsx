import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  StyleSheet,
  useColorScheme,
  type ViewStyle,
  type TextStyle,
  type ImageStyle,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  ACTIVE_THEME_NAME,
  resolveTheme,
  type AppTheme,
  type ThemeMode,
  type ThemeName,
  type ThemeColors,
} from './themes';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

const THEME_MODE_PREFERENCE_KEY = 'limbo.theme.modePreference';

type ThemeContextValue = {
  theme: AppTheme;
  modePreference: ThemeMode | null;
  resolvedMode: ThemeMode;
  isPreferenceLoaded: boolean;
  setModePreference: (mode: ThemeMode) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [modePreference, setModePreferenceState] = useState<ThemeMode | null>(null);
  const [isPreferenceLoaded, setIsPreferenceLoaded] = useState(false);
  const systemMode: ThemeMode = systemScheme === 'dark' ? 'dark' : 'light';
  const resolvedMode = modePreference ?? systemMode;

  useEffect(() => {
    let cancelled = false;

    async function loadModePreference() {
      try {
        const storedValue = await SecureStore.getItemAsync(THEME_MODE_PREFERENCE_KEY);
        if (!cancelled && (storedValue === 'light' || storedValue === 'dark')) {
          setModePreferenceState(storedValue);
        }
      } catch (error) {
        console.warn('[ThemeProvider] Failed to load theme mode preference', error);
      } finally {
        if (!cancelled) {
          setIsPreferenceLoaded(true);
        }
      }
    }

    loadModePreference();

    return () => {
      cancelled = true;
    };
  }, []);

  const setModePreference = useCallback(async (mode: ThemeMode) => {
    setModePreferenceState(mode);
    try {
      await SecureStore.setItemAsync(THEME_MODE_PREFERENCE_KEY, mode);
    } catch (error) {
      console.warn('[ThemeProvider] Failed to persist theme mode preference', error);
    }
  }, []);

  const theme = useMemo(
    () => resolveTheme(ACTIVE_THEME_NAME, resolvedMode),
    [resolvedMode],
  );

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme,
      modePreference,
      resolvedMode,
      isPreferenceLoaded,
      setModePreference,
    }),
    [theme, modePreference, resolvedMode, isPreferenceLoaded, setModePreference],
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context.theme;
}

export function useThemeModePreference() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeModePreference must be used within ThemeProvider');
  }
  return {
    modePreference: context.modePreference,
    resolvedMode: context.resolvedMode,
    isPreferenceLoaded: context.isPreferenceLoaded,
    setModePreference: context.setModePreference,
  };
}

export function useThemedStyles<T extends NamedStyles<T>>(
  factory: (theme: AppTheme) => T,
): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}

export function createThemedStyles<T extends NamedStyles<T>>(
  factory: (theme: AppTheme) => T,
) {
  return (theme: AppTheme) => StyleSheet.create(factory(theme));
}

export type { AppTheme, ThemeColors, ThemeMode, ThemeName };
export { ACTIVE_THEME_NAME, resolveTheme, themeRegistry } from './themes';
