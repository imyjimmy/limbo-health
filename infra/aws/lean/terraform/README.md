# Terraform: Lean AWS App Stack for Limbo Health

This stack provisions the ephemeral app infrastructure described in [aws-railway-replacement-spec.md](/Users/imyjimmy/dev/pleb-emr/limbo-health/docs/specs/aws-railway-replacement-spec.md).

## What It Provisions

- one VPC
- one public subnet in a single AZ
- one internet gateway and public route table
- one EC2 instance with SSM Session Manager access
- one Elastic IP
- one security group for ports `80` and `443`
- CloudWatch alarms for CPU, status checks, memory, and disk
- optional Route 53 `A` record
- optional SNS email notifications for alarms
- IAM access for the existing S3 artifact/backup bucket and SSM env parameters

## What It Deliberately Does Not Provision

- no ECS
- no Fargate
- no ALB
- no NAT gateway
- no EFS
- no RDS
- no persistent EBS data volume
- no backup/artifact S3 bucket

Persistent data resources live in the separate data stack at [infra/aws/lean/data/terraform/README.md](/Users/imyjimmy/dev/pleb-emr/limbo-health/infra/aws/lean/data/terraform/README.md).

## Prerequisites

- Terraform `>= 1.6`
- AWS CLI authenticated to the target account
- Route 53 hosted zone ID only if you want Terraform to manage DNS
- persistent data volume ID
- persistent backup/artifact S3 bucket name
- application secrets already synced to SSM Parameter Store

## Apply

```bash
cd infra/aws/lean/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan -out tfplan
terraform apply tfplan
```

If your DNS is managed outside AWS, leave `route53_zone_id = null` in `terraform.tfvars` and point your existing DNS provider at the Elastic IP after apply.

This app stack is intended to be reversible:

- `terraform apply` creates the disposable Limbo app infrastructure
- `terraform destroy` removes it again
- persistent data survives because it lives in the separate data stack
- the easier top-level wrappers are [apply-infrastructure.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/apply-infrastructure.sh) and [destroy-infrastructure.sh](/Users/imyjimmy/dev/pleb-emr/limbo-health/deploy/aws/lean/destroy-infrastructure.sh)

## After Apply

1. Start an SSM session with the output command:

```bash
aws ssm start-session --target <instance-id> --region us-east-1
```

2. Publish the current source bundle to the persistent artifact bucket.

3. Render `deploy/aws/lean/.env.aws` from SSM onto the instance.

4. Run the host bootstrap:

```bash
cd /opt/limbo-health
./deploy/aws/lean/bootstrap-host.sh
```

5. Deploy the app containers:

```bash
cd /opt/limbo-health
./deploy/aws/lean/deploy.sh
```

## Transitional Reality

The current application code still uses MySQL for `auth-api` and `scheduler-api`, so the host-side deployment currently runs both:

- MySQL
- PostgreSQL

That is the transitional lean deployment.

Once the app is ported to PostgreSQL, you can shrink the host from `t4g.large` toward `t4g.medium` and remove MySQL from the Compose stack.
