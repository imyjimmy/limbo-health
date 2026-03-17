# Railway Configuration Export

## Files

- `railway-*-vars.json` - full variable exports for each Railway service
- `railway-config.template.yml` - sanitized deployment template for the current layout
- `records-workflow-api-railway-deploy.md` - explicit step-by-step deploy checklist for the records workflow prototype

## Records Workflow Prototype

`records-workflow-api` is deployed to Railway as a read-only prototype:

- the service runs `npm run start`
- the crawler does not run on Railway
- artifacts live on a Railway volume mounted at `/app/storage/raw`
- Postgres is dedicated to the records workflow service

## Bootstrap Flow

1. Provision `records-workflow-postgres`.
2. Provision `records-workflow-api` with:
   - `DATABASE_URL` pointing at `records-workflow-postgres`
   - `RAW_STORAGE_DIR=/app/storage/raw`
   - a volume mounted at `/app/storage/raw`
3. Provision the gateway route for `/api/records-workflow`.
4. Bootstrap the dataset:
   - `./scripts/export-records-workflow-local-postgres.sh`
   - `./scripts/import-records-workflow-railway-postgres.sh`
   - `./scripts/sync-records-workflow-railway-raw-storage.sh`

For the concrete UI/CLI steps, use:

- `railway-export/records-workflow-api-railway-deploy.md`

## Security

- Do not commit `railway-*-vars.json`.
- Commit only the template and README from this directory.
