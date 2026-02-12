# Limbo Health Mobile App — Requirements Document

**Project:** Medical Binder (Expo React Native, iOS-first)
**Date:** February 2026
**Status:** Pre-development requirements

---

## 1. Product Overview

The Medical Binder is a patient-facing mobile app that gives users self-custody of their medical records. Records are stored as encrypted Git repositories using NIP-44 encryption, synced with the Limbo Health mgit-api server, which is deployed to production at `limbo.health` via Railway. The phone serves as both the primary data viewer and the Nostr key custodian — holding the user's private key in secure hardware storage (iOS Keychain) and acting as the signing authority for all cryptographic operations, including those initiated from the web app (via NIP-46 in a future phase).

The app targets Nostr-native users in v1. Google OAuth users are out of scope for initial release but the architecture should not preclude adding them later.

### Prior Art

A previous version of this project successfully demonstrated a React Native app using a native module to pull and push Git repositories. That implementation suffered code rot and is no longer usable, but it proved the core concept: native Git operations on a phone talking to the mgit-api server work. The approach for v1 should evaluate both isomorphic-git (pure JS, simpler integration) and native modules (proven path, better performance for large repos) during the spike phase.

---

## 2. User Personas (v1)

**Self-sovereign patient:** Has a Nostr keypair, uses nos2x on desktop, wants to carry their medical records on their phone. Comfortable with the concept of private keys. May or may not already have a Medical Binder repository created via the web app.

---

## 3. Authentication

### 3.1 Nostr Login (v1, required)

The user authenticates by proving ownership of a Nostr private key. Two sub-flows:

**Import existing keys:** User pastes or scans their `nsec` (bech32-encoded private key). The app derives the public key, stores the private key in iOS Keychain (hardware-backed secure storage), and authenticates against the Limbo Health auth-api using the existing challenge-response flow (kind:22242 event signing → JWT).

**Generate new keys:** For users who don't yet have a Nostr identity, the app generates a secp256k1 keypair, displays the `nsec` for backup (with strong warnings about writing it down), stores it in Keychain, and proceeds with the same auth flow.

### 3.2 Google OAuth (future, out of scope for v1)

Deferred. When implemented, this will require solving the custodial key problem — likely via a vault password (Option B from prior architecture discussions). The app architecture should keep the signing/encryption layer abstracted so that swapping the key source from "Keychain lookup" to "decrypt-with-vault-password" doesn't require rewriting business logic.

### 3.3 Key Storage

