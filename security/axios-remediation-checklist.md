# Axios Remediation Checklist

Date: 2026-03-31

## Completed in This Branch

- [x] Pinned `apps/mgit-api` from `axios:^1.7.9` to exact `axios:1.14.0`.
- [x] Added npm `overrides` in `apps/mgit-api/package.json` to force `axios@1.14.0`.
- [x] Regenerated `apps/mgit-api/package-lock.json` with `npm install --package-lock-only --ignore-scripts`.
- [x] Aligned the root `package-lock.json` extraneous `apps/mgit-api` metadata to `axios:1.14.0`.
- [x] Replaced the lockfile-deleting `scripts/reinstall-node24.sh` flow with `npm ci` plus lockfile presence checks.
- [x] Hardened `apps/auth-api/Dockerfile` and `apps/frontend/Dockerfile.dev` from `npm install` to `npm ci`.
- [x] Updated the main README install instructions from `npm install` to `npm ci`.
- [x] Added `scripts/check-blocked-packages.mjs`.
- [x] Added `.github/workflows/dependency-guard.yml` so blocked package references fail in CI without installing dependencies.

## Verify After Merge

1. Run `node scripts/check-blocked-packages.mjs` in CI and on a clean checkout.
2. Confirm `apps/mgit-api/package-lock.json` still resolves `axios@1.14.0`.
3. Make sure no one reintroduces lockfile regeneration scripts that delete committed lockfiles and rerun `npm install`.

## Conditional Incident Response

Only perform these steps if a developer, self-hosted runner, or build host ran `scripts/reinstall-node24.sh` or a fresh `npm install` inside `apps/mgit-api` during the malicious-package window.

### Treat Potentially Affected Environments as Compromised

- developer laptops that ran the unsafe reinstall flow
- any self-hosted CI runner that performed a fresh `npm install` in `apps/mgit-api`
- any devcontainer or preview build host that installed from a missing or regenerated lockfile
- any container image build that copied a locally installed `node_modules` tree from an affected host

### Rotate Secrets Reachable From Those Environments

- GitHub tokens, SSH deploy keys, and local git credentials
- npm tokens or registry credentials
- AWS, Railway, or other cloud credentials used by deploy scripts
- database credentials and app secrets documented in `README.md`: `JWT_SECRET`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`
- OAuth and payment secrets documented in `README.md`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALBY_CLIENT_ID`, `ALBY_CLIENT_SECRET`
- Expo/EAS build credentials and any local `.env` values on the affected host

### Rebuild and Clean Up

- clear npm caches on affected hosts
- delete `node_modules` and reinstall from clean committed lockfiles on a known-clean machine
- rebuild any self-hosted runner image used for unsafe installs
- rebuild any container images produced from affected hosts after the unsafe install

## Forensic Indicators Actually Supported by Repo Evidence

- No `plain-crypto-js` was found in tracked files or reachable git history.
- No tracked lockfile ever contained `axios@1.14.1` or `axios@0.30.4`.
- The only repo-local exposure path found was the pre-remediation `scripts/reinstall-node24.sh` behavior that deleted lockfiles before running `npm install`.

No stronger forensic claim is supported by repo evidence alone.
