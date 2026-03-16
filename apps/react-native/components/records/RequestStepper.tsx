import React from 'react';
import { Text, View } from 'react-native';
import { createThemedStyles, useTheme, useThemedStyles } from '../../theme';

interface RequestStepperProps {
  steps: string[];
  currentStep: number;
}

export function RequestStepper({ steps, currentStep }: RequestStepperProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.row}>
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isComplete = index < currentStep;

        return (
          <React.Fragment key={step}>
            <View style={styles.stepWrap}>
              <View
                style={[
                  styles.stepCircle,
                  isActive && { backgroundColor: theme.colors.primary },
                  isComplete && { backgroundColor: theme.colors.secondary },
                ]}
              >
                <Text
                  style={[
                    styles.stepNumber,
                    (isActive || isComplete) && { color: theme.colors.textInverse },
                  ]}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isActive && { color: theme.colors.text },
                  isComplete && { color: theme.colors.secondary },
                ]}
                numberOfLines={1}
              >
                {step}
              </Text>
            </View>
            {index < steps.length - 1 && (
              <View
                style={[
                  styles.connector,
                  index < currentStep && { backgroundColor: theme.colors.secondary },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const createStyles = createThemedStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepWrap: {
    width: 58,
    alignItems: 'center',
    gap: 8,
  },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  stepLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  connector: {
    flex: 1,
    height: 2,
    borderRadius: 999,
    backgroundColor: theme.colors.border,
    marginBottom: 22,
  },
}));
