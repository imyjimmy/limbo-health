# Limbo Health Mobile App — Implementation Guide

**Target:** React Native (Expo, iOS-first)
**Demo:** Dermatology appointment in ~3 weeks. Patient photographs back acne daily, shares photo timeline with doctor via QR code at appointment.
**Date:** February 2026

---

## Context for Implementer

This document is the single source of truth for building the Limbo Health mobile app. It consolidates architectural decisions made across multiple planning sessions. The app enables patient-controlled encrypted medical records stored in Git repositories. The patient's phone is the cryptographic authority — it holds the Nostr private key in iOS Keychain and performs all encryption/decryption locally.

The server infrastructure (auth-api, mgit-api, MySQL) is deployed at `limbo.health` via Railway. The auth refactor has been completed — all authorization is centralized in auth-api with MySQL tables for `repositories`, `repository_access`, and `scan_sessions`. The mgit-api delegates all access decisions to auth-api via an internal middleware. Integration tests using Vitest confirm that JWT auth, push-to-create, clone, pull, and push all work correctly.

### What Exists Today (Server)

- **auth-api**: Nostr challenge/verify, Google OAuth, JWT issuance, internal auth endpoints (`/api/auth/check-access`, `/api/auth/register-repo`, `/api/auth/user/repositories`), scan session create/revoke endpoints
- **mgit-api**: Git Smart HTTP transport (info/refs + upload-pack + receive-pack), unified authMiddleware (JWT first, then scan token), push-to-create, staging repo cleanup job
- **MySQL tables**: `users`, `repositories`, `repository_access`, `scan_sessions`
- **nginx gateway**: Routes `/api/auth/*` → auth-api, `/api/mgit/*` → mgit-api

### What This Doc Covers

1. Complete mobile app architecture (directory structure, layers, modules)
2. Core implementation details for each module
3. The /scan feature (re-encryption, staging repo, QR display, doctor note incorporation)
4. Sidecar attachment pattern for large files
5. Photo compression pipeline
6. Platform constraints and polyfills
7. Demo-specific build priorities

---

## Demo Scope: What Must Work

The demo requires exactly four working components:

1. **Server** (DONE): auth-api scan session endpoints + mgit-api scan token auth
2. **Mobile**: Enough app to authenticate, open a binder, display QR code
3. **Mobile**: Re-encryption pipeline that creates a staging repo from the real binder
4. **Web**: `limbo.health/scan` page that scans QR, clones staging repo, decrypts, renders timeline

The demo use case is a **dermatology appointment for back acne**. The patient (you, "user 0") takes daily photos of back acne for ~21 days. At the appointment, the doctor scans the phone's QR code and sees the complete photo timeline in their browser. The doctor adds a clinical note. The patient incorporates it back into their real repo.

Features NOT needed for demo: full markdown editor, media capture beyond photos, category grid, timeline view beyond what the /scan page renders, binder management UI beyond "open binder, tap share." The binder can be pre-populated with test data before the appointment.

---

## Directory Structure

