# Railway To AWS PostgreSQL Cutover Checklist

Status: Ready for rehearsal
Owner: Limbo Health
Last updated: 2026-03-22

## Goal

Promote the AWS lean stack to production by moving the live `auth-api` + `scheduler-api` data plane off Railway MySQL and onto the AWS-hosted shared PostgreSQL database, then switching DNS from Railway to AWS.

This runbook assumes:

- `limbo.health` still points to Railway today
- AWS infrastructure can already be created and destroyed independently
- the AWS lean stack is a parallel environment, not the current source of truth
- Railway remains the rollback target until the AWS cutover is stable

Relevant companion docs:

- [aws-railway-replacement-spec.md](/Users/imyjimmy/dev/pleb-emr/limbo-health/docs/specs/aws-railway-replacement-spec.md)
- [mysql-to-postgres-migration-plan.md](/Users/imyjimmy/dev/pleb-emr/limbo-health/docs/plans/mysql-to-postgres-migration-plan.md)

## Current Reality

As of 2026-03-22, the live Railway MySQL database is small and already import-tested.

Observed populated core tables:

- `roles=6`
- `users=3`
- `oauth_connections=3`
- `repositories=3`
- `repository_access=3`
- `settings=5`
- `migrations=1`

Everything else in the shared auth/scheduler table set was `0` when checked.

The same live Railway data was successfully imported into local PostgreSQL with:

- matching row counts
- healthy local `auth-api`
- healthy local `scheduler-api`
- passing auth integration tests

## Recommended Execution Model

Use Railway as the source of truth until the final switch.

The safest rollout is:

1. Rehearse AWS as many times as needed while DNS still points at Railway.
2. On cutover day, freeze writes on Railway for a short maintenance window.
3. Run one final import from live Railway MySQL into AWS PostgreSQL.
4. Smoke test AWS.
5. Flip DNS to AWS.
6. Keep Railway running for rollback until AWS is proven stable.

## Preflight Checklist

Complete these before the final cutover day:

- AWS lean infra applies cleanly with [apply-infrastructure.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/apply-infrastructure.sh).
- AWS app stack deploys cleanly with [deploy.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/deploy.sh).
- AWS stack can also be destroyed cleanly with [destroy-infrastructure.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/destroy-infrastructure.sh).
- `deploy/aws/lean/.env.aws` is complete and synced to SSM.
- AWS host bootstraps successfully via [bootstrap-host.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/bootstrap-host.sh).
- The AWS hostname or Elastic IP is reachable before DNS cutover.
- Auth, repo, scheduler, uploads, and records-workflow smoke tests pass on AWS before touching production DNS.
- Route 53 TTL for the production record is lowered ahead of time if fast rollback is desired.
- Railway remains healthy and untouched.

## One-Time AWS Prep

Populate the source MySQL values in `deploy/aws/lean/.env.aws` before the final sync. These should come from the live Railway `MySQL` service.

Useful Railway CLI commands from the linked repo:

```bash
railway variables --service MySQL --json
```

At minimum, set:

```bash
SOURCE_MYSQL_HOST=switchyard.proxy.rlwy.net
SOURCE_MYSQL_PORT=12308
SOURCE_MYSQL_DATABASE=railway
SOURCE_MYSQL_USER=root
SOURCE_MYSQL_PASSWORD=...
```

Then resync secrets and deploy:

```bash
AWS_PROFILE=limbo-prod AWS_REGION=us-east-1 ./deploy/aws/lean/apply-infrastructure.sh
```

If the infrastructure is already up and only secrets changed:

```bash
./deploy/aws/lean/sync-secrets-to-ssm.sh ./deploy/aws/lean/.env.aws
```

Then on the EC2 host:

```bash
cd /opt/limbo-health
./deploy/aws/lean/render-env-from-ssm.sh
./deploy/aws/lean/deploy.sh
```

## Cutover Day Checklist

### 1. Confirm Railway is still the source of truth

Run a quick Railway sanity check:

```bash
railway status
railway variables --service MySQL --json
```

Optional live table count check:

```bash
SOURCE_MYSQL_URL="$(railway variables --service MySQL --json | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>process.stdout.write(JSON.parse(s).MYSQL_PUBLIC_URL))')" \
node --input-type=module <<'NODE'
import mysql from 'mysql2/promise';
const pool = await mysql.createPool({ uri: process.env.SOURCE_MYSQL_URL, connectionLimit: 1 });
for (const table of ['roles', 'users', 'oauth_connections', 'repositories', 'repository_access', 'settings', 'migrations']) {
  const [rows] = await pool.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
  console.log(`${table}\t${rows[0].count}`);
}
await pool.end();
NODE
```

