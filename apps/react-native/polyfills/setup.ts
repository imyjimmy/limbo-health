// polyfills/setup.ts
// This file MUST be the first import in app/_layout.tsx
// Order matters: crypto shim first, then Buffer, then streams

import './crypto-shim';

import { Buffer } from 'buffer';

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}

// isomorphic-git requires ReadableStream on some code paths
import { ReadableStream } from 'web-streams-polyfill';

if (typeof globalThis.ReadableStream === 'undefined') {
  globalThis.ReadableStream = ReadableStream as any;
}