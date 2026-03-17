# Deploy `records-workflow-api` To Railway

This is the one canonical checklist for deploying the records workflow prototype to Railway.

Use this document together with:

- `railway-export/railway-config.template.yml`
- `scripts/export-records-workflow-local-postgres.sh`
- `scripts/import-records-workflow-railway-postgres.sh`
- `scripts/sync-records-workflow-railway-raw-storage.sh`

## What This Deploys

- A dedicated Railway Postgres service named `records-workflow-postgres`
- A dedicated API service named `records-workflow-api`
- A Railway volume mounted at `/app/storage/raw`
- The existing gateway service routing `/api/records-workflow/*` to `records-workflow-api`

This prototype is read-only on Railway:

- Railway runs `npm run start`
- Railway does not run `crawl`
- Railway does not run `seed`
- Data is imported from the local dataset

## Prerequisites

1. Local repo is on the commit you want to deploy.
2. Railway CLI is installed:

```bash
npm i -g @railway/cli
```

3. You are logged in:

```bash
railway login
```

4. This repo is linked to the correct Railway project:

```bash
railway link
```

5. Local records workflow Postgres and raw artifact corpus are available:

- local DB default: `postgres://postgres:postgres@localhost:5433/records_workflow`
- local raw corpus default: `apps/records-workflow-api/storage/raw`

## Step 1: Create Railway Postgres

Preferred CLI:

```bash
railway add --database postgres --service records-workflow-postgres
```

UI alternative:

1. Open the Railway project.
2. Click `New`.
3. Add `Postgres`.
4. Rename the service to `records-workflow-postgres`.

## Step 2: Create Railway API Service

Preferred CLI:

```bash
railway add --service records-workflow-api
```

UI alternative:

1. Open the Railway project.
2. Click `New`.
3. Add a new empty service.
4. Name it `records-workflow-api`.

## Step 3: Configure The API Service Build

In the Railway UI for `records-workflow-api`:

1. Set the source repo to this monorepo.
2. Leave the build context at the repo root.
3. Set Dockerfile path to:

```text
apps/records-workflow-api/Dockerfile
```

4. Set the start command to:

```text
npm run start
```

Do not configure `npm run crawl`, `npm run seed`, or any cron job for this service.

## Step 4: Attach The Raw Artifact Volume

UI steps:

1. Open `records-workflow-api`.
2. Go to `Volumes`.
3. Add a volume.
4. Mount it at:

```text
/app/storage/raw
```

5. Name it something like `records-workflow-raw`.

CLI form if you prefer:

```bash
railway volume -s records-workflow-api add -m /app/storage/raw
```

## Step 5: Set The API Environment Variables

Set the non-secret variables:

```bash
railway variable set -s records-workflow-api PORT=3020 RAW_STORAGE_DIR=/app/storage/raw --skip-deploys
```

Then set `DATABASE_URL` for `records-workflow-api` to the `DATABASE_URL` provided by `records-workflow-postgres`.

Safe CLI version:

```bash
railway variable set -s records-workflow-api \
  DATABASE_URL="$(railway run -s records-workflow-postgres --no-local printenv DATABASE_URL | tail -n 1)"
```

UI alternative:

1. Open `records-workflow-postgres`.
2. Copy its `DATABASE_URL`.
3. Open `records-workflow-api`.
4. Add:
   - `PORT=3020`
   - `RAW_STORAGE_DIR=/app/storage/raw`
   - `DATABASE_URL=<copied postgres DATABASE_URL>`

## Step 6: Deploy The API Service

From the repo root:

```bash
railway up -s records-workflow-api
```

After deployment, verify the service is reachable by SSH and that `/app/storage/raw` exists:

```bash
railway ssh -s records-workflow-api "mkdir -p /app/storage/raw && ls -ld /app/storage/raw"
```

## Step 7: Export The Local Records Workflow Postgres Dump

From the repo root:

```bash
./scripts/export-records-workflow-local-postgres.sh
```

Default output:

```text
railway-export/records-workflow/records-workflow.dump
```

If your local DB is not on the default URL, set `LOCAL_RECORDS_WORKFLOW_DATABASE_URL` first.

## Step 8: Import The Dump Into Railway Postgres

From the repo root:

```bash
./scripts/import-records-workflow-railway-postgres.sh
```

If you need to override the Railway database URL explicitly, set:

```bash
export RAILWAY_RECORDS_WORKFLOW_DATABASE_URL='postgres://...'
```

## Step 9: Sync The Raw HTML/PDF Corpus Into Railway Volume

From the repo root:

```bash
./scripts/sync-records-workflow-railway-raw-storage.sh
```

This copies the local contents of:

```text
apps/records-workflow-api/storage/raw
```

into:

```text
/app/storage/raw
```

inside the Railway `records-workflow-api` service.

## Step 10: Deploy Or Redeploy The Gateway

If the existing Railway gateway service already exists, just redeploy it from this repo revision.

The gateway must use:

```text
apps/gateway/Dockerfile.railway
```

Then deploy:

```bash
railway up -s gateway
```

This is required because the new route is handled in the gateway nginx config:

- `/api/records-workflow/*` -> `records-workflow-api`
- `/v1/*` -> JSON `410 Gone`

## Step 11: Verify The Deployment

Check the new endpoint:

```bash
curl -i https://limbo.health/api/records-workflow/hospital-systems
```

Expected:

- `200 OK`
- `content-type: application/json`

Check the legacy endpoint:

```bash
curl -i https://limbo.health/v1/hospital-systems
```

Expected:

- `410 Gone`
- JSON body explaining that routes moved to `/api/records-workflow/*`

Check one cached document URL from a packet response and confirm it downloads.

## Step 12: Mobile Sanity Check

Run the app and verify the records request flow:

1. Open the records request screen.
2. Confirm hospital systems load successfully.
3. Select a hospital system.
4. Confirm the request packet loads.
5. Confirm the PDF flow can still use a cached PDF when `cachedContentUrl` is present.

## Troubleshooting

- If the API deploys but returns empty or inconsistent data, re-run:
  - `./scripts/import-records-workflow-railway-postgres.sh`
  - `./scripts/sync-records-workflow-railway-raw-storage.sh`
- If cached document URLs 404, verify the volume is mounted at `/app/storage/raw`.
- If the public endpoint still returns frontend HTML, redeploy the `gateway` service from the same commit as `records-workflow-api`.
- If the import script cannot resolve `DATABASE_URL`, set `RAILWAY_RECORDS_WORKFLOW_DATABASE_URL` manually and rerun it.
