// polyfills/__tests__/polyfill-smoke.ts
// Run this on-device (not in Node). Call from a dev-only screen or useEffect in _layout.tsx during development.

export function verifyPolyfills(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];

  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    missing.push('crypto.getRandomValues');
  }

  if (typeof globalThis.Buffer === 'undefined') {
    missing.push('Buffer');
  }

  if (typeof globalThis.ReadableStream === 'undefined') {
    missing.push('ReadableStream');
  }

  // Functional check: can getRandomValues actually fill a typed array?
  if (missing.length === 0) {
    try {
      const arr = new Uint8Array(32);
      globalThis.crypto.getRandomValues(arr);
      const allZero = arr.every(b => b === 0);
      if (allZero) missing.push('crypto.getRandomValues (returned all zeros)');
    } catch (e) {
      missing.push(`crypto.getRandomValues (threw: ${e})`);
    }
  }

  return { ok: missing.length === 0, missing };
}