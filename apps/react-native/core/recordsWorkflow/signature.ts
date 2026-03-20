import type {
  RecordsRequestSignaturePoint,
  RecordsRequestUserSignature,
} from '../../types/recordsRequest';

export interface RecordsRequestSignatureBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

function formatSignatureCoord(value: number) {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/u, '');
}

function buildStrokeSegmentPath(
  points: RecordsRequestSignaturePoint[],
  options?: {
    offsetX?: number;
    offsetY?: number;
  },
) {
  if (points.length === 0) return '';

  const offsetX = options?.offsetX || 0;
  const offsetY = options?.offsetY || 0;
  const [firstPoint, ...restPoints] = points;
  const startX = formatSignatureCoord(firstPoint.x - offsetX);
  const startY = formatSignatureCoord(firstPoint.y - offsetY);

  if (restPoints.length === 0) {
    const dotX = formatSignatureCoord(firstPoint.x - offsetX + 0.01);
    const dotY = formatSignatureCoord(firstPoint.y - offsetY + 0.01);
    return `M ${startX} ${startY} L ${dotX} ${dotY}`;
  }

  const lineSegments = restPoints
    .map((point) => `L ${formatSignatureCoord(point.x - offsetX)} ${formatSignatureCoord(point.y - offsetY)}`)
    .join(' ');

  return `M ${startX} ${startY} ${lineSegments}`;
}

export function getSignatureStrokePointCount(signature: RecordsRequestUserSignature | null | undefined) {
  if (!signature) return 0;

  return signature.strokes.reduce((total, stroke) => total + stroke.points.length, 0);
}

export function hasSignatureStrokeInput(
  signature: RecordsRequestUserSignature | null | undefined,
): signature is RecordsRequestUserSignature {
  return getSignatureStrokePointCount(signature) > 0;
}

export function getSignatureBounds(
  signature: RecordsRequestUserSignature | null | undefined,
): RecordsRequestSignatureBounds | null {
  if (!hasSignatureStrokeInput(signature)) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const stroke of signature.strokes) {
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

export function buildSignatureSvgPath(
  signature: RecordsRequestUserSignature | null | undefined,
  options?: {
    normalize?: boolean;
  },
) {
  if (!hasSignatureStrokeInput(signature)) return '';

  const bounds = options?.normalize ? getSignatureBounds(signature) : null;

  return signature.strokes
    .map((stroke) =>
      buildStrokeSegmentPath(stroke.points, {
        offsetX: bounds?.minX || 0,
        offsetY: bounds?.minY || 0,
      }),
    )
    .filter(Boolean)
    .join(' ');
}
