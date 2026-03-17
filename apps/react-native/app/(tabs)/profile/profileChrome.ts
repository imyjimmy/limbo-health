import type { AppTheme } from '../../../theme';

export function getProfileChrome(theme: AppTheme) {
  const isDark = theme.mode === 'dark';

  return {
    pageBackground: isDark ? theme.colors.headerBackground : theme.colors.backgroundSubtle,
    headerBackground: isDark ? theme.colors.chromeSurface : theme.colors.surface,
    cardBackground: isDark ? theme.colors.chromeSurface : theme.colors.surface,
    cardPressed: isDark ? theme.colors.chromeSurfacePressed : theme.colors.surfaceSubtle,
    divider: isDark ? theme.colors.chromeBorder : theme.colors.border,
    primaryText: isDark ? theme.colors.headerText : theme.colors.text,
    secondaryText: isDark ? theme.colors.chromeTextMuted : theme.colors.textMuted,
    subtleSurface: isDark ? theme.colors.chromeSurfacePressed : theme.colors.background,
  };
}
