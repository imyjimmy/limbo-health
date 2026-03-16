# Limbo Health — Auth Refactor Implementation Guide

**Purpose:** Move all authorization logic from mgit-api (SQLite + authPersistence) into auth-api (MySQL). Simplify mgit-api to a pure git transport layer that delegates every access decision to auth-api. Add scan token support for the /scan doctor sharing feature.

**Prerequisite:** Phase 1 integration tests are passing against the current codebase. These tests are the safety net for this refactor.

**Data migration:** Not needed. All existing repos and auth configs are test data. We start fresh with empty MySQL tables. Existing SQLite database and JSON configs will be removed.

---

## 1. Overview of Changes

### What moves FROM mgit-api TO auth-api

| Responsibility | Before (mgit-api) | After (auth-api) |
|---|---|---|
| "Does this pubkey have access to this repo?" | `checkRepoAccess()` queries SQLite | `POST /api/auth/check-access` queries MySQL |
| "Store that this pubkey owns this repo" | `authPersistence.saveRepositoryConfig()` writes SQLite | `POST /api/auth/register-repo` writes MySQL |
| "List repos this pubkey can access" | `authPersistence.loadAllRepositoryConfigs()` + filter | `GET /api/auth/user/repositories` queries MySQL |
| "Delete a repo's auth config" | `authPersistence.deleteRepositoryConfig()` | `DELETE /api/auth/repos/:repoId` |
| Scan session create/validate/revoke | Does not exist yet | New endpoints + `scan_sessions` table |

### What gets deleted from mgit-api

- `auth-persistence.js` — entire file
- `checkRepoAccess()` function in `server.js`
- `validateMGitToken` middleware (replaced by new `authMiddleware`)
- `validateAuthToken` middleware (replaced by new `authMiddleware`)
- Orphan repo auto-adoption logic
- SQLite database file and all SQLite dependencies
- The startup repo scan (`scanRepositories` or similar)

### What stays in mgit-api

- The four git transport route handlers (info/refs, git-upload-pack, git-receive-pack) — business logic unchanged
- `mgitUtils.js` — repository creation on disk (git init --bare, etc.)
- The `REPOS_PATH` and physical repo directory management
- `POST /api/mgit/repos/create` and `POST /api/mgit/repos/create-bare` — but they now call auth-api to register the repo after creating it on disk

---

## 2. MySQL Schema

Run these against the existing MySQL database that auth-api and scheduler-api already use.

### 2.1 Migration SQL

```sql
-- Repository ownership and metadata
CREATE TABLE repositories (
  id VARCHAR(128) PRIMARY KEY,
  description TEXT,
  repo_type VARCHAR(64) DEFAULT 'medical-history',
  owner_pubkey VARCHAR(128) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_owner (owner_pubkey)
);

-- Per-repo access grants (supports multi-user access in the future)
CREATE TABLE repository_access (
  id INT AUTO_INCREMENT PRIMARY KEY,
  repo_id VARCHAR(128) NOT NULL,
  pubkey VARCHAR(128) NOT NULL,
  access_level ENUM('admin', 'read-write', 'read-only') NOT NULL DEFAULT 'read-only',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_repo_pubkey (repo_id, pubkey),
  INDEX idx_pubkey (pubkey),
  FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE
);

-- Scan sessions for doctor sharing
CREATE TABLE scan_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_token VARCHAR(128) UNIQUE NOT NULL,
  staging_repo_id VARCHAR(128) NOT NULL,
  patient_pubkey VARCHAR(128) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  is_revoked BOOLEAN DEFAULT FALSE,
  INDEX idx_token (session_token),
  INDEX idx_expires (expires_at),
  INDEX idx_staging_repo (staging_repo_id)
);
```

### 2.2 Pubkey Format Decision

The existing codebase has an inconsistency: some places store pubkeys as hex, others as bech32 (npub). The `checkRepoAccess` function even has a fallback: `key.pubkey === pubkey || utils.hexToBech32(pubkey) === key.pubkey`.

