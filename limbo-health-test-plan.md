# Limbo Health — API Integration Test Plan

**Purpose:** Define the test file structure and specific test cases for all existing endpoints and the new `/scan` feature. This document should be given to an engineer (or Claude instance) to implement the tests.

**Test runner:** Vitest with direct `fetch` calls against running services. Tests hit real HTTP endpoints — these are integration tests, not unit tests.

**Git protocol testing:** Use `isomorphic-git` as the git client in tests. This validates the full stack including Smart HTTP protocol handling, not just the auth layer.

---

## 1. Test Environment Setup

### 1.1 Prerequisites

Tests run against the local Docker Compose dev environment. The test suite assumes all services are running:

- **auth-api** at `http://localhost:3001` (or via gateway)
- **mgit-api** at `http://localhost:3002` (or via gateway)
- **scheduler-api** at `http://localhost:3003` (or via gateway)
- **gateway (nginx)** at `http://localhost:8080`
- **MySQL** at `localhost:3306`

Tests should hit the **gateway** so that nginx routing is also validated. All test URLs use the gateway base URL.

### 1.2 Test User Setup

Tests need a valid Nostr keypair for authentication. The test suite should:

1. Generate a secp256k1 keypair at suite startup using `@noble/curves/secp256k1`
2. Use this keypair for all Nostr auth flows
3. Clean up any repositories created during tests in an `afterAll` hook

### 1.3 Dependencies

```json
{
  "devDependencies": {
    "vitest": "^3.x",
    "@noble/curves": "^1.x",
    "@noble/hashes": "^1.x",
    "isomorphic-git": "^1.x",
    "nostr-tools": "^2.x"
  }
}
```

### 1.4 Important Implementation Notes

- **No `Buffer` usage in test helpers** if tests will also run in environments without it. Use `Uint8Array` and `@noble/hashes/utils` for hex encoding. Alternatively, since tests run in Node/Bun (not React Native), `Buffer` is acceptable in the test code itself — just don't copy test helpers into the mobile app.
- **auth-api and scheduler-api use Bun**, not Express. Routes have no middleware in the traditional sense. Keep this in mind when reviewing the server code for endpoint signatures.
- **mgit-api uses Node/Express.**

---

## 2. File Structure

```
tests/
├── setup/
│   ├── globalSetup.ts              # Generate test keypair, store in env
│   ├── testClient.ts               # Shared fetch wrapper (base URL, headers, error handling)
│   ├── nostrHelpers.ts             # Sign kind:22242 events, derive pubkey, encode nsec
│   ├── gitHelpers.ts               # isomorphic-git clone/push/pull wrappers for tests
│   └── cleanup.ts                  # Delete test repos after suite runs
│
├── auth/
│   ├── nostr-challenge.test.ts     # Nostr challenge/verify flow
│   └── scan-session.test.ts        # Scan session create/revoke (NEW)
│
├── mgit/
│   ├── repo-listing.test.ts        # List user repositories
│   ├── repo-create-push.test.ts    # Push-to-create flow
│   ├── repo-clone-pull.test.ts     # Clone and pull via Smart HTTP
│   ├── git-round-trip.test.ts      # Full cycle: create → push → clone → modify → push → pull
│   └── scan-token-auth.test.ts     # Scan token auth on git endpoints (NEW)
│
├── scan/
│   ├── staging-repo-lifecycle.test.ts   # Full /scan flow: create session → push staging → clone with token → push note → cleanup (NEW)
│   └── scan-security.test.ts            # Scope enforcement, expiry, revocation (NEW)
│
└── vitest.config.ts
```

---

## 3. Shared Test Utilities

### 3.1 `setup/globalSetup.ts`

Runs once before all test suites.

- Generate a secp256k1 keypair using `@noble/curves`
- Derive the hex public key
- Store both in a module-level export (or environment variable) accessible to all tests
- Optionally generate a second keypair for "unauthorized user" tests

### 3.2 `setup/testClient.ts`

A thin wrapper around `fetch` that:

- Prepends the gateway base URL (`http://localhost:8080`)
- Accepts an optional JWT or scan token and sets the appropriate `Authorization` header
- Returns typed JSON responses
- Logs request/response on failure for debugging

### 3.3 `setup/nostrHelpers.ts`

