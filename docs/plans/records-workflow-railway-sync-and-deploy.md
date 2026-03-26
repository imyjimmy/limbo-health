# Records Workflow Railway Sync And Deploy

## Goal

Railway should mirror the local `records-workflow-api` runtime dataset on command.

That means Railway should receive the local:

- Postgres contents
- accepted forms
- parsed PDF artifacts
- other persisted pipeline artifacts under `apps/records-workflow-api/storage/`

Railway is not the place where upstream crawl, capture, parse, or question-extraction work should be recomputed during sync.

Local `records-workflow-api` data is the source of truth.

## Current Mirror Contract

The canonical human-facing pipeline is:

```text
data
=> seeds
=> targeted pages
=> captured forms
=> accepted forms
=> parsed pdf
=> question mapping
=> published template
```

For Railway, the current mirrored runtime contract is:

- Postgres comes from the local `records_workflow` database dump.
- `apps/records-workflow-api/storage/` is bundled from local and deployed into `records-workflow-api`.
- If the Railway service still uses legacy accepted-form paths such as `/app/storage/raw` or `/app/storage/source-documents`, the sync flow mirrors local `accepted-forms/` into those paths after deploy.

This is intentionally mirror-first:

- Railway does not run `crawl`
- Railway does not run `seed`
- Railway does not run parse/question extraction as part of sync
- Railway serves the mirrored artifacts

## Preferred Railway Layout

For new or cleaned-up Railway environments, use one storage mount at `/app/storage` and point the service at explicit stage directories:

```bash
railway variable set -s records-workflow-api \
  PORT=3020 \
  TARGETED_PAGES_STORAGE_DIR=/app/storage/targeted-pages \
  CAPTURED_FORMS_STORAGE_DIR=/app/storage/captured-forms \
  ACCEPTED_FORMS_STORAGE_DIR=/app/storage/accepted-forms \
  HOSPITAL_SUBMISSION_REQUIREMENTS_STORAGE_DIR=/app/storage/hospital-submission-requirements \
  QUESTION_MAPPING_STORAGE_DIR=/app/storage/question-mappings \
  PUBLISHED_TEMPLATE_STORAGE_DIR=/app/storage/published-templates \
  PARSED_STORAGE_DIR=/app/storage/parsed \
  LEGACY_RAW_STORAGE_DIR=/app/storage/raw \
  LEGACY_SOURCE_DOCUMENT_STORAGE_DIR=/app/storage/source-documents \
  --skip-deploys
```

Why:

- `/app/storage` can hold the whole artifact tree instead of only the old `raw/` prototype.
- the environment names match the current storage model
- old paths can still exist as backward-compatible fallbacks

## Legacy Railway Layout

Existing Railway environments may still be configured like this:

- a volume mounted at `/app/storage/raw`
- `RAW_STORAGE_DIR=/app/storage/raw`

That still works for now. The current sync scripts explicitly backfill `/app/storage/raw` and `/app/storage/source-documents` from the local `accepted-forms/` corpus after deploying the updated app bundle.

## First-Time Provisioning

1. Create the Railway Postgres service.

```bash
railway add --database postgres --service records-workflow-postgres
```

2. Create the Railway API service.

```bash
railway add --service records-workflow-api
```

3. Point Railway at the monorepo root and set:

- Dockerfile: `apps/records-workflow-api/Dockerfile`
- start command: `npm run start`

4. Attach storage.

Preferred:

- one volume mounted at `/app/storage`

Legacy fallback:

- existing volume mounted at `/app/storage/raw`

5. Set `DATABASE_URL` on `records-workflow-api` from `records-workflow-postgres`.

6. Set the explicit storage env vars from the preferred layout above.

7. Deploy once:

```bash
railway up -s records-workflow-api
```

## One Command Sync

From the repo root:

```bash
./scripts/sync-records-workflow-railway.sh
```

This is the canonical sync command.

It does three things:

1. Backs up Railway Postgres, imports a fresh local dump, and verifies Railway row counts against local.
2. Deploys `records-workflow-api` with the current local `apps/records-workflow-api/storage/` artifact tree and mirrors that bundled tree into the active Railway storage path.
3. Mirrors `accepted-forms/` into legacy Railway paths such as `/app/storage/raw` when those paths still exist.

## Storage Sync Behavior

The storage sync is implemented with a deploy bundle plus an in-service mirror step, not `tar | railway ssh`.

That is deliberate. On this machine, Railway CLI stdin streaming has been unreliable for large corpus copies. The deploy-bundle path is the current reliable way to mirror local artifacts into Railway on command.

Canonical storage sync command:

```bash
./scripts/sync-records-workflow-railway-storage.sh
```

Useful narrower commands:

```bash
./scripts/sync-records-workflow-railway-accepted-forms.sh
./scripts/sync-records-workflow-railway-parsed-storage.sh
./scripts/sync-records-workflow-railway-postgres.sh
```

## What This Does Not Do

This flow does not yet automate everything about Railway:

- it does not provision Railway services from scratch end-to-end
- it does not push gateway changes unless you explicitly redeploy the gateway
- it does not recompute pipeline stages on Railway

That is intentional. The contract is mirror local persisted truth, not rebuild it remotely.

## Verification

After a sync, verify at least:

```bash
curl -f https://limbo.health/api/records-workflow/hospital-systems >/dev/null
curl -fL "https://limbo.health/api/records-workflow/source-documents/<source-document-id>/content" -o /tmp/records-workflow-check.pdf
```

For operator-dashboard checks, verify the relevant internal question-review payload still shows the expected persisted geometry and mappings.
