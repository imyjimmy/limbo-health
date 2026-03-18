# Terraform: Lean AWS Deployment for Limbo Health

This stack provisions the cheapest production-credible AWS foundation described in [aws-railway-replacement-spec.md](/Users/imyjimmy/dev/pleb-emr/limbo-health/docs/specs/aws-railway-replacement-spec.md).

## What It Provisions

- one VPC
- one public subnet in a single AZ
- one internet gateway and public route table
- one EC2 instance with SSM Session Manager access
- one additional gp3 EBS volume mounted for persistent app data
- one Elastic IP
- one S3 backup bucket with versioning and lifecycle retention
- one security group for ports `80` and `443`
- CloudWatch alarms for CPU, status checks, memory, and disk
- optional Route 53 `A` record
- optional SNS email notifications for alarms

## What It Deliberately Does Not Provision

- no ECS
- no Fargate
- no ALB
- no NAT gateway
- no EFS
- no RDS

Those are later scale-up steps, not the day-1 target.

## Prerequisites

- Terraform `>= 1.6`
- AWS CLI authenticated to the target account
- Route 53 hosted zone ID only if you want Terraform to manage DNS
- application secrets ready for the EC2 host env file

## Apply

```bash
cd infra/aws/lean/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan -out tfplan
terraform apply tfplan
```

If your DNS is managed outside AWS, leave `route53_zone_id = null` in `terraform.tfvars` and point your existing DNS provider at the Elastic IP after apply.

## After Apply

1. Start an SSM session with the output command:

```bash
aws ssm start-session --target <instance-id> --region us-east-1
```

2. Copy or clone the repository onto the instance at `/opt/limbo-health`.

3. Populate `deploy/aws/lean/.env.aws` on the instance from `deploy/aws/lean/env.aws.example`.

4. Run the host bootstrap:

```bash
cd /opt/limbo-health
./deploy/aws/lean/bootstrap-host.sh
```

5. Deploy the stack:

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