```
limbo-health-mobile/
├── app/                                    # Expo Router file-based routing
│   ├── _layout.tsx                         # Root layout (providers, polyfill init)
│   ├── index.tsx                           # Entry redirect (auth check → onboarding or home)
│   ├── (auth)/                             # Unauthenticated routes
│   │   ├── _layout.tsx
│   │   ├── welcome.tsx                     # First launch screen
│   │   ├── import-key.tsx                  # Paste nsec or scan QR
│   │   └── generate-key.tsx                # Generate keypair, show nsec backup
│   ├── (tabs)/                             # Authenticated tab navigator
│   │   ├── _layout.tsx                     # Tab bar config
│   │   ├── index.tsx                       # Binder List (home)
│   │   ├── scan.tsx                        # QR scanner (clone repo from web app)
│   │   └── settings.tsx                    # Settings root
│   └── binder/                             # Binder detail stack (not a tab)
│       ├── [binderId]/
│       │   ├── index.tsx                   # Binder detail (patient info + category grid)
│       │   ├── timeline.tsx                # Unified chronological timeline
│       │   ├── share.tsx                   # Share with Doctor (re-encrypt → QR → incorporate)
│       │   ├── category/
│       │   │   └── [category].tsx          # File list within a category folder
│       │   ├── entry/
│       │   │   ├── [entryPath].tsx         # Entry detail (decrypt + render)
│       │   │   └── new.tsx                 # New entry editor (receives category param)
│       │   └── quick-capture.tsx           # Photo/video/audio quick capture
│       └── create.tsx                      # Create new binder flow
│
├── core/                                   # Platform-agnostic business logic (no React imports)
│   ├── crypto/
│   │   ├── KeyManager.ts                  # Keychain read/write, key derivation, generateEphemeralKeypair()
│   │   ├── nip44.ts                       # NIP-44 encrypt/decrypt (using @noble)
│   │   ├── nostrAuth.ts                   # kind:22242 challenge signing, JWT flow
│   │   └── base64.ts                      # Custom base64 encode/decode (no Buffer/atob/btoa)
│   ├── git/
│   │   ├── GitEngine.ts                   # isomorphic-git operations (init, clone, pull, push, commit, add, log)
│   │   ├── fsAdapter.ts                   # Bridges react-native-fs → isomorphic-git fs interface
│   │   └── httpTransport.ts               # Custom HTTP transport (JWT or scan token auth injection)
│   ├── binder/
│   │   ├── BinderService.ts               # High-level CRUD: create, open, list entries, add entry
│   │   ├── DocumentModel.ts               # { value, metadata, children } schema, validation, serialization
│   │   ├── EncryptedIO.ts                 # Read/write with master key; read/write with explicit key pair
│   │   ├── FileNaming.ts                  # YYYY-MM-DD-slug generation, path resolution per category
│   │   └── categories.ts                  # Category definitions, icons, templates
│   ├── sync/
│   │   ├── SyncEngine.ts                  # Pull-on-open, push-after-commit, offline queue
│   │   ├── SyncQueue.ts                   # Persistent queue (JSON file) for pending pushes
│   │   └── ConflictResolver.ts            # Last-write-wins at file level (v1)
│   ├── scan/                              # Doctor sharing — ephemeral repo lifecycle
│   │   ├── ReEncryptionPipeline.ts        # Decrypt all files (master key) → re-encrypt (ephemeral key)
│   │   ├── StagingRepo.ts                 # git init → add → commit → push staging repo to limbo.health
│   │   ├── ScanSession.ts                 # POST /api/auth/scan/session, assemble QR payload
│   │   ├── IncorporateNotes.ts            # Pull staging → diff for new files → re-encrypt (master key) → commit to real repo
│   │   └── StagingDiff.ts                 # Compare staging HEAD vs snapshot commit to find doctor-added files
│   └── api/
│       ├── authClient.ts                  # Challenge/verify, JWT storage/refresh, createScanSession()
│       └── mgitClient.ts                  # Repo listing, QR clone data fetch
│
├── hooks/
│   ├── useAuth.ts                         # Auth state, login/logout, token refresh
│   ├── useBinders.ts                      # Binder list, refresh, create
│   ├── useBinderDetail.ts                 # Single binder: entries, categories, patient info
│   ├── useEntry.ts                        # Single entry: decrypt, render data, children
│   ├── useSync.ts                         # Sync status, trigger sync, pending count
│   ├── useCamera.ts                       # Photo capture with compression
│   ├── useAudioRecorder.ts                # Audio recording with duration limits
│   ├── useSecureKey.ts                    # Read privkey from Keychain (biometric gated)
│   └── useShareSession.ts                 # Full share lifecycle: re-encrypt → push → QR → poll → incorporate
│
├── components/
│   ├── BinderCard.tsx                     # Binder list item
│   ├── CategoryGrid.tsx                   # 3x3 grid of category icons
│   ├── EntryListItem.tsx                  # Entry row in category view
│   ├── MarkdownEditor.tsx                 # Wrapper around chosen editor lib
│   ├── MarkdownRenderer.tsx               # Read-only markdown display
│   ├── AttachmentThumbnail.tsx            # Photo/video/audio/PDF inline preview
│   ├── SyncIndicator.tsx                  # Status badge (synced, pending, error)
│   ├── PatientInfoCard.tsx                # Demographics summary from patient-info.json
│   ├── QRScanner.tsx                      # Camera-based QR scanner (clone-from-web flow)
│   ├── QRDisplay.tsx                      # Full-screen QR code with countdown timer
│   ├── DoctorNotePreview.tsx              # Preview of doctor's note before incorporating
│   ├── ShareProgress.tsx                  # Progress indicator for re-encryption and upload
│   ├── BiometricGate.tsx                  # Face ID / Touch ID prompt wrapper
│   └── NsecBackupWarning.tsx              # Key backup reminder UI
│
├── providers/
│   ├── AuthProvider.tsx                   # Context: JWT, pubkey, auth state, logout
│   ├── CryptoProvider.tsx                 # Context: encrypt/decrypt bound to master key, generateEphemeralKeypair
│   └── SyncProvider.tsx                   # Context: sync engine instance, status, queue count
│
├── polyfills/
│   ├── setup.ts                           # Must run FIRST: globalThis.Buffer, crypto.getRandomValues
│   └── crypto-shim.ts                    # expo-crypto → globalThis.crypto.getRandomValues
│
├── constants/
│   ├── api.ts                             # Base URL (https://limbo.health), all endpoints
│   ├── categories.ts                      # Category slugs, labels, icons, template generators
│   └── limits.ts                          # Media size limits, staging repo TTL, poll interval
│
├── types/
│   ├── document.ts                        # MedicalDocument, DocumentMetadata, AttachmentChild
│   ├── binder.ts                          # Binder, BinderSummary, SyncStatus
│   ├── auth.ts                            # NostrChallenge, JWTPayload, AuthState
│   ├── git.ts                             # CommitInfo, SyncResult, CloneOptions
│   └── scan.ts                            # ScanQRPayload, ScanSession, IncorporationResult, ShareSessionState
│
├── metro.config.js                        # unstable_enablePackageExports = true
├── app.json
├── tsconfig.json
└── package.json
```

---

## Layer Architecture

**Screens (app/) → Hooks → Core Services → Platform APIs**

Each layer has a single responsibility and strict dependency rules.

### Layer 1 — Polyfills

