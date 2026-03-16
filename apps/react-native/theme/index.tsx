import React, {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';
import {
  StyleSheet,
  useColorScheme,
  type ViewStyle,
  type TextStyle,
  type ImageStyle,
} from 'react-native';
import {
  ACTIVE_THEME_NAME,
  resolveTheme,
  type AppTheme,
  type ThemeMode,
  type ThemeName,
  type ThemeColors,
} from './themes';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

const ThemeContext = createContext<AppTheme | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const mode: ThemeMode = systemScheme === 'dark' ? 'dark' : 'light';
  const theme = useMemo(() => resolveTheme(ACTIVE_THEME_NAME, mode), [mode]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return theme;
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
