import {
  dirGet, dirSet, dirEvict, dirEvictPrefix, dirSize,
  ptGet, ptSet, ptEvict, ptEvictPrefix, ptSize,
  clearAll,
} from '../../../core/binder/BinderCache';
import type { DirItem } from '../../../core/binder/DirectoryReader';

// BinderCache uses module-level Maps, so we must clear between tests.
beforeEach(() => {
  clearAll();
});

// --- Tier 1: Directory Cache ---

describe('dirCache', () => {
  const items: DirItem[] = [
    { kind: 'folder', name: 'conditions', relativePath: 'conditions' },
  ];

  test('dirSet/dirGet stores and retrieves items by reference', () => {
    dirSet('repo1:/', items);
    expect(dirGet('repo1:/')).toBe(items); // same reference
  });

  test('dirGet returns undefined for missing key', () => {
    expect(dirGet('nonexistent')).toBeUndefined();
  });

  test('dirEvict removes entry', () => {
    dirSet('repo1:/', items);
    dirEvict('repo1:/');
    expect(dirGet('repo1:/')).toBeUndefined();
  });

  test('dirEvict on missing key is a no-op', () => {
    dirEvict('nonexistent'); // should not throw
    expect(dirSize()).toBe(0);
  });

  test('dirEvictPrefix removes matching keys and preserves others', () => {
    dirSet('repo1:/', items);
    dirSet('repo1:/conditions', items);
    dirSet('repo1:/conditions/back-acne', items);
    dirSet('repo2:/', items);

    dirEvictPrefix('repo1:/conditions');

    expect(dirGet('repo1:/conditions')).toBeUndefined();
    expect(dirGet('repo1:/conditions/back-acne')).toBeUndefined();
    expect(dirGet('repo1:/')).toBe(items); // preserved
    expect(dirGet('repo2:/')).toBe(items); // preserved
  });

  test('dirEvictPrefix with no matches is a no-op', () => {
    dirSet('repo1:/', items);
    dirEvictPrefix('repo2:');
    expect(dirSize()).toBe(1);
  });

  test('dirSize returns correct count', () => {
    expect(dirSize()).toBe(0);
    dirSet('a', items);
    dirSet('b', items);
    expect(dirSize()).toBe(2);
    dirEvict('a');
    expect(dirSize()).toBe(1);
  });
});

// --- Tier 2: Plaintext Cache ---

describe('ptCache', () => {
  const doc = { value: 'test', metadata: { type: 'visit', created: '2026-01-01' }, children: [] };

  test('ptSet/ptGet stores and retrieves values', () => {
    ptSet('repo1:/visits/note.json', doc);
    expect(ptGet('repo1:/visits/note.json')).toBe(doc);
  });

  test('ptGet returns undefined for missing key', () => {
    expect(ptGet('nonexistent')).toBeUndefined();
  });

  test('ptEvict removes entry', () => {
    ptSet('repo1:/note.json', doc);
    ptEvict('repo1:/note.json');
    expect(ptGet('repo1:/note.json')).toBeUndefined();
  });

  test('ptEvictPrefix removes matching keys and preserves others', () => {
    ptSet('repo1:/visits/a.json', doc);
    ptSet('repo1:/visits/b.json', doc);
    ptSet('repo1:/conditions/c.json', doc);

    ptEvictPrefix('repo1:/visits');

    expect(ptGet('repo1:/visits/a.json')).toBeUndefined();
    expect(ptGet('repo1:/visits/b.json')).toBeUndefined();
    expect(ptGet('repo1:/conditions/c.json')).toBe(doc);
  });

  test('ptSize returns correct count', () => {
    expect(ptSize()).toBe(0);
    ptSet('a', 'hello');
    ptSet('b', 42);
    expect(ptSize()).toBe(2);
  });
});

// --- Shared ---

describe('clearAll', () => {
  test('empties both caches', () => {
    dirSet('a', []);
    ptSet('b', 'data');
    expect(dirSize()).toBe(1);
    expect(ptSize()).toBe(1);

    clearAll();

    expect(dirSize()).toBe(0);
    expect(ptSize()).toBe(0);
  });
});
