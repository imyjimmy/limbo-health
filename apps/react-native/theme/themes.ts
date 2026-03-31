export type ThemeName = 'deepGreen' | 'warmBrand';
export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  backgroundSubtle: string;
  surface: string;
  surfaceSubtle: string;
  surfaceElevated: string;
  surfaceInverse: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  border: string;
  borderStrong: string;
  inputBackground: string;
  inputBorder: string;
  inputPlaceholder: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
  focusRing: string;
  success: string;
  successForeground: string;
  approvalFill: string;
  approvalBorder: string;
  approvalText: string;
  warning: string;
  warningForeground: string;
  danger: string;
  dangerForeground: string;
  overlay: string;
  overlayMuted: string;
  overlayStrong: string;
  tabBarBackground: string;
  tabBarBorder: string;
  tabIconActive: string;
  tabIconInactive: string;
  headerBackground: string;
  headerText: string;
  chromeSurface: string;
  chromeSurfacePressed: string;
  chromeBorder: string;
  chromeTextMuted: string;
  logoPanelBackground: string;
  logoPanelBorder: string;
  logoTileBackground: string;
  logoTileBorder: string;
  logoFallbackBackground: string;
  logoFallbackText: string;
  primarySoft: string;
  secondarySoft: string;
  successSoft: string;
  warningSoft: string;
  dangerSoft: string;
  editorBackground: string;
  editorText: string;
  editorQuoteBorder: string;
  editorQuoteText: string;
  editorCodeBackground: string;
  editorPreBackground: string;
}

export interface AppTheme {
  name: ThemeName;
  mode: ThemeMode;
  colors: ThemeColors;
}

interface ThemeDefinition {
  variants: Record<ThemeMode, ThemeColors>;
}

export const ACTIVE_THEME_NAME: ThemeName = 'deepGreen';

