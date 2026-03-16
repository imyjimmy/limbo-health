# Expo Router Limitations

## Core Problem

Expo Router's file-based routing couples three things that should be independent:
1. **View appearance** (what the screen looks like)
2. **Navigation hierarchy** (what's above/below in the stack)
3. **Back behavior** (where "back" takes you)

This is a hard limit of file-based routing. You cannot change one without affecting the others.

## Jimmy's Position

Back button = "go to the previous view I saw", not "pop the stack." Expo Router always pops the stack.

## Known Workarounds

### pendingRestore / CommonActions.reset
Used in `[binderId]/index.tsx` to reconstruct a full browse stack when restoring last-viewed position (e.g., from the Document tab). Works but fragile -- manually builds route arrays and dispatches `CommonActions.reset`.

### Raw React Navigation
Expo Router is optional. Raw React Navigation is a viable escape hatch for screens where file-based routing creates unsolvable UX conflicts. Trade-off: lose automatic deep linking and type-safe routes for those screens.

## Search Is a Major Problem

Search collides with every limitation above. The challenges:

### 1. Navigation after tapping a result
User searches, finds `conditions/back-acne/2026-02-15-note.json`, taps it. The browse stack (binder root -> conditions -> back-acne -> entry) does not exist. Options:
- **Push directly to entry**: back button goes to search, not the parent folder. Breaks "back = previous view" expectation if user wants to browse nearby entries.
- **Reconstruct stack via CommonActions.reset**: same `pendingRestore` hack. Must build the full route array (index + every path segment as a browse screen + the entry). Fragile, duplicates logic.
- **Navigate to the parent folder, then auto-open the entry**: two navigations, janky.

None of these are clean.

### 2. Where does the search screen live?
- **As a tab**: tapping a result navigates across tabs (home tab -> binder -> entry). Cross-tab navigation is messy and breaks back behavior.
- **As a modal over the current binder**: natural UX but modals and deep push navigation don't compose well in Expo Router.
- **As a screen in the binder stack**: part of the stack, back works, but it's weird in the file hierarchy (search is not a "directory").

### 3. Encryption makes search expensive
All content is NIP-44 encrypted on disk. To search, every `.json` must be decrypted and parsed on-device. For 100+ entries this is slow. Options:
- **Decrypt-and-scan per query**: simple, slow. Acceptable for small binders.
- **In-memory plaintext index built on binder open**: fast search, upfront cost. Index lives in memory only (never persisted to disk). Security trade-off is minimal since the decrypted content is already in memory during normal browsing.
- **Encrypted search index**: complex, likely overkill for v1.

### 4. Scope
- Search within current binder only? (simpler, most useful)
- Search across all binders? (requires decrypting multiple repos)

Recommend binder-scoped search for v1.

## Escape Hatch Candidates

Features that may need to bypass Expo Router entirely (use raw React Navigation):
- **Search**: result navigation requires programmatic stack construction
- **Any cross-cutting feature** that needs to land the user deep in a binder tree from outside the binder stack

derp derp
