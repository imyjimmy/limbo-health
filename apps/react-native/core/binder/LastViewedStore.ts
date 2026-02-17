// core/binder/LastViewedStore.ts
// Tracks the most recently viewed binder directory so the Document tab
// can jump back to it instantly (content served from BinderCache).
//
// pendingRestore: when the Document tab navigates to a binder, it sets this
// so the [binderId]/_layout can reconstruct Navigator 4's stack atomically
// via CommonActions.reset (no animation glitches).

interface LastViewed {
  binderId: string;
  dirPath: string;
}

let lastViewed: LastViewed | null = null;
let pendingRestore: string | null = null; // dirPath to restore, or null

export function setLastViewed(binderId: string, dirPath: string): void {
  lastViewed = { binderId, dirPath };
}

export function getLastViewed(): LastViewed | null {
  return lastViewed;
}

export function clearLastViewed(): void {
  lastViewed = null;
}

export function setPendingRestore(dirPath: string): void {
  pendingRestore = dirPath;
}

export function consumePendingRestore(): string | null {
  const val = pendingRestore;
  pendingRestore = null;
  return val;
}
