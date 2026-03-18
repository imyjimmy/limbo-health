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
- [backup-databases-to-s3.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/backup-databases-to-s3.sh)
- [backup-storage-to-s3.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/backup-storage-to-s3.sh)
- [backup-all.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/backup-all.sh)

## Deploy Flow

1. Copy [env.aws.example](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/env.aws.example) to `deploy/aws/lean/.env.aws` and fill in the real values.
2. Run [bootstrap-host.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/bootstrap-host.sh).
3. Import application MySQL data and records-workflow PostgreSQL data.
4. Copy repo storage, uploads, users, and records raw artifacts into `$LIMBO_DATA_DIR`.
5. Run [deploy.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/deploy.sh).

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