**Decision for the new tables: always store pubkeys as hex.** Hex is the canonical format in Nostr protocol internals, in the JWT payload, and in the secp256k1 libraries. Bech32 (npub/nsec) is a display format. auth-api normalizes to hex on write and on query. If a bech32 pubkey arrives, auth-api converts it to hex before storing or comparing.

This eliminates the dual-format comparison bug in the current `checkRepoAccess`.

---

## 3. auth-api Changes

### 3.1 New Files

```
auth-api/
  ├── server.js                         # MODIFY: mount new route files
  ├── routes/
  │   ├── nostr.js                      # EXISTING: unchanged
  │   ├── google.js                     # EXISTING: unchanged
  │   ├── repos.js                      # NEW: register-repo, check-access, list repos, delete repo
  │   └── scan.js                       # NEW: session create, validate, revoke
  └── utils/
      ├── pubkey.js                     # NEW: hex/bech32 normalization
      └── tokenGenerator.js             # NEW: crypto.randomBytes for scan session tokens
```

### 3.2 `routes/repos.js` — Repository Authorization Endpoints

These are **internal endpoints** called by mgit-api, not by end users. They do not need to be exposed through the nginx gateway to the public internet. If your gateway already routes `/api/auth/*` to auth-api, these will be reachable by mgit-api via the internal Docker network or via the gateway. Decide based on your Railway networking — if services can talk directly, use internal URLs. If not, route through the gateway but understand these are not user-facing.

#### `POST /api/auth/check-access`

The central authorization endpoint. mgit-api calls this on every git transport request.

**Request body — JWT-authenticated user:**
```json
{
  "pubkey": "a1b2c3d4...",
  "repoId": "my-medical-binder",
  "operation": "read"
}
```

**Request body — scan token:**
```json
{
  "scanToken": "sctk_a1b2c3d4...",
  "repoId": "scan-abc123",
  "operation": "write"
}
```

**Response (allowed):**
```json
{
  "allowed": true,
  "access": "admin",
  "authMethod": "jwt"
}
```

**Response (denied):**
```json
{
  "allowed": false,
  "reason": "Not authorized for this repository"
}
```

**Implementation logic:**

```
IF scanToken is present:
  Query scan_sessions WHERE session_token = scanToken
  IF no row → return { allowed: false, reason: "Invalid scan token" }
  IF is_revoked = TRUE → return { allowed: false, reason: "Session revoked" }
  IF expires_at < NOW() → return { allowed: false, reason: "Session expired" }
  IF staging_repo_id != repoId → return { allowed: false, reason: "Token not scoped to this repo" }
  return { allowed: true, access: "read-write", authMethod: "scan_token" }

ELSE IF pubkey is present:
  Query repository_access WHERE repo_id = repoId AND pubkey = normalize_hex(pubkey)
  IF no row → return { allowed: false, reason: "Not authorized for this repository" }
  IF operation = "write" AND access_level = "read-only" → return { allowed: false, reason: "Insufficient permissions" }
  return { allowed: true, access: row.access_level, authMethod: "jwt" }

ELSE:
  return { allowed: false, reason: "No credentials provided" }
```

