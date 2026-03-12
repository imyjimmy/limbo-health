# Terraform: AWS Deployment for `records-workflow-api`

This Terraform stack deploys a Phase-0-ready AWS environment for `apps/records-workflow-api`.

## What it provisions

- VPC with public and private subnets across 2 AZs
- Application Load Balancer with `/health` target checks
- ECS Cluster + Fargate Service for `records-workflow-api`
- ECR repository for image publishing
- RDS PostgreSQL in private subnets
- EFS (mounted at `/app/storage/raw`) for persistent crawler raw snapshots
- Secrets Manager secret for `DATABASE_URL`
- CloudWatch Logs for API and crawler tasks
- Optional EventBridge scheduled crawl task (`npm run crawl`)

## Skill alignment used

- `aws-skills`
- `aws-cloud`
- `aws-ecs-fargate`

## Prerequisites

- Terraform `>= 1.6`
- AWS CLI authenticated to target account
- Docker available locally for image build/push

## Deploy

1. Move into this directory.

```bash
cd apps/records-workflow-api/infra/terraform
```

2. Create your variable file.

```bash
cp terraform.tfvars.example terraform.tfvars
```

3. Initialize and apply.

```bash
terraform init
terraform plan -out tfplan
terraform apply tfplan
```

4. Push the API image to ECR.

```bash
REPO_URL=$(terraform output -raw ecr_repository_url)

aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin "${REPO_URL%/*}"

cd ../../../../
docker build -f apps/records-workflow-api/Dockerfile -t "$REPO_URL:latest" .
docker push "$REPO_URL:latest"
```

5. Force a new ECS deployment after pushing image.

```bash
cd apps/records-workflow-api/infra/terraform
CLUSTER=$(terraform output -raw ecs_cluster_name)
SERVICE=$(terraform output -raw ecs_service_name)

aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --force-new-deployment
```

6. Verify API health.

```bash
curl -sS "$(terraform output -raw healthcheck_url)"
```

## Notes

- If `acm_certificate_arn` is set, HTTP will redirect to HTTPS.
- `enable_scheduled_crawl = true` creates a periodic EventBridge trigger for crawler runs.
- The DB connection string is generated and stored in Secrets Manager.
- This stack assumes the app command can run migrations on startup (`npm run migrate && npm run seed && npm run start`).

## Destroy

```bash
terraform destroy
```

If `db_skip_final_snapshot = false`, set final snapshot options before destroy.
