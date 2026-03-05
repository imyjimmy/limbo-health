import React, { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

interface BinderSpineProps {
  style?: StyleProp<ViewStyle>;
  width?: number;
  holeSize?: number;
  interval?: number;
  verticalPadding?: number;
  backgroundColor?: string;
  borderColor?: string;
  holeColor?: string;
  holeBorderColor?: string;
  minVisibleHoles?: number;
}

export function BinderSpine({
  style,
  width = 12,
  holeSize = 6,
  interval = 10,
  verticalPadding = 7,
  backgroundColor = 'rgba(233, 225, 211, 0.72)',
  borderColor = 'rgba(74, 63, 52, 0.28)',
  holeColor = 'rgba(250, 247, 240, 0.96)',
  holeBorderColor = 'rgba(74, 63, 52, 0.38)',
  minVisibleHoles = 2,
}: BinderSpineProps) {
  const [height, setHeight] = useState(0);

  const holeCount = useMemo(() => {
    if (height <= 0) return minVisibleHoles;
    const usableHeight = Math.max(0, height - verticalPadding * 2);
    const unit = holeSize + interval;
    if (unit <= 0) return minVisibleHoles;
    const fitted = Math.floor((usableHeight + interval) / unit);
    return Math.max(minVisibleHoles, fitted);
  }, [height, holeSize, interval, verticalPadding, minVisibleHoles]);

  const holeIndices = useMemo(
    () => Array.from({ length: holeCount }, (_, index) => index),
    [holeCount],
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    if (!nextHeight || Math.abs(nextHeight - height) < 1) return;
    setHeight(nextHeight);
  };

  return (
    <View
      pointerEvents="none"
      onLayout={handleLayout}
      style={[
        styles.spine,
        {
          width,
          paddingTop: verticalPadding,
          paddingBottom: verticalPadding,
          backgroundColor,
          borderRightColor: borderColor,
        },
        style,
      ]}
    >
      {holeIndices.map((holeIndex) => (
        <View
          key={`spine-hole-${holeIndex}`}
          style={[
            styles.hole,
            {
              width: holeSize,
              height: holeSize,
              borderRadius: holeSize / 2,
              backgroundColor: holeColor,
              borderColor: holeBorderColor,
              marginBottom: holeIndex !== holeCount - 1 ? interval : 0,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    overflow: 'hidden',
  },
  hole: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
