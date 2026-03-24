import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

type OnboardingBackdropColors = {
  accent: string;
  background: string;
  backgroundSubtle: string;
  borderStrong: string;
  primary: string;
  primarySoft: string;
  secondary: string;
  secondarySoft: string;
  surface: string;
  surfaceSubtle: string;
};

interface OnboardingBackdropProps {
  colors: OnboardingBackdropColors;
  currentSlide: number;
  height: number;
  idPrefix?: string;
  style?: StyleProp<ViewStyle>;
  width: number;
}

export function OnboardingBackdrop({
  colors,
  currentSlide,
  height,
  idPrefix = 'onboarding',
  style,
  width,
}: OnboardingBackdropProps) {
  const activeColor =
    currentSlide === 0 ? colors.primary : currentSlide === 1 ? colors.secondary : colors.accent;
  const activeSoft =
    currentSlide === 0
      ? colors.primarySoft
      : currentSlide === 1
        ? colors.secondarySoft
        : colors.primarySoft;

  const canvasId = `${idPrefix}-canvas`;
  const topGlowId = `${idPrefix}-top-glow`;
  const bottomGlowId = `${idPrefix}-bottom-glow`;
  const ribbonId = `${idPrefix}-ribbon`;

  return (
    <View pointerEvents="none" style={style}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id={canvasId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={colors.background} />
            <Stop offset="58%" stopColor={colors.backgroundSubtle} />
            <Stop offset="100%" stopColor={colors.surfaceSubtle} />
          </LinearGradient>
          <RadialGradient id={topGlowId} cx="80%" cy="18%" rx="36%" ry="26%">
            <Stop offset="0%" stopColor={activeColor} stopOpacity={0.16} />
            <Stop offset="58%" stopColor={activeSoft} stopOpacity={0.78} />
            <Stop offset="100%" stopColor={colors.background} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={bottomGlowId} cx="14%" cy="86%" rx="44%" ry="28%">
            <Stop offset="0%" stopColor={colors.secondary} stopOpacity={0.12} />
            <Stop offset="56%" stopColor={colors.secondarySoft} stopOpacity={0.8} />
            <Stop offset="100%" stopColor={colors.background} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={ribbonId} x1="8%" y1="0%" x2="88%" y2="100%">
            <Stop offset="0%" stopColor={colors.surface} stopOpacity={0.12} />
            <Stop offset="52%" stopColor={activeSoft} stopOpacity={0.24} />
            <Stop offset="100%" stopColor={colors.surface} stopOpacity={0.08} />
          </LinearGradient>
        </Defs>

        <Rect width={width} height={height} fill={`url(#${canvasId})`} />
        <Ellipse
          cx={width * 0.84}
          cy={height * 0.18}
          rx={width * 0.34}
          ry={height * 0.18}
          fill={`url(#${topGlowId})`}
        />
        <Ellipse
          cx={width * 0.16}
          cy={height * 0.82}
          rx={width * 0.4}
          ry={height * 0.22}
          fill={`url(#${bottomGlowId})`}
        />
        <Path
          d={`M ${-width * 0.08} ${height * 0.18} C ${width * 0.12} ${height * 0.06}, ${width * 0.44} ${height * 0.16}, ${width * 0.54} ${height * 0.32} S ${width * 0.9} ${height * 0.58}, ${width + 28} ${height * 0.48} L ${width + 28} ${height * 0.72} C ${width * 0.82} ${height * 0.76}, ${width * 0.6} ${height * 0.62}, ${width * 0.42} ${height * 0.54} S ${width * 0.08} ${height * 0.44}, ${-width * 0.08} ${height * 0.54} Z`}
          fill={`url(#${ribbonId})`}
          opacity={0.95}
        />
        <Path
          d={`M ${-14} ${height * 0.64} C ${width * 0.16} ${height * 0.5}, ${width * 0.34} ${height * 0.74}, ${width * 0.56} ${height * 0.6} S ${width * 0.96} ${height * 0.36}, ${width + 24} ${height * 0.52}`}
          stroke={activeColor}
          strokeWidth={2.5}
          strokeOpacity={0.16}
          fill="none"
        />
        <Path
          d={`M ${width * 0.08} ${height * 0.24} C ${width * 0.22} ${height * 0.18}, ${width * 0.38} ${height * 0.3}, ${width * 0.5} ${height * 0.22} S ${width * 0.78} ${height * 0.16}, ${width * 0.92} ${height * 0.22}`}
          stroke={colors.borderStrong}
          strokeWidth={1.2}
          strokeOpacity={0.16}
          fill="none"
        />
        <Circle
          cx={width * 0.24}
          cy={height * 0.58}
          r={9}
          fill={colors.surface}
          fillOpacity={0.88}
          stroke={activeColor}
          strokeWidth={2}
          strokeOpacity={0.48}
        />
        <Circle
          cx={width * 0.54}
          cy={height * 0.61}
          r={7}
          fill={colors.surface}
          fillOpacity={0.86}
          stroke={colors.secondary}
          strokeWidth={1.8}
          strokeOpacity={0.42}
        />
        <Circle
          cx={width * 0.78}
          cy={height * 0.46}
          r={6}
          fill={colors.surface}
          fillOpacity={0.84}
          stroke={activeColor}
          strokeWidth={1.6}
          strokeOpacity={0.36}
        />
      </Svg>
    </View>
  );
}