The Nostr private key is stored in iOS Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` protection. It never leaves the device, is not included in iCloud backups, and is not accessible to other apps. On Android (future), the equivalent is Android Keystore with `setUserAuthenticationRequired`.

### 3.4 Session Management

After initial Nostr auth, the app receives a JWT from auth-api (24-hour expiry, matching the web app). The JWT is stored in secure storage and used for all subsequent API calls. Token refresh should happen silently before expiry. If the token expires or is revoked, the app re-signs a challenge using the locally held private key — no user interaction required beyond biometric unlock.

---

## 4. Core Features

### 4.1 Medical Binder Management

#### 4.1.1 List Binders

On login, the app fetches the user's repositories from mgit-api (`/api/mgit/repos`). Each repository is displayed as a "Binder" card showing the binder name, creation date, description, and last-modified date derived from the most recent Git commit.

#### 4.1.2 Create a New Binder

The user creates a new Medical Binder entirely on-device. The app runs `git.init` locally, creates the initial `patient-info.json` from user input, encrypts it with NIP-44, commits it, and the binder is ready to use — no server involved.

The binder lives locally and can be used fully offline indefinitely. When the user is ready to back up to the cloud (or never), they push to `limbo.health`. The server auto-creates the bare repository on first push and registers the pushing user as the owner. This is the **local-first** model — the server is a dumb encrypted storage layer, not a prerequisite for using the app.

The `POST /api/mgit/repos/create` endpoint remains available for the web app but is not used by the mobile app.

#### 4.1.3 Clone Existing Binder

If the user already has repositories (created via web), they can clone them to the device. This uses isomorphic-git's `clone` over the existing Smart HTTP transport that mgit-api exposes. The clone URL and JWT can also be obtained by scanning the QR code displayed in the web app's patient dashboard — the QR encodes `{ action: "mgit_clone", clone_url, jwt_token, repo_name }`.

#### 4.1.4 Sync (Push/Pull)

The app performs `git pull` on open and `git push` after local commits. Conflict resolution in v1 is simple: last-write-wins at the file level, since the patient is the sole writer in the current model. The sync indicator shows pending changes, last sync time, and sync errors.

### 4.2 Encryption Layer

All medical data is encrypted client-side before being committed to Git. The encryption uses NIP-44 (secp256k1 ECDH, HKDF, ChaCha20, HMAC-SHA256) with the patient encrypting to their own public key for storage.

Since the private key lives in Keychain (not in a browser extension), the app performs NIP-44 encrypt/decrypt natively using `@noble/curves` and `@noble/hashes` — the same libraries the audited TypeScript NIP-44 implementation uses. There is no dependency on `window.nostr` or any extension.

**Key functions the app must implement (matching the web app's `utils.ts`):**

- `encryptForStorage(data)` — encrypt medical data to self (own pubkey) using NIP-44
- `decryptFromStorage(ciphertext)` — decrypt own medical data using NIP-44
- `encryptForDoctor(data, doctorPubkey)` — re-encrypt for sharing (future)
- `decryptFromPatient(ciphertext, patientPubkey)` — doctor-side decryption (future)

**React Native constraints (confirmed by spike):** Hermes lacks `Buffer` and `crypto.getRandomValues` natively. Required polyfills: `buffer` package (globalThis.Buffer — needed by isomorphic-git), `expo-crypto` shim for `crypto.getRandomValues` (needed by `@noble` libraries). `TextEncoder`, `TextDecoder`, `ReadableStream`, `atob`, and `btoa` are available natively on current Hermes. Metro bundler requires `unstable_enablePackageExports = true` to resolve `@noble` subpath exports.

### 4.3 Adding Content to a Binder

This is the core daily-use feature. The user opens a Binder, picks a category (visits, labs, conditions, etc.), and creates a new entry. An "entry" is a JSON document with a markdown `value` field, `metadata`, and optional `children`, encrypted and committed to the Git repository.

#### 4.3.1 Rich Text / Markdown Editor

The editor is where the user composes the `value` field of a medical document. Since `value` is markdown, the editor should provide a comfortable mobile markdown editing experience. Required capabilities:

- Bold, italic, underline (mapped to markdown syntax)
- Headings (2 levels sufficient — `##` and `###`, since `#` is reserved for the document title)
- Bulleted and numbered lists
- Inline links
- The editor should show a live preview or use a WYSIWYG-style markdown editor rather than raw markdown input, since most patients aren't markdown-literate

On save, the editor outputs a markdown string that becomes the `value` field. The app wraps it in the standard JSON envelope (`{ value, metadata, children }`), encrypts the whole thing with NIP-44, and writes it to the appropriate folder (e.g., `visits/2026-02-09-follow-up.json`).

#### 4.3.2 Media Attachments (within the editor)

While composing an entry, the user can attach:

- **Photos** from the camera roll or taken in-the-moment
- **Videos** from the camera roll or recorded in-the-moment
- **Audio recordings** started from within the editor

Attachments are added as `children` of the current document with `metadata.type: "attachment"` and the binary data base64-encoded in the child's `value` field. This follows the canonical format spec — attachments are semantically dependent on their parent document and meaningless without it.

The editor UI should show attachment thumbnails/indicators inline, but the underlying data model stores them as children in the parent JSON, not as separate files.

#### 4.3.3 Standalone Media Capture

Separate from the rich text editor, the user can quickly capture media without composing a full note:

- **Take a photo** (e.g., snap a prescription label, a wound, a test result)
- **Record a video** (e.g., record a symptom for a doctor to review)
- **Record audio** (e.g., record a doctor visit conversation with consent, or dictate a personal note)

Each standalone capture creates a minimal JSON document in the appropriate folder. For example, a quick photo of a prescription would create `medications/2026-02-09-prescription-photo.json` containing:

```json
{
  "value": "# Prescription Photo\n\nCaptured 2026-02-09",
  "metadata": {
    "type": "medication",
    "created": "2026-02-09T14:30:00Z",
    "tags": ["quick-capture"]
  },
  "children": [
    {
      "value": "base64_encoded_photo_data",
      "metadata": {
        "type": "attachment",
        "format": "jpeg",
        "encoding": "base64"
      },
      "children": []
    }
  ]
}
```

This supports the "quick capture now, annotate later" workflow — the user can later edit the `value` field to add notes about the prescription.

### 4.4 Viewing Binder Contents

The app must be able to decrypt and render all content types:

- **Markdown entries:** Decrypt the JSON, extract the `value` field, and render the markdown with proper formatting
- **Attachments (children):** Detect `metadata.type: "attachment"` children, decode base64 `value`, and render inline (photos displayed, audio/video with playback controls, PDFs with a viewer)
- **Children generally:** Render addendums, doctor notes, and follow-up items beneath their parent document in a visually nested layout
- **patient-info.json:** Parse and display structured demographics in a readable summary card

The primary navigation is by folder (visits, labs, conditions, etc.), with entries listed chronologically within each folder. The app should also support:
- A unified timeline view across all folders
- Search over decrypted content (happens locally since the server can't see plaintext)
- Filtering by tags from `metadata.tags`

### 4.5 Category-Aware Entry Creation

When the user taps "Add Entry," the app should present the folder categories (visits, labs, conditions, medications, allergies, immunizations, procedures, imaging, insurance) and route to the appropriate creation flow. Some categories benefit from light templating:

- **Visits:** Pre-populate heading with date, prompt for provider name
- **Labs:** Prompt for test name, lab facility, results structure
- **Medications:** Prompt for drug name, dosage, prescriber
- **Conditions:** Prompt for diagnosis name, date of diagnosis

Templates are suggestions, not constraints — the user can always freeform edit the markdown.

### 4.5 QR Code Scanning

The app should include a QR code scanner for two use cases:

**Clone a repo from the web app:** The web patient dashboard displays a QR code containing `{ action: "mgit_clone", clone_url, jwt_token, repo_name }`. Scanning this initiates a clone of that repository to the device.

**Future: NIP-46 remote signing connection.** When the web app implements NIP-46 client mode, the phone will scan a `bunker://` connection URI to establish a remote signing session. This is out of scope for v1 implementation but the QR scanner infrastructure should be in place.

---

## 5. Data Architecture

The canonical repository format is defined in `medical-repo-structure.md` (maintained separately). This section summarizes the key aspects the mobile app must implement.

### 5.1 Repository Structure

Each patient's Medical Binder is a Git repository with this top-level layout:

```
/
├── patient-info.json          # Basic demographics (required, only file at init)
├── conditions/                # Chronic conditions and diagnoses
├── visits/                    # Doctor visits and consultations
├── labs/                      # Laboratory test results
├── imaging/                   # Radiology and imaging reports
├── medications/               # Current and historical medications
├── allergies/                 # Known allergies and adverse reactions
├── immunizations/             # Vaccination records
├── procedures/                # Surgical and medical procedures
└── insurance/                 # Insurance and billing information
```

Directories are created on-demand as the patient adds records. The only required file at initialization is `patient-info.json`.

### 5.2 Document Format

Every medical document follows a standard JSON schema:

```json
{
  "value": "# Document Title\n\nMarkdown content here...",
  "metadata": {
    "type": "visit|lab|condition|medication|etc",
    "created": "ISO 8601 timestamp",
    "updated": "ISO 8601 timestamp",
    "provider": "Provider name (optional)",
    "npi": "Provider NPI (optional)",
    "tags": ["tag1", "tag2"]
  },
  "children": []
}
```

The `value` field contains a complete, standalone markdown document. The `children` array holds semantically dependent sub-documents (addendums, attachments, doctor interpretations) — items that are meaningless without the parent context. Independent records go in separate files.

The mobile app's rich text editor must produce markdown that populates the `value` field. The editor should render markdown on read and serialize back to markdown on save.

### 5.3 Folders vs Children Decision

The app UI needs to guide users toward the correct organizational pattern:

**Create a new file in a folder** when the record is independent (a new visit, a new lab result, a new condition). **Add a child to an existing document** when the information is supplementary to an existing record (an addendum to a visit, a doctor's interpretation of a lab result, a PDF attachment).

The decision tree from the format spec:
- New independent information → new file in the appropriate folder
- New information that provides context/correction/addition to an existing document → add as child
- New information related to but independent of an existing document → new peer file

### 5.4 File Naming Convention

All files follow `YYYY-MM-DD-descriptive-name.json` (lowercase, hyphens, ISO date prefix for chronological sorting). The app should auto-generate filenames from the entry date and a user-provided title, with the user able to override.

### 5.5 Media and Attachments

Binary content (photos, PDFs, scanned documents) is stored as base64-encoded data in a `children` entry with `metadata.type: "attachment"` and `metadata.encoding: "base64"`. This keeps all data within the JSON document format.

Audio and video recordings follow the same pattern — base64-encoded in a child node. Given Git's limitations with large binary data, enforce client-side limits:
- Photos: compress to under 2MB before base64 encoding
- Audio: limit to 5 minutes, compressed format (AAC/M4A)
- Video: limit to 30 seconds / 10MB before encoding
- PDFs: accept as-is up to 5MB

**Note:** Base64 encoding inflates size by ~33%. A 2MB photo becomes ~2.7MB in the JSON file. These limits account for that overhead. Git LFS or external encrypted blob storage is a future consideration for larger media.

### 5.6 Encryption

All `.json` files are encrypted with NIP-44 before any Git operation. The entire JSON string (including `value`, `metadata`, and `children`) is encrypted as a single blob. The server stores opaque ciphertext and cannot parse filenames, folder structure, or content.

**Important:** The file naming convention (dates, descriptive names) and folder structure are visible in the Git tree since Git needs to know file paths. This means a compromised server could see that a file exists at `visits/2024-01-15-annual-physical.json` but cannot read its content. This is an accepted tradeoff for v1 — fully encrypted paths would require a custom Git transport layer.

### 5.7 Local Storage

Each cloned Binder lives as a full Git repository on the device filesystem. The working directory contains encrypted files; plaintext only exists transiently in memory during viewing/editing.

Storage location: the app's sandboxed Documents directory (persisted across app updates, included in encrypted device backups if the user chooses).

### 5.8 Git Commit Workflow

When the user saves a new entry:

1. User creates/edits content in the rich text editor (produces markdown)
2. Build the JSON document (`{ value, metadata, children }`)
3. `JSON.stringify` the document
4. Encrypt with NIP-44 (`encryptForStorage`)
5. Create the folder if needed (`mkdir -p`)
6. Write the encrypted blob to the file path
7. `git add` the new/changed files
8. `git commit` with a structural message (e.g., `"Add visit 2026-02-09"` — no PHI in commit messages)
9. `git push` to mgit-api at `limbo.health` (if online; queue for later if offline)

### 5.9 Local-First Repository Creation

Binders are created locally on-device using `git init`. The user can add entries, encrypt, and commit entirely offline with no server involvement. The server only becomes involved when the user chooses to sync.

On first push, the mgit-api server auto-creates the bare repository if it doesn't already exist, registering the pushing user's pubkey as the owner with admin access. This means:

- No explicit "create repo" API call is needed before pushing
- The mobile app never depends on server availability for binder creation
- Users can maintain purely local binders indefinitely
- The `POST /api/mgit/repos/create` endpoint remains available for the web app but is not required by the mobile app

### 5.10 Offline Support

The app must work fully offline for viewing already-cloned binder content and creating new entries. New entries are committed locally and pushed when connectivity is restored. The sync queue must be persistent (survive app kill / device restart) so entries are never lost before push.

---

## 6. Technical Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Expo (managed workflow if possible, bare if native modules require it) | |
| Language | TypeScript | Matches web app |
| Navigation | Expo Router or React Navigation | |
| Git operations | isomorphic-git (preferred) or native module (fallback — proven in prior prototype) | Spike required to validate Hermes compat |
| Cryptography | @noble/curves, @noble/hashes | Pure JS, audited, used by NIP-44 reference implementation |
| NIP-44 | Custom implementation or nostr-tools NIP-44 module | Verify Hermes compatibility |
| Key storage | expo-secure-store (wraps iOS Keychain) | |
| HTTP client | fetch (built-in) | For Git Smart HTTP transport and API calls to `limbo.health` |
| Markdown editor | TBD — evaluate react-native-markdown-editor, 10tap-editor, or similar | Must output markdown string for `value` field |
| Markdown renderer | react-native-markdown-display or similar | For reading/viewing entries |
| Camera/photos | expo-camera, expo-image-picker | |
| Video recording | expo-camera (video mode) | |
| Audio recording | expo-av | |
| QR scanning | expo-camera (barcode scanner) or expo-barcode-scanner | |
| File system | expo-file-system | For Git working directory |
| Base64 | react-native-base64 or custom utility | No Buffer/atob/btoa in RN |
| Icons | @tabler/icons-react-native (if available) or tabler icon SVGs | Match web app icon library |

---

## 7. API Dependencies

The mgit-api is deployed to production at `limbo.health` via Railway. The mobile app consumes these existing endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/nostr/challenge` | POST | Get signing challenge |
| `/api/auth/nostr/verify` | POST | Submit signed event, receive JWT |
| `/api/mgit/user/repositories` | GET | List user's repositories |
| `/api/mgit/repos/{repoId}/info/refs?service=git-upload-pack` | GET | Git Smart HTTP (clone/pull) |
| `/api/mgit/repos/{repoId}/git-upload-pack` | POST | Git Smart HTTP (clone/pull) |
| `/api/mgit/repos/{repoId}/info/refs?service=git-receive-pack` | GET | Git Smart HTTP (push, auto-creates repo if needed) |
| `/api/mgit/repos/{repoId}/git-receive-pack` | POST | Git Smart HTTP (push, auto-creates repo if needed) |
| `/api/mgit/qr/clone/{repoId}` | GET | QR code data (if scanning from another device) |

**Not used by mobile app:** `POST /api/mgit/repos/create` — the mobile app creates binders locally and relies on push-to-create instead.

### 7.1 Server-Side Change: Auto-Create on Push

**Status: Required before mobile app ships.**

The `git-receive-pack` endpoints (both the `info/refs` advertisement and the POST handler) must be modified to auto-create a bare repository when a push targets a repo that doesn't exist yet. The pushing user's pubkey is registered as the owner with admin access. This enables the local-first workflow where binders are created on-device and the server is a dumb storage layer that accepts whatever the client pushes.

The `POST /api/mgit/repos/create` endpoint remains available for the web app but is no longer required by the mobile app. It can eventually be deprecated once the web app also adopts the push-to-create pattern.

The production base URL is `https://limbo.health`.

---

## 8. Security Considerations

**Private key never leaves secure hardware storage.** All signing and decryption operations read the key from Keychain, use it in memory, and discard it. The key is never logged, serialized to disk outside Keychain, or transmitted over the network.

**Plaintext exists only in memory.** Decrypted medical data is held in React state or transient variables. It is never written to disk unencrypted. When the app backgrounds or the user navigates away from a decrypted view, the plaintext should be cleared from state.

**Commit messages must not contain PHI.** Commit messages are visible in the Git log and are not encrypted. They should contain only structural information (entry type, date) and never medical content.

**Transport security.** All API communication uses HTTPS. JWT tokens are stored in expo-secure-store, not AsyncStorage.

**Biometric gating.** The app should support Face ID / Touch ID as a gate before decrypting binder content. This leverages iOS Keychain's built-in biometric access controls (`kSecAccessControlBiometryCurrentSet`).

---

## 9. Screen Map (Conceptual)

```
Launch
├── Onboarding (first launch only)
│   ├── Import Nostr Key (paste nsec or scan QR)
│   └── Generate New Key (display nsec for backup)
│
├── Login (challenge-response, automatic if key in Keychain + valid JWT)
│
├── Binder List (home screen)
│   ├── [+ Create New Binder]
│   ├── [Scan QR to Clone]
│   └── Binder Card → Binder Detail
│
├── Binder Detail (single binder view)
│   ├── Patient Info card (from patient-info.json)
│   ├── Category Grid (visits, labs, conditions, medications, allergies, immunizations, procedures, imaging, insurance)
│   │   └── Category → File List (chronological entries in that folder)
│   │       └── Entry → Entry Detail (decrypt JSON, render markdown + children)
│   ├── Timeline Tab (unified chronological view across all categories)
│   ├── [+ Add Entry]
│   │   ├── Pick Category → Markdown Editor (with optional template)
│   │   ├── Quick Photo Capture → auto-creates document with attachment child
│   │   ├── Quick Video Capture → auto-creates document with attachment child
│   │   └── Quick Audio Recording → auto-creates document with attachment child
│   └── Entry Detail
│       ├── Rendered markdown (value field)
│       ├── Inline attachment viewer (children with type: attachment)
│       ├── Addendums and sub-notes (other children)
│       └── [+ Add Child] (addendum, attachment, follow-up note)
│
└── Settings
    ├── Key Management (view pubkey, export nsec, backup warning)
    ├── Sync Status (last sync per binder, pending pushes)
    ├── Biometric Lock toggle
    └── About / Version
```

---

## 10. Out of Scope for v1

- Google OAuth login and custodial key management
- NIP-46 remote signing (phone-as-hardware-wallet for web app)
- Doctor access / QR code generation for temporary sharing
- Multi-party encryption (sharing a binder with a doctor's pubkey)
- NPPES provider lookup / verification
- WebRTC video calling from mobile
- Git LFS or external blob storage for large media
- Android build (architecture should support it, but iOS is the target)
- Push notifications
- iCloud/Google Drive backup of encrypted repos

---

## 11. Open Questions

1. **Markdown editor selection.** Which RN markdown editor provides the best mobile UX for composing the `value` field? Needs a spike to evaluate WYSIWYG-style markdown editors that output clean markdown strings.

2. **isomorphic-git on Hermes.** ✅ **Resolved by spike.** isomorphic-git works on Hermes with the following polyfills: `buffer` (globalThis.Buffer), `expo-crypto` (globalThis.crypto.getRandomValues). Requires `react-native-fs` as the filesystem adapter (custom adapter bridging RNFS to isomorphic-git's `fs` interface). Metro config needs `unstable_enablePackageExports = true` for `@noble` subpath imports.

3. **NIP-44 on Hermes.** ✅ **Resolved by spike.** The `@noble/curves`, `@noble/hashes`, and `@noble/ciphers` libraries all work on Hermes with the `expo-crypto` polyfill for `crypto.getRandomValues`. Full NIP-44 encrypt/decrypt round-trip confirmed. Import paths require `.js` extension or `esm/` prefix (e.g., `@noble/hashes/sha2.js`). The function `secp256k1.utils.randomSecretKey()` (not `randomPrivateKey`) is the correct API in current `@noble/curves` versions.

4. **Base64 media size limits.** The format spec stores attachments as base64 in `children.value`. With 33% base64 overhead and Git's binary handling characteristics, what are practical limits before repository performance degrades? Should we implement client-side compression (HEIF → JPEG, video transcoding) before base64 encoding?

5. **Migration from current repo format.** The existing mgit-api `createRepository` initializes repos with `medical-history.json`, `visits/`, `documents/`, `notes/` — a different structure than the canonical `medical-repo-structure.md` spec (which uses `patient-info.json`, `conditions/`, `labs/`, etc.). Need to decide: update `createRepository` to match the new spec, or support both formats with a migration path?

6. **Conflict resolution.** If the user edits on both web and mobile before syncing, how do we handle conflicts beyond last-write-wins? Is this a real concern given the single-writer model?

7. **Folder structure visibility.** File paths (including folder names and date-prefixed filenames) are visible in the Git tree. This means a compromised server can see the organizational structure of a patient's records. Is this acceptable for v1, or should we investigate path encryption?
