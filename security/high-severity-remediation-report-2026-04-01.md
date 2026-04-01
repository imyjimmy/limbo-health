# High-Severity Security Remediation Report

Date: 2026-04-01
Branch: `codex/fix-high-security-audit`

## Scope

Remediation covered every tracked npm lockfile in the repository:

- `package-lock.json`
- `apps/auth-api/package-lock.json`
- `apps/frontend/package-lock.json`
- `apps/mgit-api/package-lock.json`
- `apps/react-native/package-lock.json`
- `apps/records-workflow-api/package-lock.json`
- `apps/scheduler-api/package-lock.json`

All audit and remediation commands were run against the official npm registry with lifecycle scripts disabled:

```bash
npm audit --json --registry=https://registry.npmjs.org
npm audit fix --package-lock-only --ignore-scripts --registry=https://registry.npmjs.org
```

This avoided the local `https://registry.npmmirror.com` audit API limitation and reduced supply-chain risk during remediation.

## Baseline

Fresh `npm audit` results before remediation:

| Lockfile | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: |
| `package-lock.json` | 3 | 1 | 0 | 4 |
| `apps/auth-api/package-lock.json` | 1 | 0 | 1 | 2 |
| `apps/frontend/package-lock.json` | 2 | 0 | 0 | 2 |
| `apps/mgit-api/package-lock.json` | 4 | 1 | 1 | 6 |
| `apps/react-native/package-lock.json` | 7 | 2 | 5 | 14 |
| `apps/records-workflow-api/package-lock.json` | 2 | 0 | 0 | 2 |
| `apps/scheduler-api/package-lock.json` | 1 | 1 | 1 | 3 |

High-severity findings included vulnerable ranges of `axios`, `path-to-regexp`, `rollup`, `picomatch`, `undici`, `node-forge`, `tar`, `@xmldom/xmldom`, and `minimatch`.

## Changes Applied

1. Refreshed vulnerable lockfiles to patched dependency resolutions from the official npm registry.
2. Pinned `apps/mgit-api` to exact `axios@1.14.0` and added an `overrides` entry to prevent floating back to recently compromised releases.
3. Added `scripts/check-blocked-packages.mjs` and `.github/workflows/dependency-guard.yml` to fail future changes that reference blocked `axios` versions (`1.14.1`, `0.30.4`) or `plain-crypto-js`.
4. Changed repo-owned install paths from `npm install` to `npm ci` in:
   - `README.md`
   - `apps/auth-api/Dockerfile`
   - `apps/frontend/Dockerfile.dev`
   - `scripts/reinstall-node24.sh`
5. Aligned the stale `apps/mgit-api` `axios` metadata in the root `package-lock.json` with the pinned safe version.

## Verification

Post-remediation `npm audit` results:

| Lockfile | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: |
| `package-lock.json` | 0 | 0 | 0 | 0 |
| `apps/auth-api/package-lock.json` | 0 | 0 | 0 | 0 |
| `apps/frontend/package-lock.json` | 0 | 0 | 0 | 0 |
| `apps/mgit-api/package-lock.json` | 0 | 0 | 0 | 0 |
| `apps/react-native/package-lock.json` | 0 | 1 | 5 | 6 |
| `apps/records-workflow-api/package-lock.json` | 0 | 0 | 0 | 0 |
| `apps/scheduler-api/package-lock.json` | 0 | 0 | 0 | 0 |

Blocked-package verification:

```bash
node scripts/check-blocked-packages.mjs
```

Result:

```text
No blocked package references found.
```

Additional `axios` supply-chain validation from the official registry:

- `npm view axios@1.14.0 version time --registry=https://registry.npmjs.org` confirmed the pinned safe release exists.
- `npm view axios@1.14.1 version --registry=https://registry.npmjs.org` returned `404`, consistent with the blocked compromised release being unavailable from the registry.

## Residual Risk

The only remaining audited issues are in `apps/react-native` test tooling:

- 1 moderate `brace-expansion` issue
- 5 low-severity issues in the `jest-expo` -> `jest-environment-jsdom` -> `jsdom` chain

`npm audit` reports that the low-severity `jest-expo` chain would require `npm audit fix --force`, which would install `jest-expo@47.0.1` as a semver-major change. That was intentionally left out of this remediation because the user request was to fix the high-priority issues without introducing unnecessary breaking changes.

## Outcome

All currently auditable high-severity npm dependency findings in the repository have been remediated, and the repo now includes guardrails to prevent reintroduction of the recently compromised `axios` releases.
