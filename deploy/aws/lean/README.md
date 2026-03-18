# Lean AWS Deployment Bundle

This directory contains the host-side assets for the single-EC2 AWS deployment described in [aws-railway-replacement-spec.md](/Users/imyjimmy/dev/pleb-emr/limbo-health/docs/specs/aws-railway-replacement-spec.md).

## What This Bundle Assumes

- the EC2 instance and EBS volume already exist
- the repo is available on the host at `/opt/limbo-health`
- the host was bootstrapped with Docker and SSM
- application data is still in the current transitional state:
  - MySQL for `auth-api` and `scheduler-api`
  - PostgreSQL for `records-workflow-api`

## Files

- [docker-compose.ec2.yml](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/docker-compose.ec2.yml)
- [Caddyfile](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/Caddyfile)
- [env.aws.example](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/env.aws.example)
- [bootstrap-host.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/bootstrap-host.sh)
- [deploy.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/deploy.sh)
- [apply-infrastructure.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/apply-infrastructure.sh)
- [destroy-infrastructure.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/destroy-infrastructure.sh)
- [sync-secrets-to-ssm.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/sync-secrets-to-ssm.sh)
- [publish-source-bundle.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/publish-source-bundle.sh)
- [fetch-source-bundle.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/fetch-source-bundle.sh)
- [render-env-from-ssm.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/render-env-from-ssm.sh)
- [backup-databases-to-s3.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/backup-databases-to-s3.sh)
- [backup-storage-to-s3.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/backup-storage-to-s3.sh)
- [backup-all.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/backup-all.sh)

## Top-Level Operations

`apply-infrastructure.sh` is the main deploy entrypoint. It:
- applies the persistent data stack
- syncs `deploy/aws/lean/.env.aws` into SSM Parameter Store
- publishes a source bundle into the persistent S3 bucket
- applies the disposable app stack
- tells the EC2 host to fetch the code bundle, render `.env.aws`, bootstrap itself, and start Docker Compose

`destroy-infrastructure.sh` is the inverse app-stack operation. It:
- destroys the disposable app stack
- deletes published source bundles under `artifacts/source/`
- deletes the synced SSM parameter path
- leaves the persistent data stack intact

That means the EBS data volume and S3 bucket survive delete, while the EC2 host, networking, alarms, Elastic IP, and app-side IAM are removed.

## Deploy Flow

1. Copy [env.aws.example](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/env.aws.example) to `deploy/aws/lean/.env.aws` and fill in the real values.
2. Run:

```bash
AWS_PROFILE=limbo-prod AWS_REGION=us-east-1 ./deploy/aws/lean/apply-infrastructure.sh
```

3. Import or sync the persistent application data separately:
   - MySQL dump if still in transitional dual-DB mode
   - records-workflow PostgreSQL dump
   - repo storage
   - scheduler uploads
   - records raw artifacts

## Delete Flow

To remove the app infrastructure but preserve data:

```bash
AWS_PROFILE=limbo-prod AWS_REGION=us-east-1 ./deploy/aws/lean/destroy-infrastructure.sh
```

This intentionally does not delete:
- the persistent EBS data volume
- the persistent S3 bucket
- any application data already stored in those persistent resources

## Credentials And Secrets Needed

AWS access:
- AWS account with permission for EC2, VPC, IAM, S3, Route 53, CloudWatch, and SSM
- Route 53 hosted zone ID for `limbo.health` if DNS should be managed automatically

Application secrets required for core app behavior:
- `JWT_SECRET`
- `INTERNAL_API_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Database secrets:
- MySQL root password
- MySQL app username/password
- records-workflow PostgreSQL username/password

Migration inputs:
- current MySQL dump
- current records-workflow PostgreSQL dump
- current repo storage directory
- current `users` directory for `mgit-api`
- current scheduler uploads directory
- current records-workflow raw corpus directory

Optional:
- repository read access token or deploy key if the EC2 host will pull directly from GitHub
- alert email for CloudWatch alarms
- `ALBY_CLIENT_ID`, `ALBY_CLIENT_SECRET`, `NWC_CONNECTION_STRING`, and `ADMIN_NOSTR_PRIVATE_KEY` only if you want billing/payment flows
- `BACKUP_S3_BUCKET` only if you want to run the included S3 backup scripts