Run once at app start before any other code imports. Two critical shims:

- `globalThis.Buffer` from the `buffer` npm package — required by isomorphic-git
- `crypto.getRandomValues` from `expo-crypto` — required by `@noble` libraries

These must execute before any `@noble` or `isomorphic-git` import. Wire this in the root `_layout.tsx` as a synchronous import at the top of the file, before any provider or component import.

### Layer 2 — Core

Pure TypeScript with zero React dependencies. All crypto, git, encryption, document modeling, and sync logic lives here. Independently testable and could theoretically run on any JS runtime. **Core never imports from `react`, `react-native`, or any Expo module directly.** Platform dependencies (Keychain, filesystem) are injected via interfaces.

### Layer 3 — Hooks

Bridge React to core services. Each hook wraps one core service, manages loading/error state, and provides memoized functions to screens. Hooks are the only layer that calls core services.

### Layer 4 — Providers

Hold app-wide singleton state: authenticated user identity, crypto functions bound to the current key, and the sync engine. Providers are thin wrappers that initialize core services and expose them via Context.

### Layer 5 — Screens

Purely presentational. They call hooks, render components, and handle navigation. Zero business logic.

### Provider Initialization Order

This matters because of the dependency chain:

```
app/_layout.tsx
  └─ AuthProvider              (reads JWT from expo-secure-store, manages login state)
       └─ CryptoProvider       (reads privkey from Keychain once auth confirmed, binds encrypt/decrypt)
            └─ SyncProvider    (initializes SyncEngine with httpTransport using JWT from AuthProvider)
                 └─ <Slot />   (the rest of the app)
```

CryptoProvider doesn't activate until AuthProvider confirms a valid session. SyncProvider needs both the JWT (for git push/pull auth) and connectivity awareness (NetInfo).

---

## Core Module Details

### `core/crypto/KeyManager.ts`