- `getChallenge()` — calls `POST /api/auth/nostr/challenge`, returns the challenge string
- `signChallenge(challenge, privkey)` — creates a kind:22242 Nostr event, signs it with the test private key using `nostr-tools`
- `authenticate()` — calls getChallenge → signChallenge → `POST /api/auth/nostr/verify`, returns the JWT. This is used by nearly every test as a setup step.

### 3.4 `setup/gitHelpers.ts`

Wrappers around `isomorphic-git` for use in tests:

- `cloneRepo(repoId, auth)` — clones from the gateway URL into an in-memory filesystem (`memfs` or `lightning-fs`). `auth` is either `{ jwt: string }` or `{ scanToken: string }`. The helper sets the appropriate HTTP header or query param.
- `pushRepo(repoId, fs, dir, auth)` — pushes to the gateway URL with the specified auth.
- `createTestFile(fs, dir, filename, content)` — writes a file, stages it, commits it. Utility for setting up repo state before push.
- `getCommitLog(fs, dir)` — returns the commit log for diffing.

**Critical:** The `http` option passed to isomorphic-git must inject auth. For JWT: `Authorization: Bearer {jwt}`. For scan tokens: append `?scan_token={token}` as a query parameter on every request URL (this matches the planned server implementation where the doctor's browser uses query params).

### 3.5 `setup/cleanup.ts`

- `deleteTestRepo(repoId)` — directly removes the repo directory from the `private_repos` volume mount. This requires either a test-only cleanup endpoint or direct filesystem access via a Docker exec command. 
- `cleanupScanSessions()` — deletes test scan session rows from MySQL.
- Called in `afterAll` hooks.

---

## 4. Test Cases

### 4.1 `auth/nostr-challenge.test.ts` — Nostr Auth Flow

These tests validate the existing auth flow that every other test depends on.

**Test: `should return a challenge string`**
- Call `POST /api/auth/nostr/challenge` with the test pubkey
- Assert response status 200
- Assert response body contains a non-empty challenge string

**Test: `should reject challenge request without pubkey`**
- Call `POST /api/auth/nostr/challenge` with empty body
- Assert response status 400

**Test: `should return JWT for valid signed challenge`**
- Get challenge, sign with test privkey, submit to `POST /api/auth/nostr/verify`
- Assert response status 200
- Assert response body contains a `token` field
- Assert the token is a valid JWT (decode and check structure — has `exp`, has `pubkey` claim matching test pubkey)

**Test: `should reject invalid signature`**
- Get challenge, sign with a *different* private key (not the one that requested the challenge)
- Submit to verify endpoint
- Assert response status 401

**Test: `should reject expired challenge`**
- Get challenge, wait or manipulate timestamp, submit stale event
- Assert response status 401
- (This test may be hard to trigger if challenges have a long TTL — note this as a known limitation and consider testing by directly manipulating the event's `created_at` field to be far in the past)

---

### 4.2 `mgit/repo-listing.test.ts` — List Repositories

**Test: `should return empty list for new user`**
- Authenticate with test keypair
- Call `GET /api/mgit/user/repositories` with JWT
- Assert response status 200
- Assert response body is an array (may be empty if no repos exist yet for this test pubkey)

**Test: `should reject unauthenticated request`**
- Call `GET /api/mgit/user/repositories` with no auth header
- Assert response status 401

---

### 4.3 `mgit/repo-create-push.test.ts` — Push-to-Create

**Test: `should create repo on first push`**
- Authenticate with test keypair
- Generate a unique repo ID: `test-push-create-{timestamp}`
- Use isomorphic-git to init a local repo (in-memory fs), create a test file, commit
- Push to `/api/mgit/repos/{repoId}/` with JWT auth
- Assert push succeeds (no error thrown)
- Call `GET /api/mgit/user/repositories` and assert the new repo appears in the list

**Test: `should reject push without auth`**
- Attempt to push to a new repo ID with no auth
- Assert push fails with 401

**Test: `should reject push with invalid JWT`**
- Attempt to push with a malformed or expired JWT
- Assert push fails with 401

---

### 4.4 `mgit/repo-clone-pull.test.ts` — Clone and Pull

**Depends on:** A repo must exist (created by push-to-create in a `beforeAll`).

**Test: `should clone existing repo`**
- Authenticate with test keypair
- Clone the repo created in setup using isomorphic-git with JWT auth
- Assert clone succeeds
- Read the test file from the cloned working tree
- Assert file content matches what was pushed

**Test: `should pull new commits`**
- Push a new commit to the repo (add a second file)
- Pull from a previously cloned copy
- Assert the second file appears in the working tree after pull

**Test: `should reject clone without auth`**
- Attempt to clone with no auth
- Assert failure with 401

**Test: `should reject clone by different user`**
- Authenticate with a *second* test keypair
- Attempt to clone the first user's repo
- Assert failure with 403 (or 404, depending on how mgit-api handles unauthorized repo access)

---

### 4.5 `mgit/git-round-trip.test.ts` — Full Lifecycle

This is the critical regression test. If the auth middleware change breaks anything, this test catches it.

**Test: `should complete full git lifecycle`**
- Authenticate
- Generate unique repo ID
- Init local repo with 3 files in different folders (e.g., `visits/test.json`, `labs/test.json`, `patient-info.json`)
- Push (push-to-create)
- Clone into a new in-memory fs
- Assert all 3 files present with correct content
- Modify one file, add a fourth file, commit
- Push the changes
- Pull from original clone
- Assert modifications and new file are present
- Check commit log has expected number of commits

This test exercises init, push-to-create, clone, modify, push (to existing), and pull in one sequence.

---

### 4.6 `auth/scan-session.test.ts` — Scan Session Management (NEW)

**Test: `should create scan session`**
- Authenticate with test keypair
- Call `POST /api/auth/scan/session` with `{ stagingRepoId: "scan-test-{timestamp}", expiresInSeconds: 3600 }`
- Assert response status 200
- Assert response contains `sessionToken`, `repoId`, `expiresAt`
- Assert `expiresAt` is approximately `now + 3600` (within a few seconds tolerance)

**Test: `should reject session creation without JWT`**
- Call `POST /api/auth/scan/session` with no auth
- Assert 401

**Test: `should reject session creation with invalid staging repo ID format`**
- Attempt to create session with a repoId that doesn't start with `scan-`
- Assert 400 (enforces naming convention to prevent accidental scoping to real repos)

**Test: `should revoke session`**
- Create a session
- Call `POST /api/auth/scan/revoke` with the session token
- Assert 200
- Attempt to use the revoked session token against a git endpoint
- Assert 401

**Test: `should reject revocation by different user`**
- Create a session as user A
- Authenticate as user B (second test keypair)
- Attempt to revoke user A's session
- Assert 403

---

### 4.7 `mgit/scan-token-auth.test.ts` — Scan Token on Git Endpoints (NEW)

**Setup (beforeAll):**
1. Authenticate as patient (test keypair)
2. Init local repo, commit test files, push to `scan-test-auth-{timestamp}` (push-to-create with JWT)
3. Create a scan session for that staging repo ID
4. Store the session token for use in tests

**Test: `should clone staging repo with scan token`**
- Clone using isomorphic-git with scan token auth (query param: `?scan_token=sctk_xxx`)
- Assert clone succeeds
- Assert test files are present in cloned working tree

**Test: `should push to staging repo with scan token`**
- Clone the staging repo with scan token
- Add a new file (simulating doctor note), commit
- Push with scan token auth
- Clone again with scan token, assert new file is present

**Test: `should reject scan token on wrong repo`**
- Create a *different* repo (push-to-create with JWT)
- Attempt to clone that different repo using the scan token scoped to the staging repo
- Assert 403

**Test: `should reject expired scan token`**
- Create a session with `expiresInSeconds: 1` (1 second)
- Wait 2 seconds
- Attempt to clone with the expired token
- Assert 401 with `SESSION_EXPIRED` or equivalent

**Test: `should reject revoked scan token`**
- Create a session, then immediately revoke it
- Attempt to clone with the revoked token
- Assert 401

**Test: `should still accept JWT on same endpoints`**
- After all scan token tests, clone the staging repo using the patient's JWT
- Assert clone succeeds
- **This is the critical regression test** — confirms that adding scan token auth didn't break JWT auth

---

### 4.8 `scan/staging-repo-lifecycle.test.ts` — Full /scan Flow (NEW)

This is the end-to-end test that simulates the complete patient→doctor→patient flow.

**Test: `should complete full scan lifecycle`**

Step-by-step:

1. **Patient authenticates** — get JWT with test keypair
2. **Patient creates staging repo** — init local repo with 3 test files (simulating medical records), push to `scan-lifecycle-{timestamp}` using JWT (push-to-create)
3. **Patient creates scan session** — `POST /api/auth/scan/session`, get session token
4. **Doctor clones staging repo** — clone using isomorphic-git with scan token auth
5. **Assert:** all 3 test files present in doctor's clone
6. **Doctor adds a note** — create `visits/{date}-doctor-note.json` in the cloned repo, commit with message `"Doctor note added {date}"`
7. **Doctor pushes** — push to staging repo using scan token
8. **Patient pulls staging repo** — pull the staging repo using JWT
9. **Assert:** doctor's note file is now present in patient's copy of the staging repo
10. **Assert:** commit log shows the doctor's commit after the patient's original commit
11. **Patient revokes session** — `POST /api/auth/scan/revoke`
12. **Assert:** scan token no longer works for clone

This test validates the entire two-way data flow through the ephemeral repo.

**Test: `should handle multiple doctor notes in one session`**

1. Set up staging repo and session (same as above)
2. Doctor clones, adds note A, pushes
3. Doctor adds note B, pushes
4. Patient pulls
5. Assert both notes are present

---

### 4.9 `scan/scan-security.test.ts` — Security Boundary Tests (NEW)

**Test: `scan token cannot access real patient repo`**
- Patient creates a real repo `my-medical-binder` via push-to-create with JWT
- Patient creates a staging repo and scan session
- Attempt to clone `my-medical-binder` using the scan token (which is scoped to the staging repo)
- Assert 403

**Test: `scan token cannot list repositories`**
- Create a scan session
- Call `GET /api/mgit/user/repositories` with scan token in auth header
- Assert 401 (scan tokens only work on git transport endpoints, not REST endpoints)

**Test: `scan token cannot create new scan sessions`**
- Create a scan session
- Attempt to call `POST /api/auth/scan/session` using the scan token instead of a JWT
- Assert 401

**Test: `staging repo naming enforcement`**
- Attempt to create a scan session with `stagingRepoId: "my-real-repo"` (no `scan-` prefix)
- Assert 400

**Test: `cleanup job deletes expired staging repos`**
- Create a scan session with short TTL (e.g., 5 seconds)
- Push a staging repo
- Wait for expiry + cleanup interval
- Attempt to clone the staging repo with a new valid token (or JWT)
- Assert 404 (repo has been deleted)
- (Note: this test depends on the cleanup interval being short enough to test. May need a test-only configuration to set cleanup interval to a few seconds, or trigger cleanup manually via a test hook.)

---

## 5. Test Execution

### 5.1 Running Tests

```bash
# Run all tests
npx vitest run

# Run specific suite
npx vitest run tests/auth/
npx vitest run tests/mgit/
npx vitest run tests/scan/

# Run with verbose output
npx vitest run --reporter=verbose

# Watch mode during development
npx vitest watch
```

### 5.2 Execution Order

Vitest runs test files in parallel by default. These tests **must run sequentially** because they share server state (repos, sessions). Configure in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    sequence: {
      concurrent: false
    },
    testTimeout: 30000, // git operations can be slow
  }
});
```

Within each file, tests should run in the order written (Vitest respects declaration order within a file by default).

### 5.3 Recommended Execution Phases

**Phase 1 — Write and run existing endpoint tests first (before writing any /scan code):**
- `auth/nostr-challenge.test.ts`
- `mgit/repo-listing.test.ts`
- `mgit/repo-create-push.test.ts`
- `mgit/repo-clone-pull.test.ts`
- `mgit/git-round-trip.test.ts`

All of these must pass against the current codebase. They are the safety net.

**Phase 2 — Write /scan tests as TDD stubs (before implementing /scan):**
- `auth/scan-session.test.ts`
- `mgit/scan-token-auth.test.ts`
- `scan/staging-repo-lifecycle.test.ts`
- `scan/scan-security.test.ts`

These will all fail initially. Implement the server-side /scan feature until they pass.

**Phase 3 — Re-run all Phase 1 tests to confirm no regressions.**

---

## 6. Environment Configuration

### 6.1 `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    sequence: {
      concurrent: false
    },
    testTimeout: 30000,
    hookTimeout: 15000,
    setupFiles: ['./tests/setup/globalSetup.ts'],
    include: ['tests/**/*.test.ts']
  }
});
```

### 6.2 Environment Variables

```bash
# .env.test
GATEWAY_URL=http://localhost:8080
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=limbo_health
MYSQL_USER=root
MYSQL_PASSWORD=your_dev_password
PRIVATE_REPOS_PATH=./private_repos    # For cleanup helper
```

---

## 7. Notes for the Implementer

### 7.1 isomorphic-git HTTP Auth

isomorphic-git's `http` plugin is pluggable. The test helpers need a custom HTTP transport that injects auth. Two approaches:

**For JWT auth:** Use the `onAuth` callback:
```typescript
await git.clone({
  ...options,
  onAuth: () => ({ headers: { Authorization: `Bearer ${jwt}` } })
});
```

**For scan token auth:** Append to the URL. This requires a custom `http` wrapper that intercepts the URL before fetch:
```typescript
const scanTokenHttp = {
  request: async ({ url, ...rest }) => {
    const separator = url.includes('?') ? '&' : '?';
    const authedUrl = `${url}${separator}scan_token=${token}`;
    return defaultHttp.request({ url: authedUrl, ...rest });
  }
};
```

Test both approaches to validate the server accepts both auth delivery methods.

### 7.2 In-Memory Filesystem for Git

Use `memfs` or `@isomorphic-git/lightning-fs` for the isomorphic-git filesystem in tests. Do not write to disk. This keeps tests fast and cleanup-free.

```typescript
import LightningFS from '@isomorphic-git/lightning-fs';
const fs = new LightningFS('test');
```

### 7.3 Unique Repo IDs

Every test that creates a repo must use a unique ID to avoid collisions between test runs. Pattern: `test-{suiteName}-{timestamp}-{random4chars}`. The cleanup helper should delete all repos matching `test-*` and `scan-test-*` patterns.

### 7.4 Known Constraints

- **Scan session cleanup test** depends on the cleanup interval being configurable or triggerable. If the cleanup job runs every 15 minutes in production, the test either needs to wait 15 minutes (unacceptable) or the cleanup interval needs to be overridable via environment variable for test environments.
- **Push-to-create timing:** After a push-to-create, there may be a brief delay before the repo appears in the listing endpoint. Tests should allow a short retry window if needed.
- **Git protocol errors** surface as exceptions from isomorphic-git, not HTTP status codes. Test assertions should catch specific error messages (e.g., "HTTP Error: 401" in the error string) rather than inspecting response objects directly.

### 7.5 What These Tests Do NOT Cover

- Mobile app crypto (NIP-44 encrypt/decrypt round-trips) — these should be unit tested separately in the mobile app's own test suite
- Frontend `/scan` page UI — would need Playwright or Cypress for browser testing, out of scope here
- Performance/load testing — out of scope
- WebRTC video calling — separate system, not tested here
- Scheduler-api endpoints — not affected by /scan changes, test separately if desired

### 7.6 Tests location
Where should `tests/` be? At the monorepo root, not under apps/. These are integration tests that span auth-api, mgit-api, and the gateway simultaneously — they don't belong to any single service. Putting them under apps/auth-api/tests/ or apps/mgit-api/tests/ would imply they only test that service.
limbo-health/
├── apps/
│   ├── frontend/
│   ├── auth-api/
│   ├── scheduler-api/
│   ├── mgit-api/
│   └── gateway/
├── tests/                          # ← here, top-level
│   ├── setup/
│   ├── auth/
│   ├── mgit/
│   ├── scan/
│   └── vitest.config.ts
├── docker-compose.yml
├── docker-compose.development.yml
└── package.json
The root package.json gets a test script: "test:integration": "vitest run --config tests/vitest.config.ts". The test dependencies (vitest, isomorphic-git, @noble/curves, etc.) go in the root devDependencies since they're not part of any deployed service.
If individual services later need their own unit tests, those would live inside each app (e.g., apps/mgit-api/tests/). The top-level tests/ directory is specifically for cross-service integration tests.
