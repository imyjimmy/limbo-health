import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Pattern, Rect, Stop } from 'react-native-svg';

export type BinderTextureId = 'linen' | 'blueprint' | 'sage' | 'sandstone';

type TexturePattern = 'weave' | 'grid' | 'dots' | 'crosshatch';

export interface BinderTextureOption {
  id: BinderTextureId;
  label: string;
  description: string;
  baseColor: string;
  tintColor: string;
  patternColor: string;
  secondaryPatternColor: string;
  pattern: TexturePattern;
}

export const DEFAULT_BINDER_TEXTURE_ID: BinderTextureId = 'linen';

export const BINDER_TEXTURE_OPTIONS: BinderTextureOption[] = [
  {
    id: 'linen',
    label: 'Linen',
    description: 'Warm paper texture',
    baseColor: '#F5EFE4',
    tintColor: '#EBDDCA',
    patternColor: 'rgba(154, 130, 101, 0.18)',
    secondaryPatternColor: 'rgba(154, 130, 101, 0.11)',
    pattern: 'weave',
  },
  {
    id: 'blueprint',
    label: 'Blueprint',
    description: 'Soft graph paper',
    baseColor: '#E8F2FF',
    tintColor: '#D5E5FC',
    patternColor: 'rgba(86, 121, 173, 0.26)',
    secondaryPatternColor: 'rgba(86, 121, 173, 0.14)',
    pattern: 'grid',
  },
  {
    id: 'sage',
    label: 'Sage',
    description: 'Dotted notebook',
    baseColor: '#EAF3EC',
    tintColor: '#D8E5DB',
    patternColor: 'rgba(93, 131, 104, 0.23)',
    secondaryPatternColor: 'rgba(93, 131, 104, 0.14)',
    pattern: 'dots',
  },
  {
    id: 'sandstone',
    label: 'Sandstone',
    description: 'Crosshatch cover',
    baseColor: '#F4EAE0',
    tintColor: '#E7D7C8',
    patternColor: 'rgba(144, 110, 82, 0.21)',
    secondaryPatternColor: 'rgba(144, 110, 82, 0.12)',
    pattern: 'crosshatch',
  },
];

const TEXTURE_LOOKUP: Record<BinderTextureId, BinderTextureOption> = {
  linen: BINDER_TEXTURE_OPTIONS[0],
  blueprint: BINDER_TEXTURE_OPTIONS[1],
  sage: BINDER_TEXTURE_OPTIONS[2],
  sandstone: BINDER_TEXTURE_OPTIONS[3],
};

export function isBinderTextureId(value: string | null | undefined): value is BinderTextureId {
  if (!value) return false;
  return value in TEXTURE_LOOKUP;
}

export function getBinderTexture(textureId: BinderTextureId): BinderTextureOption {
  return TEXTURE_LOOKUP[textureId] ?? TEXTURE_LOOKUP[DEFAULT_BINDER_TEXTURE_ID];
}

function renderPattern(texture: BinderTextureOption, patternId: string) {
  switch (texture.pattern) {
    case 'grid':
      return (
        <Pattern id={patternId} width="20" height="20" patternUnits="userSpaceOnUse">
          <Line x1="0" y1="0" x2="20" y2="0" stroke={texture.patternColor} strokeWidth="0.9" />
          <Line x1="0" y1="0" x2="0" y2="20" stroke={texture.patternColor} strokeWidth="0.9" />
          <Line x1="10" y1="0" x2="10" y2="20" stroke={texture.secondaryPatternColor} strokeWidth="0.7" />
          <Line x1="0" y1="10" x2="20" y2="10" stroke={texture.secondaryPatternColor} strokeWidth="0.7" />
        </Pattern>
      );
    case 'dots':
      return (
        <Pattern id={patternId} width="18" height="18" patternUnits="userSpaceOnUse">
          <Circle cx="5" cy="5" r="1.2" fill={texture.patternColor} />
          <Circle cx="14" cy="14" r="1.2" fill={texture.secondaryPatternColor} />
        </Pattern>
      );
    case 'crosshatch':
      return (
        <Pattern id={patternId} width="18" height="18" patternUnits="userSpaceOnUse">
          <Line x1="-9" y1="18" x2="9" y2="0" stroke={texture.patternColor} strokeWidth="1" />
          <Line x1="0" y1="18" x2="18" y2="0" stroke={texture.patternColor} strokeWidth="1" />
          <Line x1="9" y1="18" x2="27" y2="0" stroke={texture.patternColor} strokeWidth="1" />
          <Line x1="-9" y1="0" x2="9" y2="18" stroke={texture.secondaryPatternColor} strokeWidth="0.9" />
          <Line x1="0" y1="0" x2="18" y2="18" stroke={texture.secondaryPatternColor} strokeWidth="0.9" />
          <Line x1="9" y1="0" x2="27" y2="18" stroke={texture.secondaryPatternColor} strokeWidth="0.9" />
        </Pattern>
      );
    case 'weave':
    default:
      return (
        <Pattern id={patternId} width="14" height="14" patternUnits="userSpaceOnUse">
          <Line x1="0" y1="0" x2="14" y2="0" stroke={texture.patternColor} strokeWidth="0.8" />
          <Line x1="0" y1="7" x2="14" y2="7" stroke={texture.secondaryPatternColor} strokeWidth="0.8" />
          <Line x1="0" y1="0" x2="0" y2="14" stroke={texture.patternColor} strokeWidth="0.8" />
          <Line x1="7" y1="0" x2="7" y2="14" stroke={texture.secondaryPatternColor} strokeWidth="0.8" />
        </Pattern>
      );
  }
}

interface BinderTextureBackgroundProps {
  textureId: BinderTextureId;
}

export function BinderTextureBackground({ textureId }: BinderTextureBackgroundProps) {
  const texture = getBinderTexture(textureId);
  const gradientId = `${texture.id}-gradient`;
  const patternId = `${texture.id}-pattern`;

  return (
    <View style={styles.fill} pointerEvents="none">
      <View style={[styles.fill, { backgroundColor: texture.baseColor }]} />
      <Svg width="100%" height="100%" style={styles.fill}>
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={texture.tintColor} stopOpacity="0.35" />
            <Stop offset="45%" stopColor={texture.tintColor} stopOpacity="0.14" />
            <Stop offset="100%" stopColor={texture.tintColor} stopOpacity="0.2" />
          </LinearGradient>
          {renderPattern(texture, patternId)}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${patternId})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});