Responsibilities: read/write the master private key from iOS Keychain (biometric gated via `expo-secure-store` with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`), derive the public key from the private key, compute NIP-44 conversation keys, and generate ephemeral keypairs for /scan sessions.

Key methods:
- `getMasterPrivkey(): Promise<Uint8Array>` — reads from Keychain, biometric prompt triggers
- `getMasterPubkey(): Promise<string>` — derives from privkey using `secp256k1.getPublicKey()`
- `getConversationKey(privkey, pubkey): Uint8Array` — ECDH + HKDF-extract for NIP-44
- `generateEphemeralKeypair(): { privkey: Uint8Array, pubkey: string }` — `secp256k1.utils.randomPrivateKey()` (note: the correct API in current `@noble/curves` versions may be `randomSecretKey()` — verify at build time)
- `storeMasterPrivkey(privkey: Uint8Array): Promise<void>` — writes to Keychain during onboarding
- `deleteMasterPrivkey(): Promise<void>` — for logout/key rotation

The ephemeral keypair from `generateEphemeralKeypair()` is NOT stored in Keychain. It lives in the calling hook's React state for the duration of the share session and is discarded when the session ends.

### `core/crypto/nip44.ts`

Implements NIP-44 v2 encrypt/decrypt using `@noble/curves/secp256k1`, `@noble/hashes/sha256`, `@noble/hashes/hkdf`, and `@noble/ciphers/chacha`. The full spec is in the project's `NIP-44-README.md`.

Critical implementation notes:

- NIP-44 operates on **strings only**. Binary data (photos, PDFs) must be base64-encoded to a string before encryption.
- The conversation key is derived from `ECDH(privkey, pubkey)` via `HKDF-extract` with salt `'nip44-v2'`.
- Each message uses a fresh random 32-byte nonce from `crypto.getRandomValues`.
- The output is a base64-encoded payload: `concat(version_byte, nonce, ciphertext, mac)`.
- NIP-44 has a max plaintext size of 65,535 bytes. Sidecar files containing base64-encoded photos can exceed this. **If the base64 string exceeds 65KB, chunk it or use a wrapper that handles large payloads.** In practice, a 400KB compressed JPEG base64-encodes to ~533KB, which exceeds the 65KB NIP-44 limit. The implementation must handle this — likely by encrypting the base64 string in chunks or by using the NIP-44 conversation key directly with ChaCha20 for large payloads (bypassing the padding scheme).

**This is a critical implementation detail to resolve during the crypto module build.** The simplest approach: for sidecar `.enc` files, use the conversation key derived by NIP-44's `getConversationKey()` but encrypt with raw ChaCha20+HMAC (the same primitives NIP-44 uses internally) without the 65KB padding constraint. Document this as "NIP-44 compatible large payload encryption."

Key functions:
- `encrypt(plaintext: string, conversationKey: Uint8Array): string` — standard NIP-44 encrypt
- `decrypt(payload: string, conversationKey: Uint8Array): string` — standard NIP-44 decrypt
- `encryptLarge(data: string, conversationKey: Uint8Array): string` — for sidecar files exceeding 65KB
- `decryptLarge(payload: string, conversationKey: Uint8Array): string` — corresponding decrypt
- `getConversationKey(privkey: Uint8Array, pubkey: string): Uint8Array` — re-export from KeyManager for convenience

### `core/crypto/nostrAuth.ts`

Handles the Nostr challenge/verify flow for JWT acquisition:

1. Call `POST /api/auth/nostr/challenge` → receive challenge string
2. Build a kind:22242 Nostr event with the challenge as content
3. Sign the event using the master privkey from Keychain
4. Call `POST /api/auth/nostr/verify` with the signed event → receive JWT
5. Store JWT in `expo-secure-store`

The signing uses `schnorr.sign()` from `@noble/curves/secp256k1`. The event JSON structure follows NIP-01 (id = sha256 of serialized event, sig = schnorr signature).

### `core/crypto/base64.ts`

Custom base64 encode/decode. **React Native (Hermes) does not have `Buffer`, `atob`, or `btoa`.** Do not use any of these. Implement a pure lookup-table based encoder/decoder or use the `react-native-base64` library. This module is used everywhere that base64 is needed — photo encoding, NIP-44 payload encoding, etc.

### `core/git/GitEngine.ts`

Wraps isomorphic-git with Limbo-specific operations. The raw isomorphic-git API is never called outside this module.

Key methods:
- `initBinder(dir: string): Promise<void>` — `git init` + initial commit
- `cloneRepo(dir: string, repoId: string, auth: AuthConfig): Promise<void>` — `git clone` from `limbo.health`
- `pull(dir: string, auth: AuthConfig): Promise<void>` — `git pull` (fetch + merge)
- `push(dir: string, auth: AuthConfig): Promise<void>` — `git push`
- `commitEntry(dir: string, filePaths: string[], message: string): Promise<string>` — `git add` + `git commit`, returns commit hash
- `log(dir: string): Promise<CommitInfo[]>` — `git log`
- `listFiles(dir: string): Promise<string[]>` — list tracked files in working tree

The `auth` parameter is either `{ type: 'jwt', token: string }` or `{ type: 'scanToken', token: string }`, passed through to `httpTransport`.

All git operations use `httpTransport` for the `http` plugin and `fsAdapter` for the `fs` parameter.

### `core/git/fsAdapter.ts`

Bridges `react-native-fs` (RNFS) to isomorphic-git's expected `fs` interface (`promises.readFile`, `promises.writeFile`, `promises.mkdir`, `promises.readdir`, `promises.stat`, `promises.unlink`, `promises.rmdir`).

**Critical rule:** `readFile` with `{ encoding: 'utf8' }` returns `string | Uint8Array` from the adapter. Every call site must assert `as string`:

```typescript
const content = await fs.promises.readFile(path, { encoding: 'utf8' }) as string;
```

The adapter roots all operations under the app's Documents directory:
`${RNFS.DocumentDirectoryPath}/binders/{binderId}/`

Each binder gets its own directory containing a full `.git/` and the working tree of encrypted files.

### `core/git/httpTransport.ts`

Custom `http` plugin for isomorphic-git that injects auth headers. It points at `https://limbo.health/api/mgit/repos/{repoId}/`.

For JWT auth: sets `Authorization: Bearer {jwt}` header.
For scan token auth: appends `?scan_token={token}` as a query parameter (easier than custom headers for isomorphic-git's browser http plugin).

The transport is constructed with the auth config at call time — GitEngine passes the appropriate config depending on whether the operation is for a real repo (JWT) or a staging repo clone (scan token on the doctor's side — but the mobile app always uses JWT for staging repo push).

### `core/binder/EncryptedIO.ts`

**The single choke point for all medical file reads and writes.** No other code in the app touches encrypted files directly. This guarantee keeps plaintext off disk.

Four methods:

```typescript
// Master key operations (most common)
readDocument(path: string): Promise<MedicalDocument>
  // fsAdapter.readFile(path) → nip44.decrypt(ciphertext, masterConversationKey) → JSON.parse → typed MedicalDocument

writeDocument(path: string, doc: MedicalDocument): Promise<void>
  // JSON.stringify(doc) → nip44.encrypt(plaintext, masterConversationKey) → fsAdapter.writeFile(path, ciphertext)

// Explicit key operations (used by scan re-encryption pipeline)
readDocumentWithKey(path: string, conversationKey: Uint8Array): Promise<MedicalDocument>
writeDocumentWithKey(path: string, doc: MedicalDocument, conversationKey: Uint8Array): Promise<void>
```

For sidecar `.enc` files (binary attachments), two additional methods:

```typescript
readSidecar(path: string): Promise<Uint8Array>
  // fsAdapter.readFile(path) → nip44.decryptLarge(ciphertext, masterConversationKey) → base64Decode → Uint8Array

writeSidecar(path: string, binaryData: Uint8Array): Promise<void>
  // base64Encode(binaryData) → nip44.encryptLarge(base64String, masterConversationKey) → fsAdapter.writeFile

readSidecarWithKey(path: string, conversationKey: Uint8Array): Promise<Uint8Array>
writeSidecarWithKey(path: string, binaryData: Uint8Array, conversationKey: Uint8Array): Promise<void>
```

EncryptedIO receives the master conversation key from CryptoProvider at initialization. The `WithKey` variants are used only by the scan re-encryption pipeline.

### `core/binder/DocumentModel.ts`

Defines the `MedicalDocument` type and provides validation:

```typescript
interface MedicalDocument {
  value: string;                    // Markdown content (or base64 for inline attachments, or sidecar filename for attachment_ref)
  metadata: DocumentMetadata;
  children: MedicalDocument[];
}

interface DocumentMetadata {
  type: string;                     // 'visit' | 'lab' | 'condition' | 'medication' | 'attachment' | 'attachment_ref' | etc.
  created: string;                  // ISO 8601
  updated?: string;                 // ISO 8601
  provider?: string;
  npi?: string;
  tags?: string[];
  format?: string;                  // 'jpeg' | 'png' | 'pdf' | 'mp3' | etc. (for attachments)
  encoding?: string;                // 'base64' (for attachments)
  originalSizeBytes?: number;       // Original binary size before base64 (for attachment_ref)
  condition?: string;               // Condition slug (for photo entries in condition subfolders)
}
```

**Attachment type rules (the 50KB rule):**

- `type: "attachment"` — inline. The `value` field contains base64-encoded data directly. Used for items under 50KB of base64 content (small icons, thumbnails, short text addendums).
- `type: "attachment_ref"` — sidecar. The `value` field contains the sidecar filename (e.g., `"2026-02-12-photo.enc"`). The actual content lives in a separate `.enc` file in the same directory. Used for items over 50KB (photos, PDFs, audio, video).

The `.enc` extension is a convention — it signals "this is an encrypted binary file, not a JSON document." The filesystem doesn't care; it's just bytes. The extension gives client code a fast way to filter: `*.json` for documents, `*.enc` for sidecars.

### `core/binder/FileNaming.ts`

Generates file paths following the `YYYY-MM-DD-descriptive-name.json` convention:

- `generateDocPath(category: string, slug: string, date?: Date): string` — e.g., `visits/2026-02-12-follow-up.json`
- `generateSidecarPath(docPath: string, index?: number): string` — e.g., `conditions/back-acne/2026-02-12-photo.enc`, or `2026-02-12-photo-2.enc` for second attachment
- `generateConditionSubfolder(conditionSlug: string): string` — e.g., `conditions/back-acne/`

Same-day collision handling: append a counter — `2026-02-12-photo-2.json` / `2026-02-12-photo-2.enc`.

### `core/binder/BinderService.ts`

High-level CRUD operations that compose EncryptedIO, FileNaming, and GitEngine:

- `createBinder(patientInfo: PatientInfo): Promise<string>` — `git init` + encrypt+write `patient-info.json` + commit
- `listEntries(binderId: string, category?: string): Promise<EntryMetadata[]>` — list `.json` files, decrypt metadata only (not full content)
- `addEntry(binderId: string, category: string, doc: MedicalDocument, sidecarData?: Uint8Array): Promise<void>` — generate path, write doc (and sidecar if present), `git add` + `git commit`
- `readEntry(binderId: string, entryPath: string): Promise<MedicalDocument>` — `EncryptedIO.readDocument`
- `readSidecar(binderId: string, sidecarPath: string): Promise<Uint8Array>` — `EncryptedIO.readSidecar`

### `core/sync/SyncEngine.ts`

Automatic pull-on-open, push-after-commit. When offline, commits happen locally (git is local-first). SyncQueue serializes pending push operations to a JSON file (`pending-syncs.json`) via the filesystem so they survive app kill. On connectivity restore (via NetInfo listener in SyncProvider), SyncEngine drains the queue in order.

Sync status per binder: `synced | pending (N changes) | error (message)`.

### `core/scan/` — The /Scan Feature

This module implements the complete doctor-patient sharing workflow. Five files, each with a single responsibility.

#### `ReEncryptionPipeline.ts`

Takes a binder ID and an ephemeral keypair. Walks every encrypted file in the binder's working tree. For each file:

1. `EncryptedIO.readDocument()` — decrypts with master key
2. `EncryptedIO.writeDocumentWithKey()` — encrypts with ephemeral key, writes to a staging directory

For sidecar `.enc` files:
1. `EncryptedIO.readSidecar()` — decrypts with master key
2. `EncryptedIO.writeSidecarWithKey()` — encrypts with ephemeral key, writes to staging directory

Output: a complete working tree at a temporary path containing the same files re-encrypted to the ephemeral keypair. Returns `{ fileCount, totalBytes }` for progress reporting.

**Plaintext exists transiently in memory** between the decrypt and re-encrypt calls. Each file is processed sequentially — at most one file's plaintext is in memory at a time.

#### `StagingRepo.ts`

Takes the staging directory path and a staging repo ID (`scan-{randomHexId}`):

1. `GitEngine.initBinder()` in the staging directory
2. `git add .`
3. `git commit` with a generic message (no PHI)
4. `git push` to `limbo.health/api/mgit/repos/scan-{randomId}/` using the patient's JWT via push-to-create
5. Records the commit hash — this is the **snapshot boundary** that later distinguishes patient files from doctor files

#### `ScanSession.ts`

1. Calls `POST /api/auth/scan/session` with the staging repo ID and the patient's JWT
2. Receives a session token that grants read+write access to the staging repo
3. Assembles the QR payload:

```typescript
interface ScanQRPayload {
  action: 'scan_session';
  ephemeralPrivkey: string;    // hex — both parties decrypt and encrypt with this
  sessionToken: string;        // grants read+write to staging repo only
  repoId: string;              // scan-{randomId}
  expiresAt: number;           // unix timestamp
  endpoint: string;            // https://limbo.health
}
```

The ephemeral **private** key is in the QR because the doctor needs it to decrypt the staging repo contents. The doctor's browser derives the pubkey from the privkey to compute the conversation key: `getConversationKey(ephemeralPrivkey, getPublicKey(ephemeralPrivkey))`. This is encrypt-to-self with the ephemeral keypair — same pattern as the patient's own repo.

#### `StagingDiff.ts`

Takes the staging repo path and the snapshot commit hash from when the patient originally pushed:

1. `git log` to find commits after the snapshot
2. Diff those commits to identify files added by the doctor
3. Returns a list of file paths (new `.json` and `.enc` files)

#### `IncorporateNotes.ts`

The bridge between key domains:

1. Pull the staging repo to get the doctor's commits
2. Call `StagingDiff` to get new file paths
3. For each new `.json` file: `EncryptedIO.readDocumentWithKey(stagingPath, ephemeralConvKey)` → `EncryptedIO.writeDocument(realBinderPath, doc)`
4. For each new `.enc` file: `EncryptedIO.readSidecarWithKey(stagingPath, ephemeralConvKey)` → `EncryptedIO.writeSidecar(realBinderPath, data)`
5. `git add`, `git commit` ("Incorporate doctor note 2026-02-12"), `git push` the real repo
6. Returns `IncorporationResult` listing what was added

---

## Hook Details

### `useShareSession.ts` — The Share Flow Lifecycle

The most complex hook. State machine:

```
idle
  → re-encrypting        (ReEncryptionPipeline runs, progress callback updates UI)
  → pushing-staging      (StagingRepo pushes to limbo.health)
  → creating-session     (ScanSession calls auth-api, gets token)
  → showing-qr           (QR displayed, countdown active)
  → waiting-for-doctor   (polling staging repo for new commits every 30s)
  → incorporating        (IncorporateNotes bridges doctor's files to real repo)
  → done                 (summary of what was incorporated)
```

Exposes: `state`, `progress` (file count during re-encryption), `qrPayload` (when in showing-qr or later), `doctorNotes` (preview of what the doctor wrote), `startShare()`, `checkForNotes()`, `incorporateNotes()`, `cancel()`.

The share screen (`share.tsx`) renders different UI for each state: progress bar during re-encryption and push, QR code with countdown during showing-qr/waiting-for-doctor, doctor note preview with "Save to My Binder" button, and confirmation screen at done.

### `useCamera.ts` — Photo Capture with Compression

Wraps `expo-image-picker` or `expo-camera` with the compression pipeline.

Compression settings (settled):
- **Resize**: 2048px on the long edge (maintains aspect ratio)
- **JPEG quality**: 0.7 (70%)
- **Tool**: `expo-image-manipulator`

```typescript
import * as ImageManipulator from 'expo-image-manipulator';

const compressed = await ImageManipulator.manipulateAsync(
  uri,
  [{ resize: { width: 2048 } }],  // maintains aspect ratio
  { compress: 0.7, format: SaveFormat.JPEG }
);
```

Result: ~200–400KB per photo. Over 21 daily photos: ~4–8MB total repo. Doctor's clone takes under 5 seconds.

The original full-res photo stays in the camera roll. The compressed version is what gets base64-encoded, encrypted, and stored as a sidecar `.enc` file.

After compression, the hook:
1. Reads the compressed file as bytes
2. Base64-encodes the bytes using `core/crypto/base64.ts`
3. Checks the 50KB threshold (photos will always exceed it → sidecar path)
4. Returns `{ base64Data: string, sizeBytes: number, uri: string }` for BinderService to write

---

## Medical Repository Structure

### Overview

Each patient's binder is a Git repository. The server stores opaque NIP-44 ciphertext and cannot read filenames, folder structure, or content.

### Root Layout

```
/
├── patient-info.json          # Basic demographics (required, only file at init)
├── conditions/                # Chronic conditions and diagnoses
│   └── back-acne/             # Subfolder per condition (Pattern 5)
│       ├── overview.json
│       ├── 2026-02-12-photo.json
│       ├── 2026-02-12-photo.enc
│       ├── 2026-02-13-photo.json
│       ├── 2026-02-13-photo.enc
│       └── ...
├── visits/
├── labs/
├── imaging/
├── medications/
├── allergies/
├── immunizations/
├── procedures/
└── insurance/
```

Directories are created on demand. Only `patient-info.json` is required at initialization.

### Document Format

Every `.json` file:

```json
{
  "value": "# Document Title\n\nMarkdown content...",
  "metadata": {
    "type": "visit|lab|condition|photo_entry|etc",
    "created": "2026-02-12T08:30:00Z",
    "updated": "2026-02-12T08:30:00Z",
    "tags": ["photo"]
  },
  "children": []
}
```

### Attachment Storage — The 50KB Rule

**Under 50KB**: Inline in child's `value` field with `type: "attachment"`:
```json
{
  "value": "<base64 data here>",
  "metadata": { "type": "attachment", "format": "jpeg", "encoding": "base64" },
  "children": []
}
```

**Over 50KB**: Sidecar `.enc` file with `type: "attachment_ref"`:
```json
{
  "value": "2026-02-12-photo.enc",
  "metadata": {
    "type": "attachment_ref",
    "format": "jpeg",
    "encoding": "base64",
    "originalSizeBytes": 350000
  },
  "children": []
}
```

The sidecar `2026-02-12-photo.enc` is encrypted identically to JSON files: base64-encode the binary → NIP-44 encrypt the string → write to `.enc` file. NIP-44 always operates on strings.

### Sidecar Encryption Process

**Write:**
1. Read raw binary data (JPEG bytes from compressed photo)
2. Base64-encode the binary to a string
3. Encrypt the base64 string with NIP-44 using the conversation key
4. Write the NIP-44 ciphertext to the `.enc` file

**Read:**
1. Read the `.enc` file (NIP-44 ciphertext)
2. Decrypt with NIP-44 to recover the base64 string
3. Base64-decode to recover the original binary

### Validation Rules

- Every `.json` file must have `value`, `metadata`, `children` fields
- `metadata` must include `type` and `created`
- Every `attachment_ref` child must have a corresponding `.enc` file in the same directory
- No orphan `.enc` files without a referencing `attachment_ref` child
- `children` array can be empty but must exist
- `value` can be empty string but must exist

### Demo Pattern: Daily Photo Tracking (Pattern 5)

```
conditions/back-acne/
  overview.json                    # Condition summary
  2026-02-12-photo.json            # Day 1: note + attachment_ref child
  2026-02-12-photo.enc             # Day 1: encrypted compressed JPEG
  2026-02-13-photo.json            # Day 2
  2026-02-13-photo.enc
  ...21 days...
```

Each `.json` file is ~1KB (metadata + note text). Each `.enc` file is ~200–400KB (compressed JPEG). Total repo size: ~4–8MB for 21 days.

Timeline rendering reads only the small `.json` files for dates and notes. Photos load lazily on demand. The doctor's /scan page renders the timeline instantly while photos stream in progressively.

---

## Security Lifecycle

### App Launch
Check `expo-secure-store` for JWT. If valid and not expired, read privkey from Keychain (biometric gated). If JWT expired, re-sign a kind:22242 challenge using the Keychain key — no user interaction beyond Face ID.

### App Foregrounding
Biometric re-auth triggers. CryptoProvider re-reads key from Keychain. Stale plaintext in React state from before backgrounding has been cleared (CryptoProvider sets a flag that causes useEntry to re-decrypt).

### App Backgrounding
CryptoProvider nullifies its in-memory key reference. Screens showing decrypted content observe this and blank the display. Encrypted files on disk are untouched — always ciphertext.

### Plaintext Never on Disk
EncryptedIO is the only file I/O path for medical data. It always writes ciphertext. The fsAdapter writes to the app's sandboxed Documents directory. Even if someone extracted the app sandbox, they'd get NIP-44 ciphertext.

### Share Flow Security
- Ephemeral keypair generated from `crypto.getRandomValues` (polyfilled)
- Keypair exists only in memory inside `useShareSession`'s state
- Re-encryption: plaintext transient, one file at a time
- QR display: ephemeral privkey displayed optically, never transmitted over network
- Master key never leaves the phone
- Staging repo wiped by server cleanup job after TTL

---

## Platform Constraints & Rules

### React Native (Hermes) — No Buffer, atob, btoa
Always use `core/crypto/base64.ts` or `react-native-base64`. Never use `Buffer.from()`, `Buffer.toString()`, `atob()`, or `btoa()`.

### Type Assertion for fsAdapter
When using `fs.promises.readFile` with `{ encoding: 'utf8' }`, always assert the return type as `string`:
```typescript
const content = await fs.promises.readFile(path, { encoding: 'utf8' }) as string;
```

### Icon Library
Use `@tabler/icons-react-native` (or tabler icon SVGs). Do not introduce new icon libraries.

### Metro Config
`metro.config.js` must set `unstable_enablePackageExports = true` for `@noble` subpath exports to resolve.

### Noble Import Paths
Use `.js` extension or `esm/` prefix: `@noble/hashes/sha256.js`, `@noble/curves/secp256k1`.

---

## API Endpoints

### auth-api (called by mobile app)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/nostr/challenge` | POST | None | Get signing challenge |
| `/api/auth/nostr/verify` | POST | None | Submit signed event → JWT |
| `/api/auth/scan/session` | POST | JWT | Create staging scan session |
| `/api/auth/scan/revoke` | POST | JWT | Revoke session early |

### mgit-api (called by mobile app, JWT auth)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/mgit/user/repositories` | GET | List user's repositories |
| `/api/mgit/repos/{repoId}/info/refs?service=git-upload-pack` | GET | Clone/pull |
| `/api/mgit/repos/{repoId}/git-upload-pack` | POST | Clone/pull |
| `/api/mgit/repos/{repoId}/info/refs?service=git-receive-pack` | GET | Push (auto-creates repo) |
| `/api/mgit/repos/{repoId}/git-receive-pack` | POST | Push (auto-creates repo) |

### Scan session creation request/response

```
POST /api/auth/scan/session
Authorization: Bearer {jwt}

Request:  { "stagingRepoId": "scan-a1b2c3d4", "expiresInSeconds": 3600 }
Response: { "sessionToken": "sctk_...", "repoId": "scan-a1b2c3d4", "expiresAt": 1739308800 }
```

---

## Data Flow: The Complete /Scan Demo

```
Patient's phone                    limbo.health                      Doctor's browser
─────────────────                  ────────────                      ─────────────────

1. Decrypt real repo (master key)
2. Re-encrypt all files (ephemeral key)
3. git push staging repo ──────►  Stores staging repo
4. POST /scan/session ──────────► Creates session row
5. Display QR code
                                                                     6. Scan QR (webcam)
                                                                     7. git clone staging repo ◄── Serves packfile
                                                                     8. Decrypt all files (ephemeral key)
                                                                     9. Render medical history timeline
                                                                    10. Doctor writes note
                                                                    11. Encrypt note (ephemeral key)
                                                                    12. git push to staging repo ──► Stores new commit
13. Pull staging repo ◄──────────  Serves new commit
14. Diff: find doctor's new files
15. Decrypt doctor's note (ephemeral key)
16. Re-encrypt (master key)
17. Commit to real repo
18. git push real repo ──────────► Stores in real repo
19. Revoke session ────────────────► Marks session revoked
                                   Cleanup job deletes staging repo
```

Steps 1–5: patient taps "Share with Doctor." Steps 6–12: doctor's browser. Steps 13–19: patient taps "Check for Doctor Notes." Server is blind throughout — git packfiles of NIP-44 ciphertext.

---

## Build Priority for Demo

### Week 1 — Core infrastructure + auth
1. `polyfills/setup.ts` + `polyfills/crypto-shim.ts`
2. `core/crypto/base64.ts`
3. `core/crypto/nip44.ts` (including large payload handling)
4. `core/crypto/KeyManager.ts`
5. `core/crypto/nostrAuth.ts`
6. `core/git/fsAdapter.ts`
7. `core/git/httpTransport.ts`
8. `core/git/GitEngine.ts`
9. `core/binder/EncryptedIO.ts`
10. `providers/AuthProvider.tsx` + `providers/CryptoProvider.tsx`
11. Basic auth screens: `welcome.tsx`, `import-key.tsx`, `generate-key.tsx`

**Milestone:** App authenticates against `limbo.health`, can clone an existing repo, decrypt and display a file.

### Week 2 — Binder ops + photo capture + share flow
1. `core/binder/DocumentModel.ts`, `FileNaming.ts`, `categories.ts`, `BinderService.ts`
2. `hooks/useCamera.ts` (compression pipeline)
3. Minimal binder detail screen that lists entries
4. Quick photo capture that creates condition/back-acne entries with sidecars
5. `core/scan/ReEncryptionPipeline.ts`
6. `core/scan/StagingRepo.ts`
7. `core/scan/ScanSession.ts`
8. `hooks/useShareSession.ts`
9. `components/QRDisplay.tsx` + `app/binder/[binderId]/share.tsx`

**Milestone:** App captures daily photo, encrypts + commits to local repo, pushes to server. "Share with Doctor" generates QR code.

### Week 3 — Doctor incorporation + polish
1. `core/scan/StagingDiff.ts`
2. `core/scan/IncorporateNotes.ts`
3. Doctor note incorporation UI
4. Polish share flow UX (progress indicators, error handling, countdown)
5. End-to-end testing with real dermatology appointment

**Milestone:** Complete demo flow works end-to-end.

---

## Dependencies (package.json)

```json
{
  "dependencies": {
    "expo": "~52.x",
    "expo-router": "~4.x",
    "expo-secure-store": "~13.x",
    "expo-crypto": "~13.x",
    "expo-camera": "~15.x",
    "expo-image-picker": "~15.x",
    "expo-image-manipulator": "~12.x",
    "expo-av": "~14.x",
    "react-native-fs": "^2.x",
    "isomorphic-git": "^1.x",
    "@noble/curves": "^1.x",
    "@noble/hashes": "^1.x",
    "@noble/ciphers": "^1.x",
    "buffer": "^6.x",
    "react-native-qrcode-svg": "^6.x",
    "@react-native-community/netinfo": "^11.x",
    "@tabler/icons-react-native": "latest",
    "react-native-base64": "^0.x"
  }
}
```

Exact versions should be pinned at project init. The `expo` version determines compatible versions for all `expo-*` packages.

---

## Open Implementation Questions

1. **NIP-44 large payload encryption.** NIP-44 has a 65KB max plaintext. Sidecar photos will exceed this after base64 encoding. The implementation needs a strategy: chunked NIP-44, raw ChaCha20 with the conversation key, or a different approach. Resolve this during the `core/crypto/nip44.ts` build.

2. **Markdown editor.** Not needed for demo (entries can be pre-populated or use a plain TextInput). For post-demo: evaluate `10tap-editor` (TipTap wrapper, WYSIWYG) vs plain toolbar over TextInput.

3. **`secp256k1.utils.randomPrivateKey()` vs `randomSecretKey()`.** The API name changed between `@noble/curves` versions. Verify which is correct at the version you install.

---

**Document Version:** 1.0
**Last Updated:** 2026-02-12
**Status:** Ready for implementation