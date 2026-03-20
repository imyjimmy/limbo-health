import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, View, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { buildSignatureSvgPath, hasSignatureStrokeInput } from '../../core/recordsWorkflow/signature';
import { createThemedStyles, useTheme, useThemedStyles } from '../../theme';
import type {
  RecordsRequestSignaturePoint,
  RecordsRequestSignatureStroke,
  RecordsRequestUserSignature,
} from '../../types/recordsRequest';

interface SignaturePadProps {
  value: RecordsRequestUserSignature | null;
  onChange: (value: RecordsRequestUserSignature | null) => void;
  height?: number;
  disabled?: boolean;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
}

const DEFAULT_PAD_HEIGHT = 188;
const MIN_POINT_DELTA = 1.5;
const STROKE_WIDTH = 2.4;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function cloneStrokes(strokes: RecordsRequestSignatureStroke[]) {
  return strokes.map((stroke) => ({
    points: stroke.points.map((point) => ({ ...point })),
  }));
}

function shouldAppendPoint(
  points: RecordsRequestSignaturePoint[],
  nextPoint: RecordsRequestSignaturePoint,
) {
  const previousPoint = points[points.length - 1];
  if (!previousPoint) return true;

  const deltaX = previousPoint.x - nextPoint.x;
  const deltaY = previousPoint.y - nextPoint.y;
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY) >= MIN_POINT_DELTA;
}

function createPoint(x: number, y: number, width: number, height: number) {
  return {
    x: clamp(x, 0, Math.max(width, 1)),
    y: clamp(y, 0, Math.max(height, 1)),
  };
}

export function SignaturePad({
  value,
  onChange,
  height = DEFAULT_PAD_HEIGHT,
  disabled = false,
  onInteractionStart,
  onInteractionEnd,
}: SignaturePadProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [strokes, setStrokes] = useState<RecordsRequestSignatureStroke[]>(value?.strokes || []);
  const [canvasWidth, setCanvasWidth] = useState(value?.width || 0);
  const strokesRef = useRef(strokes);
  const canvasWidthRef = useRef(canvasWidth);
  const activeStrokeIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const nextStrokes = value?.strokes || [];
    setStrokes(nextStrokes);
    strokesRef.current = nextStrokes;

    if (typeof value?.width === 'number' && value.width > 0) {
      setCanvasWidth(value.width);
      canvasWidthRef.current = value.width;
    }
  }, [value]);

  const commitSignatureValue = () => {
    const nextWidth = Math.max(canvasWidthRef.current, 1);
    const nextValue =
      strokesRef.current.length > 0
        ? {
            width: nextWidth,
            height,
            strokes: cloneStrokes(strokesRef.current),
          }
        : null;

    onChange(nextValue);
  };

  const startStroke = (locationX: number, locationY: number) => {
    const nextWidth = Math.max(canvasWidthRef.current, 1);
    const nextPoint = createPoint(locationX, locationY, nextWidth, height);
    const nextStrokes = [...cloneStrokes(strokesRef.current), { points: [nextPoint] }];

    onInteractionStart?.();
    activeStrokeIndexRef.current = nextStrokes.length - 1;
    strokesRef.current = nextStrokes;
    setStrokes(nextStrokes);
  };

  const extendStroke = (locationX: number, locationY: number) => {
    const activeStrokeIndex = activeStrokeIndexRef.current;
    if (activeStrokeIndex === null) return;

    const nextWidth = Math.max(canvasWidthRef.current, 1);
    const nextPoint = createPoint(locationX, locationY, nextWidth, height);
    const nextStrokes = cloneStrokes(strokesRef.current);
    const activeStroke = nextStrokes[activeStrokeIndex];

    if (!activeStroke || !shouldAppendPoint(activeStroke.points, nextPoint)) {
      return;
    }

    activeStroke.points.push(nextPoint);
    strokesRef.current = nextStrokes;
    setStrokes(nextStrokes);
  };

  const finishStroke = () => {
    if (activeStrokeIndexRef.current === null) return;

    activeStrokeIndexRef.current = null;
    commitSignatureValue();
    onInteractionEnd?.();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          startStroke(event.nativeEvent.locationX, event.nativeEvent.locationY);
        },
        onPanResponderMove: (event) => {
          extendStroke(event.nativeEvent.locationX, event.nativeEvent.locationY);
        },
        onPanResponderRelease: finishStroke,
        onPanResponderTerminate: finishStroke,
      }),
    [disabled, onInteractionEnd, onInteractionStart],
  );

  const handleLayout = (event: { nativeEvent: { layout: { width: number } } }) => {
    const nextWidth = Math.max(event.nativeEvent.layout.width, 1);
    if (Math.abs(nextWidth - canvasWidthRef.current) < 0.5) return;

    setCanvasWidth(nextWidth);
    canvasWidthRef.current = nextWidth;

    if (strokesRef.current.length > 0) {
      commitSignatureValue();
    }
  };

  const signatureValue =
    strokes.length > 0
      ? {
          width: Math.max(canvasWidth, 1),
          height,
          strokes,
        }
      : null;
  const signaturePath = buildSignatureSvgPath(signatureValue);
  const hasSignature = hasSignatureStrokeInput(signatureValue);

  return (
    <View style={styles.container}>
      <View
        onLayout={handleLayout}
        style={[styles.canvas, disabled && styles.canvasDisabled]}
        {...panResponder.panHandlers}
      >
        <Svg
          width="100%"
          height={height}
          viewBox={`0 0 ${Math.max(canvasWidth, 1)} ${height}`}
        >
          <Path
            d={signaturePath}
            fill="none"
            stroke={theme.colors.text}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>

        {!hasSignature && (
          <View pointerEvents="none" style={styles.placeholderWrap}>
            <Text style={styles.placeholderText}>Sign here</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = createThemedStyles((theme) => ({
  container: {
    width: '100%',
  },
  canvas: {
    minHeight: DEFAULT_PAD_HEIGHT,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    overflow: 'hidden',
  },
  canvasDisabled: {
    opacity: 0.5,
  },
  placeholderWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: theme.colors.textMuted,
    fontSize: 18,
    fontWeight: '600',
  },
}));
