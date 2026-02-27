# Data Usage Report: Encrypted Git Storage

**Date**: 2026-02-27
**Scope**: Per-commit and cumulative storage costs on mgit-server for encrypted binder repos

## Summary

Each binder is a git repo where every file is NIP-44 encrypted before git sees it. This defeats git's two main storage optimizations — delta compression and zlib compression — because encrypted data looks like random bytes. Every version of every file is stored as a full, incompressible blob.

For text-only medical records, this overhead is negligible. For binary attachments (audio, photos), it compounds quickly.

## Measured Blob Sizes

Analysis of a real binder (`binder-1771554942202`, 16 commits) from a simulator device.

### Text entries (.json)

| File | Blob size | Notes |
|------|-----------|-------|
| `.meta.json` | ~176 B | Folder metadata (icon, displayName, color, displayOrder) |
| `.meta.json` (with contextualAdd) | ~220 B | Folders with editor/renderer behavior |
| `patient-info.json` | 304 B | Root patient document |
| `2026-02-21-nose.json` | 304-604 B | Allergies entry (two versions from an edit) |
| `2026-02-21-recording.json` | 388 B | Audio metadata document (pointer to .enc sidecar) |

**Text entries are tiny.** A binder with 100 entries edited 10 times each would store ~1,000 blobs at ~400 B average = **~400 KB total**. Negligible.

### Binary sidecars (.m4a.enc, .jpg.enc)

| Blob OID (short) | Uncompressed size | File |
|-------------------|-------------------|------|
| `f049..` | 210 KB | `recordings/2026-02-21-recording.m4a.enc` |
| `71ff..` | 181 KB | same path, different commit |
| `35f9..` | 148 KB | `allergies/2026-02-21-recording.m4a.enc` |
| `6ae6..` | 147 KB | `allergies/...recording.m4a.enc` |
| `f7a4..` | 132 KB | `recordings/...` |
| `9d64..` | 98 KB | `recordings/...` |

**Binary sidecars dominate storage.** The 6 audio blobs above account for **917 KB** of the repo's **1.1 MB** object store (83%).

### Repo totals

| Metric | Value |
|--------|-------|
| Total repo size | 1.5 MB |
| `.git/objects` size | 1.1 MB |
| Pack file | 2.5 KB (initial binder creation only) |
| Loose objects | 64 |
| Commits | 16 |

## Why Encrypted Blobs Can't Delta-Compress

In a normal git repo, editing one line of a 1 KB file produces a new blob that's nearly identical. Git's pack format stores a ~20 B delta instead of a full 1 KB copy. Over 100 edits, storage grows by ~2 KB instead of 100 KB.

With NIP-44 encryption:
- Encryption uses a **fresh random nonce** each time
- Changing one byte of plaintext produces **completely different ciphertext**
- Two versions of the same file share **zero common bytes**
- Git's delta compression finds no similarities — stores full copies
- zlib compression achieves **~0% reduction** on high-entropy encrypted data

This means: **every edit = full blob stored again**.

## Where the 4x Audio Duplication Came From

The 4 versions of `recordings/2026-02-21-recording.m4a.enc` were NOT from editing metadata. The commit history shows a repeated create/delete/recreate cycle:

```
e5c5bdf Add audio recording       ← blob 1 (98 KB)
3f042c3 Delete folder recordings
a3fc5e6 Add audio recording       ← blob 2 (132 KB)
cf7a702 Delete folder recordings
62f033c Add audio recording       ← blob 3 (181 KB)
b4e075d Delete folder recordings
89727db Add audio recording       ← blob 4 (210 KB)
```

Each re-encryption of the same audio produces a unique blob (different nonce = different ciphertext). This was a testing artifact, not a production pattern.

## Code Audit: Does updateEntry Re-Write Binaries?

**No.** The code correctly separates text updates from binary writes:

- `BinderService.updateEntry()` — only writes the `.json` document. Never touches `.enc` sidecars.
- `BinderService.updateEntryWithSidecars()` — writes new sidecars, but is only called when `sidecars.length > 0`.
- `edit.tsx` gates the two paths correctly:
  ```ts
  if (sidecars.length > 0) {
    await binderService.updateEntryWithSidecars(entryPath, updatedDoc, sidecars);
  } else {
    await binderService.updateEntry(entryPath, updatedDoc);
  }
  ```
- `NoteEditor` tracks new attachments separately from existing ones. Existing `.enc` files are preserved as `children` on the document object — never re-added to the sidecars array.

**Editing a medication's dosage or a note's text does not re-encrypt or re-write any binary sidecar.**

## Growth Projections

### Text-only binder (no photos/audio)

| Activity | Blobs added | Size per blob | Cumulative |
|----------|------------|---------------|------------|
| Initial creation (9 folders) | 10 | ~190 B avg | ~1.9 KB |
| 50 entries added | 50 | ~400 B avg | ~22 KB |
| 200 edits across entries | 200 | ~400 B avg | ~102 KB |
| **Total after 1 year** | **260** | | **~102 KB** |

### Binder with audio recordings

| Activity | Blobs added | Size per blob | Cumulative |
|----------|------------|---------------|------------|
| Text (same as above) | 260 | ~400 B | ~102 KB |
| 50 audio recordings (30s each) | 50 | ~150 KB avg | ~7.5 MB |
| 50 audio metadata .json | 50 | ~400 B | ~20 KB |
| **Total after 1 year** | **360** | | **~7.6 MB** |

Audio is 98% of storage. A 5-minute recording could be 1-3 MB per blob.

### Binder with photos

| Activity | Blobs added | Size per blob | Cumulative |
|----------|------------|---------------|------------|
| Text (same as above) | 260 | ~400 B | ~102 KB |
| 20 photos | 20 | ~500 KB-2 MB | ~10-40 MB |
| **Total after 1 year** | **280** | | **~10-40 MB** |

## Key Insight

Text medical records are cheap — encryption overhead is irrelevant at ~400 B per document version. The storage concern is entirely about **binary attachments** (audio, photos), where each blob is 100-1000x larger than text and can never be delta-compressed.

## Potential Mitigations (Not Yet Implemented)

1. **Client-side shallow clone**: only fetch recent N commits, not full history
2. **History compaction**: squash old commits to discard intermediate blob versions
3. **Separate binary storage**: store `.enc` sidecars outside git (e.g. object storage with content-addressed keys), keep only references in git
4. **Compress before encrypt**: run zlib/brotli on plaintext before NIP-44 encryption — recovers some compression for text blobs (not useful for already-compressed audio/photos)
5. **Server-side `git gc --aggressive`**: won't help with encrypted blobs but cleans up tree/commit object overhead
