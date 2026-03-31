# Axios / npm Supply-Chain Lockfile Audit

Date: 2026-03-31
Repository: `limbo-health`
Default branch audited: `origin/main`

## Scope

Searched all reachable `package.json`, `package-lock.json`, Dockerfiles, shell scripts, README install instructions, and git history reachable from `git log --all`.

Negative history searches:

```bash
git log --all -S'axios-1.14.1' -- package-lock.json apps/*/package-lock.json
git log --all -S'axios-0.30.4' -- package-lock.json apps/*/package-lock.json
git log --all -S'plain-crypto-js' -- package-lock.json apps/*/package-lock.json package.json apps/*/package.json
```

All three commands returned no matches.

## Current Repository Inventory

| Location | Finding | Direct or transitive | Version evidence | Package manager |
| --- | --- | --- | --- | --- |
| `apps/mgit-api/package.json` | only direct `axios` dependency in the repo | direct | remediated to exact `1.14.0` in this branch; pre-remediation spec was `^1.7.9` | npm |
| `apps/mgit-api/package-lock.json` | only resolved `axios` package in tracked lockfiles | resolved direct | pre-remediation lock resolved `1.13.4`; remediated lock resolves `1.14.0` | npm |
| `package-lock.json` | carries extraneous metadata for `apps/mgit-api`, but no root `node_modules/axios` entry | metadata only | aligned to `1.14.0` in this branch; pre-remediation metadata still showed `^1.7.9` | npm |
| `apps/auth-api/package-lock.json` | contains `gaxios`, not `axios` | transitive to Google SDK only | `gaxios@6.7.1` | npm |
| `apps/scheduler-api/package-lock.json` | contains `gaxios`, not `axios` | transitive to Google SDK only | `gaxios@7.1.3` | npm |

No `plain-crypto-js` reference exists in current tracked manifests or lockfiles.

## Historical Lockfile and Manifest Changes

| Commit | Author | Date | Summary | Supply-chain relevance |
| --- | --- | --- | --- | --- |
| `25911fef86d81a1c77bcbe03f9fb2d4a9a55bf53` | `imyjimmy` | `2025-11-09T17:13:23-06:00` | `migrated mgit-repo-server to apps/mgit-api` | introduced the direct `axios` dependency in `apps/mgit-api/package.json` and added matching workspace-style metadata to the root lockfile |
| `6d9122a9f18306d4b708cae46238e907fb57b7bf` | `imyjimmy` | `2026-02-02T14:36:41-06:00` | `Remove workspaces, upgrade Express to v5, add node v24 reinstall script` | introduced `apps/mgit-api/package-lock.json` with `axios@1.13.4`; also introduced `scripts/reinstall-node24.sh`, which deleted lockfiles and reran `npm install` |
| `5d8dc1489d016d5fc4a682a1113ec7596c2efa5a` | `imyjimmy` | `2026-02-11T17:56:25-06:00` | `test suite stuff` | large root `package-lock.json` churn; no `axios@1.14.1`, `axios@0.30.4`, or `plain-crypto-js` introduced |

No reachable commit introduced `axios@1.14.1`, `axios@0.30.4`, or `plain-crypto-js`.

## Install and Build Path Audit

| Path | Install command | Lockfile enforced before remediation | Script execution behavior | Exposure note |
| --- | --- | --- | --- | --- |
| `apps/mgit-api/Dockerfile` | `npm ci --omit=dev` | yes | lifecycle scripts still enabled | pre-remediation safe because the committed lock resolved `axios@1.13.4`; now resolves `1.14.0` |
| `apps/mgit-api/Dockerfile.railway` | `npm ci --omit=dev` | yes | lifecycle scripts still enabled | same as above |
| `apps/auth-api/Dockerfile` | pre: `npm install`, post: `npm ci` | pre: lockfile present but not strict; post: yes | lifecycle scripts enabled | no `axios` or `plain-crypto-js` in this app, but hardened for reproducibility |
| `apps/frontend/Dockerfile.dev` | pre: `npm install`, post: `npm ci` | pre: lockfile present but not strict; post: yes | lifecycle scripts enabled | no `axios` or `plain-crypto-js` in this app, but hardened for reproducibility |
| `apps/frontend/Dockerfile` | `npm ci` | yes | lifecycle scripts enabled | no `axios` or `plain-crypto-js` here |
| `apps/records-workflow-api/Dockerfile` | `npm ci` | yes | lifecycle scripts enabled | no `axios` or `plain-crypto-js` here |
| `deploy/aws/lean/import-core-db-from-source.sh` | `npm ci --ignore-scripts` | yes | lifecycle scripts disabled | safest existing install path found in repo |
| `scripts/reinstall-node24.sh` | pre: deleted all `package-lock.json` files, then ran `npm install`; post: preserves lockfiles and uses `npm ci` | pre: no; post: yes | pre: lifecycle scripts enabled on fresh resolution; post: lifecycle scripts enabled but lock-bound | this was the only repo-local path that could have floated a developer machine to a malicious `axios` release if it was executed during the incident window |
| `README.md` | pre: `npm install`; post: `npm ci` | pre: not strict; post: yes | lifecycle scripts enabled | root install does not directly install `axios`, but docs are now aligned with lockfile usage |
| `.github/workflows` | none before remediation | n/a | n/a | no repo CI workflow evidence of install execution was available before this branch |

## Generated Artifacts and Vendored Dependency Check

- No committed `node_modules` directories were found in tracked files.
- No committed `.tgz` or `.tar` dependency blobs were found.
- No tracked `.yarn/`, `pnpm-store`, `.npm`, or internal package cache directories were found.
- The only tracked npm config file is `apps/react-native/.npmrc`, containing `legacy-peer-deps=true`.

## Local Working Copy Evidence Observed During Audit

These checks were run against the original local checkout before remediation work started in the isolated worktree:

- `cd apps/mgit-api && npm ls axios plain-crypto-js --all --json` showed only `axios@1.13.4`.
- `apps/mgit-api/node_modules/axios/package.json` reported `"version": "1.13.4"`.
- `apps/mgit-api/node_modules/plain-crypto-js` was absent.
- root `node_modules/plain-crypto-js` was absent.

These observations support the repo-only conclusion, but they do not prove what happened on other developer machines or deleted caches.
