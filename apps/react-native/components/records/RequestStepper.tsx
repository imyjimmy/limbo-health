import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface RequestStepperProps {
  steps: string[];
  currentStep: number;
}

export function RequestStepper({ steps, currentStep }: RequestStepperProps) {
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
                  isActive && styles.stepCircleActive,
                  isComplete && styles.stepCircleComplete,
                ]}
              >
                <Text
                  style={[
                    styles.stepNumber,
                    (isActive || isComplete) && styles.stepNumberActive,
                  ]}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isActive && styles.stepLabelActive,
                  isComplete && styles.stepLabelComplete,
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
                  index < currentStep && styles.connectorComplete,
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: {
    backgroundColor: '#0F766E',
  },
  stepCircleComplete: {
    backgroundColor: '#2563EB',
  },
  stepNumber: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  stepNumberActive: {
    color: '#FFFFFF',
  },
  stepLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  stepLabelActive: {
    color: '#0F172A',
  },
  stepLabelComplete: {
    color: '#1E3A8A',
  },
  connector: {
    flex: 1,
    height: 2,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    marginBottom: 22,
  },
  connectorComplete: {
    backgroundColor: '#2563EB',
  },
});
