data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  az_name     = data.aws_availability_zones.available.names[0]
  bucket_name = coalesce(var.backup_bucket_name, "${local.name_prefix}-${data.aws_caller_identity.current.account_id}-backups")
  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Stack       = "lean-ec2"
    },
    var.tags
  )
  alarm_actions = var.alarm_email == null ? [] : [aws_sns_topic.alarms[0].arn]
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-vpc"
  })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-igw"
  })
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = local.az_name
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-${local.az_name}"
    Tier = "public"
  })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "instance" {
  name        = "${local.name_prefix}-instance"
  description = "Public ingress for the lean Limbo Health host."
  vpc_id      = aws_vpc.this.id

  dynamic "ingress" {
    for_each = [80, 443]

    content {
      from_port   = ingress.value
      to_port     = ingress.value
      protocol    = "tcp"
      cidr_blocks = var.allowed_http_cidrs
      description = "Allow public web traffic on port ${ingress.value}"
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-instance"
  })
}

data "aws_iam_policy" "ssm_core" {
  arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy" "cloudwatch_agent" {
  arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_role" "instance" {
  name = "${local.name_prefix}-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.instance.name
  policy_arn = data.aws_iam_policy.ssm_core.arn
}

resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  role       = aws_iam_role.instance.name
  policy_arn = data.aws_iam_policy.cloudwatch_agent.arn
}

resource "aws_iam_role_policy" "backup_bucket_access" {
  name = "${local.name_prefix}-backup-bucket"
  role = aws_iam_role.instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.backups.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.backups.arn}/*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "this" {
  name = "${local.name_prefix}-instance-profile"
  role = aws_iam_role.instance.name
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

resource "aws_instance" "this" {
  ami                         = data.aws_ssm_parameter.al2023_arm64.value
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.instance.id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.this.name

  user_data = templatefile("${path.module}/templates/user-data.sh.tftpl", {
    data_mount_point  = var.data_mount_point
    host_project_root = var.host_project_root
  })

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_size
    encrypted   = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-host"
  })
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

resource "aws_volume_attachment" "data" {
  device_name = var.data_device_name
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.this.id
}

resource "aws_eip" "this" {
  domain   = "vpc"
  instance = aws_instance.this.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-eip"
  })
}

resource "aws_route53_record" "app" {
  count   = var.route53_zone_id == null ? 0 : 1
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"
  ttl     = 300
  records = [aws_eip.this.public_ip]
}

resource "aws_sns_topic" "alarms" {
  count = var.alarm_email == null ? 0 : 1
  name  = "${local.name_prefix}-alarms"

  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "alarm_email" {
  count     = var.alarm_email == null ? 0 : 1
  topic_arn = aws_sns_topic.alarms[0].arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "${local.name_prefix}-cpu-high"
  alarm_description   = "Scale or resize when EC2 CPU remains high for 15 minutes."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 60
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions

  dimensions = {
    InstanceId = aws_instance.this.id
  }
}

resource "aws_cloudwatch_metric_alarm" "instance_status_failed" {
  alarm_name          = "${local.name_prefix}-instance-status-failed"
  alarm_description   = "Alert when the EC2 host fails its instance status checks."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions

  dimensions = {
    InstanceId = aws_instance.this.id
  }
}

resource "aws_cloudwatch_metric_alarm" "memory_high" {
  alarm_name          = "${local.name_prefix}-memory-high"
  alarm_description   = "Alert when the host reports sustained high memory use."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "mem_used_percent"
  namespace           = "CWAgent"
  period              = 300
  statistic           = "Average"
  threshold           = 75
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions

  dimensions = {
    InstanceId = aws_instance.this.id
  }
}

resource "aws_cloudwatch_metric_alarm" "disk_high" {
  alarm_name          = "${local.name_prefix}-disk-high"
  alarm_description   = "Alert when the persistent data volume is filling up."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "disk_used_percent"
  namespace           = "CWAgent"
  period              = 300
  statistic           = "Average"
  threshold           = 70
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions

  dimensions = {
    InstanceId = aws_instance.this.id
  }
}
