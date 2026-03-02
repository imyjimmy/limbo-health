// components/binder/SwipeableRow.tsx
// Reusable swipe-to-delete wrapper for directory list rows.
// Swipe left reveals a red trash action. Non-empty folders get a warning border.

import React, { useRef, useCallback } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { RectButton } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { IconTrash } from '@tabler/icons-react-native';
import * as Haptics from 'expo-haptics';

interface SwipeableRowProps {
  /** Render-prop: receives warningAnim (Animated.Value 0→1) when showWarning is true */
  children: React.ReactNode | ((warningAnim: Animated.Value) => React.ReactNode);
  /** Show red warning border when swiped open (for non-empty folders) */
  showWarning: boolean;
  onDelete: () => void;
  /** Called when this row opens — parent uses it to close the previously open row */
  onSwipeOpen?: (ref: Swipeable) => void;
}

const ACTION_WIDTH = 72;
const ANIM_DURATION = 200;

export function SwipeableRow({
  children,
  showWarning,
  onDelete,
  onSwipeOpen,
}: SwipeableRowProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const warningAnim = useRef(new Animated.Value(0)).current;

  const renderRightActions = useCallback(
    (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
      const scale = dragX.interpolate({
        inputRange: [-ACTION_WIDTH, 0],
        outputRange: [1, 0.5],
        extrapolate: 'clamp',
      });

      return (
        <RectButton style={styles.deleteAction} onPress={handleDelete} testID="swipe-delete-action">
          <Animated.View style={{ transform: [{ scale }] }}>
            <IconTrash size={22} color="#fff" strokeWidth={2} />
          </Animated.View>
        </RectButton>
      );
    },
    [],
  );

  const handleDelete = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    swipeableRef.current?.close();
    onDelete();
  }, [onDelete]);

  const handleSwipeOpen = useCallback(() => {
    if (showWarning) {
      Animated.timing(warningAnim, {
        toValue: 1,
        duration: ANIM_DURATION,
        useNativeDriver: false,
      }).start();
    }
    if (swipeableRef.current) {
      onSwipeOpen?.(swipeableRef.current);
    }
  }, [onSwipeOpen, showWarning, warningAnim]);

  const handleSwipeClose = useCallback(() => {
    Animated.timing(warningAnim, {
      toValue: 0,
      duration: ANIM_DURATION,
      useNativeDriver: false,
    }).start();
  }, [warningAnim]);

  // Interpolate border width, color, and shadow from the animated value
  const animBorderWidth = warningAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 2],
  });

  const animBorderColor = warningAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', '#E57373'],
  });

  const animShadowOpacity = warningAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.4],
  });

  return (
    <Animated.View
      style={
        showWarning
          ? [
              styles.warningContainer,
              {
                borderWidth: animBorderWidth,
                borderColor: animBorderColor,
                shadowOpacity: animShadowOpacity,
              },
            ]
          : undefined
      }
    >
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        rightThreshold={ACTION_WIDTH / 2}
        overshootRight={false}
        onSwipeableWillOpen={handleSwipeOpen}
        onSwipeableClose={handleSwipeClose}
      >
        <View style={styles.rowContainer}>
          {typeof children === 'function' ? children(warningAnim) : children}
        </View>
      </Swipeable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  warningContainer: {
    borderRadius: 4,
    overflow: 'hidden',
    shadowColor: '#E57373',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
  },
  rowContainer: {
    backgroundColor: 'transparent',
  },
  deleteAction: {
    backgroundColor: '#E57373',
    justifyContent: 'center',
    alignItems: 'center',
    width: ACTION_WIDTH,
  },
});