export const themeRegistry: Record<ThemeName, ThemeDefinition> = {
  deepGreen: {
    variants: {
      light: {
        background: '#F5F8FF',
        backgroundSubtle: '#F8FAFC',
        surface: '#FFFFFF',
        surfaceSubtle: '#F8FAFC',
        surfaceElevated: '#FFFFFF',
        surfaceInverse: '#0F1923',
        text: '#0F172A',
        textSecondary: '#475569',
        textMuted: '#64748B',
        textInverse: '#FFFFFF',
        border: '#CBD5E1',
        borderStrong: '#94A3B8',
        inputBackground: '#F8FAFC',
        inputBorder: '#CBD5E1',
        inputPlaceholder: '#94A3B8',
        primary: '#0F766E',
        primaryForeground: '#FFFFFF',
        secondary: '#2563EB',
        secondaryForeground: '#FFFFFF',
        accent: '#7C3AED',
        accentForeground: '#FFFFFF',
        focusRing: '#2563EB',
        success: '#16A34A',
        successForeground: '#FFFFFF',
        approvalFill: '#DDF8C8',
        approvalBorder: '#62B23E',
        approvalText: '#1F4D1A',
        warning: '#D97706',
        warningForeground: '#FFFFFF',
        danger: '#E11D48',
        dangerForeground: '#FFFFFF',
        overlay: 'rgba(15, 23, 42, 0.18)',
        overlayMuted: 'rgba(15, 23, 42, 0.08)',
        overlayStrong: 'rgba(15, 23, 42, 0.6)',
        tabBarBackground: '#0F1923',
        tabBarBorder: 'rgba(255, 255, 255, 0.08)',
        tabIconActive: '#FFFFFF',
        tabIconInactive: '#CECECE',
        headerBackground: '#0F1923',
        headerText: '#FFFFFF',
        chromeSurface: '#162430',
        chromeSurfacePressed: '#203242',
        chromeBorder: '#2D455C',
        chromeTextMuted: '#A7B8CA',
        logoPanelBackground: '#EDF3F8',
        logoPanelBorder: '#D7E2EC',
        logoTileBackground: '#FFFFFF',
        logoTileBorder: '#D5DFE8',
        logoFallbackBackground: '#E6EDF4',
        logoFallbackText: '#31465A',
        primarySoft: '#D6F5EE',
        secondarySoft: '#DBEAFE',
        successSoft: '#DCFCE7',
        warningSoft: '#FEF3C7',
        dangerSoft: '#FDE2E8',
        editorBackground: '#FFFFFF',
        editorText: '#0F172A',
        editorQuoteBorder: '#CBD5E1',
        editorQuoteText: '#475569',
        editorCodeBackground: '#F0F5FA',
        editorPreBackground: '#F8FAFC',
      },
      dark: {
        background: '#081018',
        backgroundSubtle: '#0F1923',
        surface: '#111E29',
        surfaceSubtle: '#152432',
        surfaceElevated: '#1A2B3A',
        surfaceInverse: '#F5F8FF',
        text: '#E5EEF8',
        textSecondary: '#B7C7D7',
        textMuted: '#8FA5BB',
        textInverse: '#0F172A',
        border: '#274156',
        borderStrong: '#3C5C75',
        inputBackground: '#152432',
        inputBorder: '#274156',
        inputPlaceholder: '#6E879D',
        primary: '#32B5A6',
        primaryForeground: '#081018',
        secondary: '#6AA2FF',
        secondaryForeground: '#081018',
        accent: '#B995FF',
        accentForeground: '#081018',
        focusRing: '#6AA2FF',
        success: '#4ADE80',
        successForeground: '#081018',
        approvalFill: '#1D4A1B',
        approvalBorder: '#84D65D',
        approvalText: '#E9F9DF',
        warning: '#FBBF24',
        warningForeground: '#081018',
        danger: '#FB7185',
        dangerForeground: '#081018',
        overlay: 'rgba(8, 16, 24, 0.22)',
        overlayMuted: 'rgba(229, 238, 248, 0.08)',
        overlayStrong: 'rgba(0, 0, 0, 0.72)',
        tabBarBackground: '#0B131B',
        tabBarBorder: 'rgba(229, 238, 248, 0.1)',
        tabIconActive: '#E5EEF8',
        tabIconInactive: '#7D94A8',
        headerBackground: '#0B131B',
        headerText: '#E5EEF8',
        chromeSurface: '#13202C',
        chromeSurfacePressed: '#1B2D3C',
        chromeBorder: '#2C455B',
        chromeTextMuted: '#AFC2D4',
        logoPanelBackground: '#152432',
        logoPanelBorder: '#152432',
        logoTileBackground: '#FFFFFF',
        logoTileBorder: '#D5DFE8',
        logoFallbackBackground: '#E6EDF4',
        logoFallbackText: '#31465A',
        primarySoft: '#103E3A',
        secondarySoft: '#182B4E',
        successSoft: '#163322',
        warningSoft: '#3D2B09',
        dangerSoft: '#3B1623',
        editorBackground: '#111E29',
        editorText: '#E5EEF8',
        editorQuoteBorder: '#3C5C75',
        editorQuoteText: '#B7C7D7',
        editorCodeBackground: '#152432',
        editorPreBackground: '#0F1923',
      },
    },
  },
  warmBrand: {
    variants: {
      light: {
        background: '#F9F1E4',
        backgroundSubtle: '#FFF8EF',
        surface: '#FFFFFF',
        surfaceSubtle: '#FFF4EB',
        surfaceElevated: '#FFFFFF',
        surfaceInverse: '#0E0E0E',
        text: '#242424',
        textSecondary: '#5E4A43',
        textMuted: '#7A635B',
        textInverse: '#F9F1E4',
        border: '#E2D3C4',
        borderStrong: '#CDB49F',
        inputBackground: '#FFF8EF',
        inputBorder: '#D8C0AB',
        inputPlaceholder: '#9A7E72',
        primary: '#ED654D',
        primaryForeground: '#FFFFFF',
        secondary: '#A1301F',
        secondaryForeground: '#FFFFFF',
        accent: '#F28872',
        accentForeground: '#242424',
        focusRing: '#ED654D',
        success: '#4D7A3D',
        successForeground: '#FFFFFF',
        approvalFill: '#DDF8C8',
        approvalBorder: '#62B23E',
        approvalText: '#1F4D1A',
        warning: '#B97718',
        warningForeground: '#FFFFFF',
        danger: '#C14D39',
        dangerForeground: '#FFFFFF',
        overlay: 'rgba(36, 36, 36, 0.12)',
        overlayMuted: 'rgba(36, 36, 36, 0.06)',
        overlayStrong: 'rgba(14, 14, 14, 0.58)',
        tabBarBackground: '#1E1A19',
        tabBarBorder: 'rgba(249, 241, 228, 0.1)',
        tabIconActive: '#F9F1E4',
        tabIconInactive: '#D0BDAA',
        headerBackground: '#1E1A19',
        headerText: '#F9F1E4',
        chromeSurface: '#2A221F',
        chromeSurfacePressed: '#342A27',
        chromeBorder: '#5A463E',
        chromeTextMuted: '#CEB8AB',
        logoPanelBackground: '#F7EEE4',
        logoPanelBorder: '#E1D2C4',
        logoTileBackground: '#FFFDF9',
        logoTileBorder: '#E6D7C8',
        logoFallbackBackground: '#F1E6DA',
        logoFallbackText: '#5E4A43',
        primarySoft: '#FCE2DA',
        secondarySoft: '#F4D9D3',
        successSoft: '#E3EEDC',
        warningSoft: '#F6E7C7',
        dangerSoft: '#F7DDD8',
        editorBackground: '#FFF8EF',
        editorText: '#242424',
        editorQuoteBorder: '#CDB49F',
        editorQuoteText: '#5E4A43',
        editorCodeBackground: '#F7ECE0',
        editorPreBackground: '#FFF4EB',
      },
      dark: {
        background: '#0E0E0E',
        backgroundSubtle: '#181414',
        surface: '#242424',
        surfaceSubtle: '#2E2624',
        surfaceElevated: '#3A3A3A',
        surfaceInverse: '#F9F1E4',
        text: '#F9F1E4',
        textSecondary: '#D8C0AB',
        textMuted: '#B59D8B',
        textInverse: '#242424',
        border: '#4B3A34',
        borderStrong: '#6A534A',
        inputBackground: '#2E2624',
        inputBorder: '#4B3A34',
        inputPlaceholder: '#9A7E72',
        primary: '#F28872',
        primaryForeground: '#242424',
        secondary: '#ED654D',
        secondaryForeground: '#242424',
        accent: '#F9B6A4',
        accentForeground: '#242424',
        focusRing: '#F28872',
        success: '#93C572',
        successForeground: '#242424',
        approvalFill: '#1D4A1B',
        approvalBorder: '#84D65D',
        approvalText: '#E9F9DF',
        warning: '#F2C166',
        warningForeground: '#242424',
        danger: '#ED654D',
        dangerForeground: '#242424',
        overlay: 'rgba(249, 241, 228, 0.08)',
        overlayMuted: 'rgba(249, 241, 228, 0.05)',
        overlayStrong: 'rgba(0, 0, 0, 0.72)',
        tabBarBackground: '#141110',
        tabBarBorder: 'rgba(249, 241, 228, 0.12)',
        tabIconActive: '#F9F1E4',
        tabIconInactive: '#A98D80',
        headerBackground: '#141110',
        headerText: '#F9F1E4',
        chromeSurface: '#241D1B',
        chromeSurfacePressed: '#312725',
        chromeBorder: '#5A463E',
        chromeTextMuted: '#D1BDAF',
        logoPanelBackground: '#2E2624',
        logoPanelBorder: '#2E2624',
        logoTileBackground: '#FFFDF9',
        logoTileBorder: '#E6D7C8',
        logoFallbackBackground: '#F1E6DA',
        logoFallbackText: '#5E4A43',
        primarySoft: '#4E2923',
        secondarySoft: '#3D211D',
        successSoft: '#20311A',
        warningSoft: '#403017',
        dangerSoft: '#472721',
        editorBackground: '#242424',
        editorText: '#F9F1E4',
        editorQuoteBorder: '#6A534A',
        editorQuoteText: '#D8C0AB',
        editorCodeBackground: '#2E2624',
        editorPreBackground: '#1F1A19',
      },
    },
  },
};

export function resolveTheme(name: ThemeName, mode: ThemeMode): AppTheme {
  const definition = themeRegistry[name];
  return {
    name,
    mode,
    colors: definition.variants[mode],
  };
}
