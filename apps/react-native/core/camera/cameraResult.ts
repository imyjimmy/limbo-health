// core/camera/cameraResult.ts
// Shared promise bridge between useCamera hook and camera screen.
// useCamera creates a pending promise, navigates to camera.tsx.
// camera.tsx resolves or rejects it, navigates back.

export interface CameraResult {
  uri: string;
  width: number;
  height: number;
}

let _resolve: ((result: CameraResult | null) => void) | null = null;

export function createPending(): Promise<CameraResult | null> {
  return new Promise((resolve) => {
    _resolve = resolve;
  });
}

export function resolveResult(result: CameraResult | null): void {
  if (_resolve) {
    _resolve(result);
    _resolve = null;
  }
}