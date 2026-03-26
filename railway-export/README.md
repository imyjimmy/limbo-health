# Railway Configuration Export

## Files

- `railway-*-vars.json` - full variable exports for each Railway service
- `railway-config.template.yml` - sanitized deployment template for the current layout
- `../docs/plans/records-workflow-railway-sync-and-deploy.md` - canonical Railway deploy + sync runbook for the records workflow service

## Records Workflow Prototype

`records-workflow-api` is deployed to Railway as a mirror of local records-workflow runtime data:

- the service runs `npm run start`
- the crawler does not run on Railway
- local Postgres is mirrored into Railway Postgres
- local records-workflow storage artifacts are mirrored into the Railway API service
- Postgres is dedicated to the records workflow service

## Bootstrap Flow

1. Provision `records-workflow-postgres`.
2. Provision `records-workflow-api` with:
   - `DATABASE_URL` pointing at `records-workflow-postgres`
   - explicit storage env vars under `/app/storage/*`
   - preferably a volume mounted at `/app/storage`
3. Provision the gateway route for `/api/records-workflow`.
4. Mirror the local dataset:
   - `./scripts/sync-records-workflow-railway.sh`

For the concrete UI/CLI steps, use:

- `docs/plans/records-workflow-railway-sync-and-deploy.md`

## Security

- Do not commit `railway-*-vars.json`.
- Commit only the template and README from this directory.
