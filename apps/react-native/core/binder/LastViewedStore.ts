// core/binder/LastViewedStore.ts
// Tracks the most recently viewed binder directory so the Document tab
// can jump back to it instantly (content served from BinderCache).

interface LastViewed {
  binderId: string;
  dirPath: string;
}

let lastViewed: LastViewed | null = null;

export function setLastViewed(binderId: string, dirPath: string): void {
  lastViewed = { binderId, dirPath };
}

export function getLastViewed(): LastViewed | null {
  return lastViewed;
}

export function clearLastViewed(): void {
  lastViewed = null;
}