**Note:** This endpoint itself does NOT verify JWTs. mgit-api verifies the JWT and extracts the pubkey before calling check-access. auth-api trusts that the pubkey mgit-api sends is already verified. This keeps JWT verification in one place (mgit-api's middleware) and avoids passing raw JWTs between services.

However, this means the check-access endpoint must be **internal only** — if a public user could call it directly with an arbitrary pubkey, they could bypass auth. In Docker Compose, this is fine because the endpoint is only reachable on the internal network. On Railway, ensure this endpoint is not exposed publicly, or add a shared internal secret header.

#### `POST /api/auth/register-repo`

Called by mgit-api after a successful push-to-create or explicit repo creation.

**Request body:**
```json
{
  "repoId": "my-medical-binder",
  "ownerPubkey": "a1b2c3d4...",
  "description": "Personal medical records",
  "repoType": "medical-history"
}
```

**Response:**
```json
{
  "success": true,
  "repoId": "my-medical-binder"
}
```

**Implementation logic:**

```
Normalize ownerPubkey to hex
BEGIN TRANSACTION
  INSERT INTO repositories (id, description, repo_type, owner_pubkey) VALUES (...)
    ON DUPLICATE KEY UPDATE updated_at = NOW()
  INSERT INTO repository_access (repo_id, pubkey, access_level) VALUES (repoId, ownerPubkey, 'admin')
    ON DUPLICATE KEY UPDATE access_level = 'admin'
COMMIT
return { success: true }
```

The `ON DUPLICATE KEY` handles the case where the repo is already registered (idempotent — safe to call multiple times).

#### `GET /api/auth/user/repositories?pubkey={pubkey}`

Returns the list of repos a pubkey has access to. Called by mgit-api's repo listing endpoint. Authenticated by the calling service (mgit-api passes the pubkey it extracted from the JWT).

**Response:**
```json
[
  {
    "repoId": "my-medical-binder",
    "description": "Personal medical records",
    "repoType": "medical-history",
    "access": "admin",
    "createdAt": "2026-02-01T00:00:00Z"
  }
]
```

**Implementation logic:**

```sql
SELECT r.id AS repoId, r.description, r.repo_type AS repoType,
       ra.access_level AS access, r.created_at AS createdAt
FROM repositories r
JOIN repository_access ra ON r.id = ra.repo_id
WHERE ra.pubkey = ?
ORDER BY r.created_at DESC
```

#### `DELETE /api/auth/repos/:repoId`

Removes a repo's auth config. Called by mgit-api when a repo is deleted, or by the staging cleanup job.

**Implementation:** `DELETE FROM repositories WHERE id = ?` — the `ON DELETE CASCADE` on `repository_access` handles the access rows.

### 3.3 `routes/scan.js` — Scan Session Endpoints

#### `POST /api/auth/scan/session`

Called by the patient's mobile app. Authenticated with the patient's JWT (mgit-api or the mobile app calls this through the gateway, JWT in Authorization header).

**Request body:**
```json
{
  "stagingRepoId": "scan-a1b2c3d4"
}
```

**Validation:**
- JWT must be present and valid (use existing JWT validation middleware)
- `stagingRepoId` must start with `scan-` (reject 400 otherwise — prevents accidental scoping to real repos)
- Extract `pubkey` from JWT

**Implementation:**

```
Generate session_token: "sctk_" + 64 hex chars from crypto.randomBytes(32)
Calculate expires_at: NOW() + 1 hour
INSERT INTO scan_sessions (session_token, staging_repo_id, patient_pubkey, expires_at)
  VALUES (token, stagingRepoId, pubkey, expires_at)
Return { sessionToken, repoId: stagingRepoId, expiresAt: unix_timestamp }
```

#### `POST /api/auth/scan/revoke`

Called by the patient's mobile app. Authenticated with JWT.

**Request body:**
```json
{
  "sessionToken": "sctk_a1b2c3d4..."
}
```

**Validation:**
- JWT must be valid
- The session's `patient_pubkey` must match the JWT's pubkey (you can only revoke your own sessions)

**Implementation:**

```
UPDATE scan_sessions SET is_revoked = TRUE
WHERE session_token = ? AND patient_pubkey = ?
IF rows_affected = 0 → return 404 or 403
return { success: true }
```

#### `POST /api/auth/scan/validate` (internal)

Called by the `check-access` logic (or inlined within it). Not a separate endpoint — the scan token validation logic described in the `check-access` implementation above covers this. Only break it into a separate endpoint if you want mgit-api to call it directly instead of going through `check-access`.

### 3.4 `utils/pubkey.js`

```javascript
// Normalize any pubkey to hex format
// Accepts: hex string (64 chars) or bech32 npub string
// Returns: hex string (64 chars, lowercase)
function normalizeToHex(pubkey) {
  if (!pubkey) throw new Error('pubkey is required');
  
  // Already hex
  if (/^[0-9a-fA-F]{64}$/.test(pubkey)) {
    return pubkey.toLowerCase();
  }
  
  // Bech32 npub
  if (pubkey.startsWith('npub')) {
    // Use nostr-tools or manual bech32 decode
    // Return the 32-byte hex payload
  }
  
  throw new Error('Invalid pubkey format');
}
```

All auth-api endpoints that accept pubkeys call `normalizeToHex()` before any database operation.

### 3.5 `utils/tokenGenerator.js`

```javascript
const crypto = require('crypto');

function generateScanToken() {
  return 'sctk_' + crypto.randomBytes(32).toString('hex');
}
```

### 3.6 Internal Service Authentication

The `check-access` and `register-repo` endpoints are called by mgit-api, not by end users. To prevent a public user from calling them directly with a forged pubkey:

**Option A (simple, recommended for now):** Shared secret header. Both services read `INTERNAL_API_SECRET` from environment. mgit-api sends `X-Internal-Secret: {secret}` on every call to auth-api. auth-api rejects requests without the correct secret. This is sufficient for Docker Compose and Railway internal networking.

**Option B (production hardening, later):** Network-level isolation. On Railway, use private networking so these endpoints are only reachable from other services in the same project. On Docker Compose, put auth-api on an internal-only network that nginx doesn't expose.

For now, go with Option A. Add the shared secret check at the top of `repos.js` routes:

```javascript
function requireInternalAuth(req, res, next) {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}
```

---

## 4. mgit-api Changes

### 4.1 Files to Delete

- `auth-persistence.js` — entire file
- Any SQLite database files (`.db`, `.sqlite`) in the container or volume
- SQLite npm dependency (`better-sqlite3` or `sqlite3`) from `package.json`

### 4.2 Files to Modify

#### `server.js` — Major Refactor

**Remove:**
- `const authPersistence = require('./auth-persistence')` and all references
- The `checkRepoAccess()` function (entire function body)
- `validateMGitToken` middleware
- `validateAuthToken` middleware
- The startup repo scan (`scanRepositories` or similar init logic)
- The orphan repo auto-adoption logic

**Add:**
- New `authMiddleware` (see below)
- Internal auth-api client helper
- Staging repo cleanup job

**Modify:**
- All git transport routes: replace `validateMGitToken` with `authMiddleware`
- `POST /api/mgit/repos/create` and `create-bare`: after creating repo on disk, call `POST /api/auth/register-repo`
- `GET /api/mgit/user/repositories`: instead of querying authPersistence, call `GET /api/auth/user/repositories`
- Push-to-create flow: after a successful first push, call `POST /api/auth/register-repo`

### 4.3 New `authMiddleware.js`

This replaces both `validateMGitToken` and `validateAuthToken`. It's the only auth code left in mgit-api.

```
authMiddleware(req, res, next):

  Step 1 — Extract credentials from the request
    jwt = null
    scanToken = null
    pubkey = null

    Check Authorization header:
      If starts with "Bearer " → jwt = extract token
      If starts with "ScanToken " → scanToken = extract token

    If no scanToken from header:
      Check query param: req.query.scan_token
      If present → scanToken = value

  Step 2 — If JWT present, verify it locally
    Try jwt.verify(token, JWT_SECRET)
    If invalid/expired → return 401
    pubkey = decoded.pubkey

  Step 3 — Call auth-api to check access
    POST to AUTH_API_URL/api/auth/check-access
    Body:
      If pubkey → { pubkey, repoId: req.params.repoId, operation }
      If scanToken → { scanToken, repoId: req.params.repoId, operation }
    Headers:
      X-Internal-Secret: INTERNAL_API_SECRET

    Determine operation:
      "write" if route is git-receive-pack (POST) or info/refs with service=git-receive-pack
      "read" for everything else

  Step 4 — Handle response
    If check-access returns { allowed: false } → return 403 with reason
    If check-access call fails (network error) → return 502 "Auth service unavailable"
    If allowed:
      req.user = { pubkey, authMethod, access: response.access }
      next()
```

**Important edge case:** The `info/refs` endpoint handles both `?service=git-upload-pack` (read) and `?service=git-receive-pack` (write) on the same route. The middleware must read `req.query.service` to determine the operation.

### 4.4 Internal Auth-API Client

A small helper module that mgit-api uses to call auth-api.

**New file: `authApiClient.js`**

```
AUTH_API_URL = process.env.AUTH_API_URL || 'http://auth-api:3001'
INTERNAL_SECRET = process.env.INTERNAL_API_SECRET

async checkAccess({ pubkey, scanToken, repoId, operation }):
  POST AUTH_API_URL/api/auth/check-access
  Headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET }
  Body: { pubkey, scanToken, repoId, operation }
  Returns: parsed JSON response
  Throws on network error

async registerRepo({ repoId, ownerPubkey, description, repoType }):
  POST AUTH_API_URL/api/auth/register-repo
  Headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET }
  Body: { repoId, ownerPubkey, description, repoType }
  Returns: parsed JSON response

async getUserRepositories(pubkey):
  GET AUTH_API_URL/api/auth/user/repositories?pubkey={pubkey}
  Headers: { 'X-Internal-Secret': INTERNAL_SECRET }
  Returns: parsed JSON array

async deleteRepoConfig(repoId):
  DELETE AUTH_API_URL/api/auth/repos/{repoId}
  Headers: { 'X-Internal-Secret': INTERNAL_SECRET }
  Returns: parsed JSON response
```

### 4.5 Changes to Existing Endpoints

#### `GET /api/mgit/user/repositories`

**Before:**
```
validateAuthToken middleware
Load all repo configs from authPersistence
Filter by pubkey
Return filtered list
```

**After:**
```
authMiddleware (but this route has no repoId — special case, see below)
Call authApiClient.getUserRepositories(req.user.pubkey)
Return the list directly
```

**Special case:** This endpoint has no `:repoId` in the URL, so `authMiddleware` can't call `check-access` with a repo ID. Two options:

- **Option A:** Use a separate lighter middleware for this route that only verifies the JWT and extracts the pubkey, without calling check-access. This is the simplest.
- **Option B:** Make check-access support a "list" operation with no repoId.

**Recommendation: Option A.** Create a `jwtOnly` middleware that just verifies the JWT and sets `req.user`. Use it on the repo listing endpoint. Use the full `authMiddleware` (with check-access call) on all git transport endpoints.

```
jwtOnly middleware:
  Extract JWT from Authorization header
  Verify with jwt.verify(token, JWT_SECRET)
  If invalid → 401
  req.user = { pubkey: decoded.pubkey }
  next()
```

This middleware already exists in spirit — it's what `validateAuthToken` does today. The difference is it doesn't touch authPersistence.

#### `POST /api/mgit/repos/create` and `POST /api/mgit/repos/create-bare`

**Before:**
```
Verify JWT
Check if repo exists via authPersistence.loadRepositoryConfig()
Create repo on disk
Save auth config via authPersistence.saveRepositoryConfig()
```

**After:**
```
jwtOnly middleware
Create repo on disk (mgitUtils.createRepository or git init --bare)
Call authApiClient.registerRepo({ repoId, ownerPubkey, description, repoType })
If register fails → delete the repo directory (rollback) and return error
Return success
```

The "check if repo exists" step can either query auth-api (`check-access` with the pubkey would return "not authorized" if the repo doesn't exist yet, which is different from "repo already exists") or just attempt the `registerRepo` call and let MySQL's unique constraint reject duplicates. The latter is simpler — try to register, if it returns a conflict error, the repo already exists.

#### Push-to-create flow

This is the trickiest change. Today, `checkRepoAccess` handles push-to-create implicitly: if the repo directory exists but has no auth config, it auto-creates one. The new flow:

In the `git-receive-pack` POST handler, after the git process exits with code 0:

```
IF this was a push to a repo that didn't exist before (new repo directory was created):
  Call authApiClient.registerRepo({
    repoId: repoId,
    ownerPubkey: req.user.pubkey,
    description: 'Auto-created on first push',
    repoType: 'medical-history'
  })
```

**How to detect "first push":** Before the git-receive-pack process runs, check if the repo directory exists. If it doesn't, the push-to-create mechanism needs to create it. Currently, if the repo doesn't exist, `git receive-pack` fails because there's no bare repo to push to.

**This reveals a gap:** Push-to-create currently relies on `checkRepoAccess` auto-creating auth configs for repos whose directories already exist (orphan repos). But the actual creation of the bare repo directory on first push is NOT implemented in the current codebase — `git-receive-pack` returns 404 if the repo doesn't exist. The patient must call `create-bare` first or use the web app's `create` endpoint.

**For the refactor:** Since push-to-create is required for the mobile app (the requirements doc says so), implement it now:

1. In the `info/refs?service=git-receive-pack` handler (the refs advertisement step, which happens before the actual push):
   - If the repo directory doesn't exist AND the request is authenticated with a valid JWT (not a scan token):
     - Create the bare repo: `git init --bare` at `REPOS_PATH/repoId`
     - Set HEAD to main: `echo "ref: refs/heads/main" > REPOS_PATH/repoId/HEAD`
     - Call `authApiClient.registerRepo()` to register the new repo with the pushing user as admin
   - If the repo doesn't exist and the request is a scan token: reject (scan tokens can only access existing staging repos — the patient creates the staging repo with their JWT first)

2. The subsequent `git-receive-pack` POST will succeed because the bare repo now exists.

This replaces both the orphan repo auto-adoption logic AND implements true push-to-create.

### 4.6 Staging Repo Cleanup Job

**New file: `stagingCleanup.js`**

A module that exports a `startCleanupJob()` function called from `server.js` during startup.

```
CLEANUP_INTERVAL = process.env.STAGING_CLEANUP_INTERVAL_MS || 900000  (15 minutes)

startCleanupJob():
  setInterval(async () => {
    try:
      // Find expired sessions (with 15-minute grace period)
      Call auth-api or query MySQL directly for:
        SELECT staging_repo_id FROM scan_sessions
        WHERE expires_at < NOW() - INTERVAL 15 MINUTE
        AND is_revoked = FALSE

      Also find revoked sessions:
        SELECT staging_repo_id FROM scan_sessions
        WHERE is_revoked = TRUE
        AND created_at < NOW() - INTERVAL 5 MINUTE

      For each staging_repo_id:
        Safety check: repo ID must start with "scan-"
        Delete directory: rm -rf REPOS_PATH/staging_repo_id
        Call authApiClient.deleteRepoConfig(staging_repo_id)
        Delete session row:
          DELETE FROM scan_sessions WHERE staging_repo_id = ?

      Log: "Cleaned up N staging repos"

    catch(error):
      Log error but don't crash — cleanup is best-effort
  }, CLEANUP_INTERVAL)
```

**Decision: Does the cleanup job query MySQL directly or call auth-api?**

The cleanup job runs inside mgit-api because it needs filesystem access to delete repo directories. But the scan_sessions table is in MySQL, owned by auth-api.

**Recommendation:** Add a cleanup endpoint to auth-api that the job calls:

```
POST /api/auth/scan/cleanup
Headers: X-Internal-Secret

Response:
{
  "expiredRepos": ["scan-abc123", "scan-def456"],
  "revokedRepos": ["scan-ghi789"]
}
```

auth-api queries the expired/revoked sessions and returns the list. mgit-api deletes the directories. Then mgit-api calls `DELETE /api/auth/repos/:repoId` for each one (which cascades to delete the session rows and any access rows).

This keeps the separation clean — auth-api owns the data, mgit-api owns the filesystem.

---

## 5. Environment Variable Changes

### auth-api (add)

```env
INTERNAL_API_SECRET=generate-a-long-random-string-here
```

### mgit-api (add/modify)

```env
AUTH_API_URL=http://auth-api:3001          # Docker internal URL
INTERNAL_API_SECRET=same-string-as-auth-api
STAGING_CLEANUP_INTERVAL_MS=900000         # 15 minutes, optional override
```

### mgit-api (remove)

Any SQLite-related environment variables (database path, etc.) can be removed. The `isDocker` flag that toggled between SQLite and JSON modes is no longer relevant.

---

## 6. Docker / Deployment Changes

### `package.json` (mgit-api)

Remove SQLite dependencies:
```
- "sqlite3": "..."
- "better-sqlite3": "..."    (if present)
```

No new dependencies needed — mgit-api only makes `fetch` calls to auth-api.

### `package.json` (auth-api)

No new dependencies if you're already using `mysql2` (or whatever MySQL driver scheduler-api uses). If auth-api doesn't have a MySQL driver yet, add one. Check what scheduler-api uses and match it.

### Docker Compose

Ensure mgit-api can reach auth-api over the Docker network. Both services should be on the same network. Add the new environment variables to both services' `environment` blocks.

### Railway

Both services need the `INTERNAL_API_SECRET` environment variable set to the same value. `AUTH_API_URL` on mgit-api should point to auth-api's internal Railway URL (not the public URL, to avoid going through the internet).

---

## 7. Implementation Order

This is the sequence to build. Each step should end with tests passing.

### Step 1: MySQL Tables

Run the migration SQL from Section 2 against your MySQL database. Verify tables exist.

### Step 2: auth-api — `utils/pubkey.js` and `utils/tokenGenerator.js`

Small utility modules with no dependencies on routes. Write and unit-test these independently.

### Step 3: auth-api — `routes/repos.js`

Implement the four endpoints:
- `POST /api/auth/check-access`
- `POST /api/auth/register-repo`
- `GET /api/auth/user/repositories`
- `DELETE /api/auth/repos/:repoId`

Include `requireInternalAuth` middleware using `INTERNAL_API_SECRET`.

Mount the routes in `server.js`.

**Test:** Call these endpoints directly with curl or from the test suite. Register a test repo, check access, list repos, delete repo. No changes to mgit-api yet — these endpoints exist alongside the existing auth-api code.

### Step 4: auth-api — `routes/scan.js`

Implement:
- `POST /api/auth/scan/session` (JWT-authenticated, creates session row)
- `POST /api/auth/scan/revoke` (JWT-authenticated, marks session revoked)
- `POST /api/auth/scan/cleanup` (internal auth, returns expired/revoked staging repo IDs)

Mount in `server.js`.

**Test:** Create a session, validate it via check-access, revoke it, verify check-access now rejects it.

### Step 5: mgit-api — `authApiClient.js`

Build the internal client helper. Test it against the auth-api endpoints from Step 3.

### Step 6: mgit-api — `authMiddleware.js` and `jwtOnly` middleware

Build the new middleware. This is the critical change.

**Do not delete the old middleware yet.** Instead, create the new middleware alongside the old one. You'll swap them on a route-by-route basis in the next step.

### Step 7: mgit-api — Swap middleware on all routes

One route at a time, replace `validateMGitToken` with `authMiddleware` and `validateAuthToken` with `jwtOnly`.

**After swapping each route, run Phase 1 tests.** If any test fails, the issue is in the middleware swap for that specific route. Fix before moving to the next route.

Order of routes to swap:
1. `GET /api/mgit/user/repositories` — swap to `jwtOnly`, replace authPersistence query with `authApiClient.getUserRepositories()`. **But first**, you need to register at least one test repo in MySQL via `register-repo` so the listing test has data. Update the test setup to call `register-repo` after creating repos via push.
2. `GET /api/mgit/repos/:repoId/info/refs` — swap to `authMiddleware`
3. `POST /api/mgit/repos/:repoId/git-upload-pack` — swap to `authMiddleware`
4. `POST /api/mgit/repos/:repoId/git-receive-pack` — swap to `authMiddleware`
5. `POST /api/mgit/repos/create` — swap to `jwtOnly`, add `authApiClient.registerRepo()` call after disk creation
6. `POST /api/mgit/repos/create-bare` — same as above

**After all swaps, run the full Phase 1 test suite. Everything must pass.**

### Step 8: mgit-api — Implement push-to-create

In the `info/refs?service=git-receive-pack` handler:
- After `authMiddleware` passes (meaning the JWT is valid), check if the repo directory exists
- If it doesn't exist AND `req.user.authMethod === 'jwt'`:
  - `git init --bare` the repo directory
  - Call `authApiClient.registerRepo()`
- If it doesn't exist AND `req.user.authMethod === 'scan_token'`: return 404

**Test:** The `repo-create-push.test.ts` from Phase 1 tests should now pass with push-to-create rather than requiring explicit repo creation first. If the current tests create repos explicitly before pushing, add a new test that pushes to a non-existent repo and verifies it's created.

### Step 9: mgit-api — Delete old code

Only after all Phase 1 tests pass with the new middleware:

- Delete `auth-persistence.js`
- Delete `checkRepoAccess()` from `server.js`
- Delete `validateMGitToken` and `validateAuthToken` from `server.js`
- Delete the startup repo scan logic
- Remove SQLite dependencies from `package.json`
- Rebuild the Docker image

**Run Phase 1 tests one final time after deletion.** This confirms nothing was still referencing the old code.

### Step 10: mgit-api — Add staging cleanup job

Implement `stagingCleanup.js`. Start the job in `server.js` after server initialization.

### Step 11: Run Phase 2 tests

The scan token tests from the test plan should now pass:
- `auth/scan-session.test.ts`
- `mgit/scan-token-auth.test.ts`
- `scan/staging-repo-lifecycle.test.ts`
- `scan/scan-security.test.ts`

Fix any failures. Then run the full test suite (Phase 1 + Phase 2) to confirm no regressions.

---

## 8. Rollback Plan

If something goes catastrophically wrong during the refactor:

1. The old `auth-persistence.js` and middleware are in git history — revert the mgit-api changes
2. The MySQL tables can be dropped without affecting any other service (they're new tables, not modifications to existing ones)
3. The new auth-api endpoints can be left in place (they're additive, not modifying existing endpoints)

The risk is contained because:
- auth-api changes are purely additive (new routes, new tables)
- mgit-api changes are surgical (middleware swap, endpoint modifications)
- Phase 1 tests catch regressions at each step
- No data migration means no data loss risk

---

## 9. Post-Refactor State

After this refactor is complete:

**auth-api owns:**
- User identity (Nostr challenge/verify, Google OAuth)
- Repository authorization (who can access what repo, at what level)
- Scan session management (create, validate, revoke, cleanup lists)
- All auth data lives in MySQL

**mgit-api owns:**
- Git transport (Smart HTTP protocol — refs advertisement, upload-pack, receive-pack)
- Physical repo storage (bare git repos on disk)
- Push-to-create (creates repo directory, then calls auth-api to register)
- Staging repo cleanup (deletes directories, then calls auth-api to delete auth records)

**mgit-api does NOT own:**
- JWT verification logic (it still verifies JWTs locally for performance, but all authorization decisions are delegated to auth-api)
- Any persistent auth data (no SQLite, no JSON files, no authPersistence)
- Knowledge of what "admin" vs "read-write" vs "read-only" means for business logic — it gets the answer from auth-api and trusts it

This clean separation makes adding future auth methods (Google OAuth users accessing repos, NIP-46 remote signing sessions, API keys for third-party integrations) a matter of adding rows to the same MySQL tables and cases to the same `check-access` endpoint, with zero changes to mgit-api.
