// components/binder/FolderRow.tsx

import React, { useRef } from 'react';
import { Animated, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import type { DirFolder } from '../../core/binder/DirectoryReader';
import { BinderSpine } from './BinderSpine';

interface FolderRowProps {
  item: DirFolder;
  emoji?: string;
  iconColor?: string;
  onPress: (folder: DirFolder) => void;
  onLongPress?: (folder: DirFolder) => void;
  onDragHandleLongPress?: () => void;
  /** Animated value 0→1 driving the "delete multiple items" pill visibility */
  deleteWarningAnim?: Animated.Value;
}

export function FolderRow({
  item,
  emoji,
  iconColor,
  onPress,
  onLongPress,
  onDragHandleLongPress,
  deleteWarningAnim,
}: FolderRowProps) {
  const longPressFired = useRef(false);
  const baseColor = iconColor ?? '#8f99a6';
  const bgTint = withAlpha(baseColor, '22') ?? '#f0f0f0';
  const tabShade = withAlpha(baseColor, 'CC') ?? '#b5bfca';
  const tabBorder = withAlpha(baseColor, 'F2') ?? '#8792a0';
  const displayName = item.meta?.displayName ?? formatFolderName(item.name);
  const dragBarColor = onDragHandleLongPress ? '#D1D8E1' : '#DEE4EB';

  const handlePress = () => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    onPress(item);
  };

  const handleLongPress = () => {
    longPressFired.current = true;
    onLongPress?.(item);
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.backgroundTab,
          { backgroundColor: tabShade, borderColor: tabBorder },
        ]}
        pointerEvents="none"
      />
      <View style={styles.foregroundRow}>
        <View style={styles.paperLayer} pointerEvents="none">
          <View style={[styles.ruleLine, styles.ruleLineTop]} />
          <View style={[styles.ruleLine, styles.ruleLineBottom]} />
          <View style={styles.marginLine} />
        </View>
        <BinderSpine
          style={styles.spine}
          width={12}
          holeSize={6}
          interval={16}
          verticalPadding={7}
          minVisibleHoles={2}
        />
        <TouchableOpacity
          style={styles.mainPressArea}
          onPress={handlePress}
          onLongPress={onLongPress ? handleLongPress : undefined}
          delayLongPress={250}
          activeOpacity={0.6}
          testID={`folder-row-${item.name}`}
        >
          <View style={[styles.iconContainer, { backgroundColor: bgTint }]}>
            <Text style={styles.emoji}>{emoji ?? '📁'}</Text>
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.name}>{displayName}</Text>
          </View>
          {deleteWarningAnim && (
            <Animated.View
              style={[
                styles.deletePill,
                {
                  opacity: deleteWarningAnim,
                  transform: [{
                    scale: deleteWarningAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  }],
                },
              ]}
            >
              <Text style={styles.deletePillText}>delete multiple items?</Text>
            </Animated.View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dragHandle}
          onLongPress={onDragHandleLongPress}
          delayLongPress={120}
          activeOpacity={0.7}
          disabled={!onDragHandleLongPress}
          testID={`folder-drag-handle-${item.name}`}
        >
          <View style={styles.dragBars}>
            <View style={[styles.dragBar, { backgroundColor: dragBarColor }]} />
            <View style={[styles.dragBar, { backgroundColor: dragBarColor }]} />
            <View style={[styles.dragBar, { backgroundColor: dragBarColor }]} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Convert slug to display name: 'back-acne' -> 'Back Acne' */
function formatFolderName(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function withAlpha(color: string, alphaHex: string): string | null {
  const longHexMatch = color.match(/^#([0-9a-fA-F]{6})$/);
  if (longHexMatch) return `${color}${alphaHex}`;

  const shortHexMatch = color.match(/^#([0-9a-fA-F]{3})$/);
  if (!shortHexMatch) return null;

  const [r, g, b] = shortHexMatch[1].split('');
  return `#${r}${r}${g}${g}${b}${b}${alphaHex}`;
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: 'transparent',
  },
  backgroundTab: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 40,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  foregroundRow: {
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 10,
    marginRight: 18,
    backgroundColor: '#FEFCF6',
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(74, 63, 52, 0.2)',
    shadowColor: '#243447',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  paperLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  ruleLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(105, 154, 205, 0.2)',
  },
  ruleLineTop: {
    top: 18,
  },
  ruleLineBottom: {
    top: 36,
  },
  marginLine: {
    position: 'absolute',
    left: 30,
    top: 0,
    bottom: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(212, 95, 110, 0.32)',
  },
  spine: {
    // BinderSpine provides geometry and paint.
  },
  mainPressArea: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 8,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(90, 79, 62, 0.18)',
  },
  emoji: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2D3D',
  },
  deletePill: {
    backgroundColor: '#E57373',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 4,
  },
  deletePillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  dragHandle: {
    width: 30,
    height: 36,
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  dragBars: {
    width: 14,
    height: 12,
    justifyContent: 'space-between',
  },
  dragBar: {
    width: '100%',
    height: 2,
    borderRadius: 1,
  },
});
