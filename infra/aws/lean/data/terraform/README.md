# Terraform: Lean AWS Persistent Data Stack

This stack provisions the persistent resources that survive app-stack deletes.

## What It Provisions

- one gp3 EBS volume for Limbo app data
- one S3 bucket for backups and deployment artifacts
- bucket encryption, versioning, public-access blocking, and lifecycle retention

## Why This Exists

The main app stack at [infra/aws/lean/terraform/README.md](/Users/imyjimmy/dev/pleb-emr/limbo-health/infra/aws/lean/terraform/README.md) should be disposable.

That means persistent resources must live elsewhere:

- app-stack `terraform destroy` should remove EC2, networking, alarms, and IAM
- app-stack `terraform destroy` should not delete the EBS data volume
- app-stack `terraform destroy` should not delete the backup/artifact bucket

## Apply

```bash
cd infra/aws/lean/data/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan -out tfplan
terraform apply tfplan
```

Apply this stack before the app stack.