### 2. Start the maintenance window

Because the repo does not currently have a built-in maintenance mode, use a short write freeze.

Required outcome:

- no new writes hit Railway MySQL during the final sync window

Operator options:

- temporarily place the public app behind a maintenance page
- or temporarily stop the Railway-facing write path

Do not proceed to the final import until writes are frozen.

### 3. Redeploy AWS one last time

Ensure AWS is on the exact source bundle and env you want to promote:

```bash
AWS_PROFILE=limbo-prod AWS_REGION=us-east-1 ./deploy/aws/lean/apply-infrastructure.sh
```

This keeps data resources intact and refreshes the app host/code path.

### 4. Run the final MySQL -> PostgreSQL import on AWS

On the AWS EC2 host:

```bash
cd /opt/limbo-health
./deploy/aws/lean/render-env-from-ssm.sh
./deploy/aws/lean/import-core-db-from-source.sh
```

The import helper:

- reads `SOURCE_MYSQL_*` or `SOURCE_MYSQL_URL` from `deploy/aws/lean/.env.aws`
- connects to the running AWS `records-workflow-postgres` container
- truncates the migrated core tables
- imports the latest Railway MySQL snapshot
- verifies row counts before finishing

### 5. Verify row counts on AWS Postgres

On the AWS EC2 host:

```bash
cd /opt/limbo-health
source ./deploy/aws/lean/.env.aws
docker compose --env-file ./deploy/aws/lean/.env.aws -f ./deploy/aws/lean/docker-compose.ec2.yml \
  exec records-workflow-postgres \
  psql -U "$RECORDS_WORKFLOW_DB_USER" -d "$RECORDS_WORKFLOW_DB_NAME" \
  -c "select 'roles' as table_name, count(*) from roles
      union all select 'users', count(*) from users
      union all select 'oauth_connections', count(*) from oauth_connections
      union all select 'repositories', count(*) from repositories
      union all select 'repository_access', count(*) from repository_access
      union all select 'settings', count(*) from settings
      union all select 'migrations', count(*) from migrations;"
```

Counts should match the final Railway snapshot.

### 6. Smoke test AWS before DNS flip

Run the included smoke checks from the AWS host or operator workstation:

```bash
curl -I https://${PUBLIC_HOSTNAME}
curl https://${PUBLIC_HOSTNAME}/api/records-workflow/hospital-systems
```

Then manually verify:

- Nostr login works
- Google login works if enabled
- `GET /api/auth/me` returns the expected user
- existing repositories are visible
- repo access still matches the imported users
- scheduler admin pages load
- uploads still resolve

If any core auth or repo flow fails, stop here and do not change DNS.

### 7. Flip DNS from Railway to AWS

After AWS passes smoke tests:

- update the `limbo.health` record to the AWS Elastic IP
- wait for the low TTL window to expire
- re-run the smoke tests against `https://limbo.health`

### 8. Post-cutover watch window

For the first hour after the DNS change:

- watch the AWS container logs
- watch Caddy/nginx logs
- test the top auth flows again
- test repo access again
- confirm backups still run

Do not decommission Railway yet.

## Rollback Checklist

Use rollback if:

- auth login fails
- `/api/auth/me` fails
- repository access is wrong
- uploads or records-workflow are broken
- DNS flipped but AWS behavior is not trustworthy

Rollback steps:

1. Point `limbo.health` back to Railway.
2. End the maintenance window on Railway.
3. Leave AWS up for debugging, but treat Railway as source of truth again.
4. Do not attempt bidirectional reconciliation.
5. When ready, fix AWS and re-run the final import from Railway MySQL again.

Why rollback is straightforward:

- Railway remains untouched until after the successful DNS cutover
- the final sync is one-way into AWS PostgreSQL
- no production writes should occur on AWS before the flip

## Definition Of Done

The cutover is complete only when all of the following are true:

- `limbo.health` resolves to AWS
- AWS auth and scheduler traffic are using PostgreSQL
- imported users, oauth connections, repositories, and access grants are present on AWS PostgreSQL
- smoke tests pass through the production hostname
- Railway is no longer serving production traffic
- Railway MySQL is retained temporarily for rollback, not used actively
