import React, { createContext, useContext, useCallback, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

interface ToastContextValue {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    // Cancel any existing dismiss timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setMessage(msg);

    // Fade in
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      // Schedule fade out after 3 seconds
      timerRef.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setMessage(null));
      }, 3000);
    });
  }, [opacity]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      <View style={styles.wrapper}>
        {children}
        {message && (
          <Animated.View style={[styles.pill, { opacity }]} pointerEvents="none">
            <Text style={styles.text}>{message}</Text>
          </Animated.View>
        )}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  pill: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
});
