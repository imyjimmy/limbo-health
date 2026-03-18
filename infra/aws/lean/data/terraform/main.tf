data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  az_name     = coalesce(var.availability_zone, data.aws_availability_zones.available.names[0])
  bucket_name = coalesce(var.backup_bucket_name, "${local.name_prefix}-${data.aws_caller_identity.current.account_id}-backups")
  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Stack       = "lean-data"
    },
    var.tags
  )
}

resource "aws_ebs_volume" "data" {
  availability_zone = local.az_name
  size              = var.data_volume_size
  type              = "gp3"
  encrypted         = true

  tags = merge(local.common_tags, {
    Name   = "${local.name_prefix}-data"
    Backup = "daily"
  })
}

resource "aws_s3_bucket" "backups" {
  bucket = local.bucket_name

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-backups"
  })
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "expire-old-backups"
    status = "Enabled"

    filter {}

    expiration {
      days = var.backup_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.backup_retention_days
    }
  }
}
