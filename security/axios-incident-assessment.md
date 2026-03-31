# Axios Incident Assessment

Date: 2026-03-31
Bucket: A - No exposure found
Severity: Medium preventive response, no confirmed compromise

## Executive Summary

- Affected: no evidence that `limbo-health` ever committed or resolved `axios@1.14.1`, `axios@0.30.4`, or `plain-crypto-js` in tracked repo history.
- Direct vs transitive: `axios` is a direct dependency only in `apps/mgit-api`; other services only reference `gaxios`.
- Likely execution exposure: no repo evidence that CI, container builds, or tracked lockfiles executed the malicious versions.
- Residual risk: before this branch, `scripts/reinstall-node24.sh` could delete lockfiles and rerun `npm install` in `apps/mgit-api`; repo-only evidence cannot prove whether any developer used that path during the incident window.

## Evidence Table

| Location | Finding | Risk | Action taken |
| --- | --- | --- | --- |
| `apps/mgit-api/package-lock.json` | pre-remediation lock resolved `axios@1.13.4`; current branch pins `axios@1.14.0` | committed install path stayed below the malicious `1.14.1`, but direct dependency was floating in `package.json` | pinned exact safe version and regenerated only this lockfile without lifecycle scripts |
| `apps/mgit-api/package.json` | direct dependency was `^1.7.9` | future fresh `npm install` could float unless constrained | changed to exact `1.14.0` and added npm `overrides` |
| `package-lock.json` | root lock carried stale extraneous metadata for `apps/mgit-api` | audit confusion and stale floating spec in tracked metadata | aligned extraneous metadata to `1.14.0` |
| `scripts/reinstall-node24.sh` | pre-remediation script deleted every `package-lock.json` and reran `npm install` in every service, including `apps/mgit-api` | possible developer-machine exposure if someone ran it during the incident window | replaced with lockfile-preserving `npm ci` flow and hard fail on missing `package-lock.json` |
| `apps/mgit-api/Dockerfile` and `apps/mgit-api/Dockerfile.railway` | already used `npm ci --omit=dev` | low; lockfile-bound install path | retained, with safer lockfile now pinned to `1.14.0` |
| `.github/workflows` | no workflows existed in tracked repo before remediation | no repo CI logs or runner execution evidence available | added a workflow that fails on blocked package references without performing installs |
| repo-wide history search | `git log --all -S'axios-1.14.1'`, `-S'axios-0.30.4'`, and `-S'plain-crypto-js'` returned no matches | supports no tracked-repo exposure | documented and preserved in `security/axios-lockfile-audit.md` |

## Verdict Reasoning

This repository fits Bucket A because the audit found no committed malicious versions in current files or reachable git history, no `plain-crypto-js`, and no tracked CI workflow that could be shown to have resolved the malicious packages. The only direct `axios` use was in `apps/mgit-api`, whose committed lockfile resolved `1.13.4` before remediation and now resolves `1.14.0`.

The only meaningful caveat is the historical local helper script `scripts/reinstall-node24.sh`. Before this branch, it deleted lockfiles and then ran `npm install`, which means a developer machine could have resolved a malicious `axios` release if that script was executed during the incident window. There is no repo-side evidence that this happened, so the audit cannot justify Bucket B, C, or D.

## Remaining Risk

- Repo-only evidence cannot prove whether any developer ran `scripts/reinstall-node24.sh` or manually ran `cd apps/mgit-api && npm install` after the malicious versions were published.
- No CI workflow logs, package-manager cache contents, or container layer history were present in the repo, so execution outside tracked source cannot be ruled out absolutely.
- Lockfiles resolve packages through `registry.npmmirror.com`; this audit did not independently verify mirror provenance outside the committed artifacts.

## Recommended Follow-up

1. Ask developers whether `scripts/reinstall-node24.sh` or a fresh `npm install` inside `apps/mgit-api` was run during the malicious-package window.
2. If anyone answers yes, follow the conditional incident-response checklist in `security/axios-remediation-checklist.md`.
3. Keep the new dependency guard workflow enabled and reject any future PR that reintroduces blocked versions.
4. Prefer `npm ci` over `npm install` in docs, containers, and one-off bootstrap scripts unless lockfile regeneration is the explicit goal.
