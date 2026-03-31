data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  azs         = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  public_subnet_map = {
    for idx, az in local.azs : idx => {
      az   = az
      cidr = var.public_subnet_cidrs[idx]
    }
  }

  private_subnet_map = {
    for idx, az in local.azs : idx => {
      az   = az
      cidr = var.private_subnet_cidrs[idx]
    }
  }

  database_url = "postgres://${var.db_username}:${urlencode(random_password.db_password.result)}@${aws_db_instance.records.address}:5432/${var.db_name}"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Service     = "records-workflow-api"
    },
    var.tags
  )
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-vpc"
  })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-igw"
  })
}

resource "aws_subnet" "public" {
  for_each = local.public_subnet_map

  vpc_id                  = aws_vpc.main.id
  cidr_block              = each.value.cidr
  availability_zone       = each.value.az
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-${each.key}"
    Tier = "public"
  })
}

resource "aws_subnet" "private" {
  for_each = local.private_subnet_map

  vpc_id                  = aws_vpc.main.id
  cidr_block              = each.value.cidr
  availability_zone       = each.value.az
  map_public_ip_on_launch = false

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-private-${each.key}"
    Tier = "private"
  })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb-sg"
  description = "Allow public web traffic to ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-alb-sg"
  })
}

resource "aws_security_group" "ecs" {
  name        = "${local.name_prefix}-ecs-sg"
  description = "Allow ALB traffic to ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "ALB to app port"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-ecs-sg"
  })
}

resource "aws_security_group" "db" {
  name        = "${local.name_prefix}-db-sg"
  description = "Allow Postgres from ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "ECS to Postgres"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-sg"
  })
}

resource "aws_security_group" "efs" {
  name        = "${local.name_prefix}-efs-sg"
  description = "Allow NFS from ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "ECS to EFS"
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-efs-sg"
  })
}

resource "aws_db_subnet_group" "records" {
  name       = "${replace(local.name_prefix, "-", "")}-dbsubnets"
  subnet_ids = [for subnet in aws_subnet.private : subnet.id]

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-subnet-group"
  })
}

resource "random_password" "db_password" {
  length           = 24
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_db_instance" "records" {
  identifier                      = "${replace(local.name_prefix, "_", "-")}-postgres"
  allocated_storage               = var.db_allocated_storage
  max_allocated_storage           = var.db_allocated_storage + 20
  engine                          = "postgres"
  engine_version                  = var.db_engine_version
  instance_class                  = var.db_instance_class
  db_name                         = var.db_name
  username                        = var.db_username
  password                        = random_password.db_password.result
  db_subnet_group_name            = aws_db_subnet_group.records.name
  vpc_security_group_ids          = [aws_security_group.db.id]
  storage_encrypted               = true
  backup_retention_period         = var.db_backup_retention_days
  skip_final_snapshot             = var.db_skip_final_snapshot
  deletion_protection             = var.db_deletion_protection
  publicly_accessible             = false
  auto_minor_version_upgrade      = true
  performance_insights_enabled    = true
  enabled_cloudwatch_logs_exports = ["postgresql"]

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-postgres"
  })
}

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name_prefix}/records-workflow/database-url"
  recovery_window_in_days = 0

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = local.database_url
}

resource "aws_ecr_repository" "api" {
  name                 = "${var.project_name}/records-workflow-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images older than 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = 14

  tags = local.common_tags
}

resource "aws_efs_file_system" "raw_storage" {
  creation_token   = "${local.name_prefix}-raw-storage"
  encrypted        = true
  performance_mode = "generalPurpose"
  throughput_mode  = "bursting"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-raw-storage"
  })
}

resource "aws_efs_access_point" "raw_storage" {
  file_system_id = aws_efs_file_system.raw_storage.id

  posix_user {
    gid = 1000
    uid = 1000
  }

  root_directory {
    path = "/records-raw"

    creation_info {
      owner_gid   = 1000
      owner_uid   = 1000
      permissions = "0755"
    }
  }

  tags = local.common_tags
}

resource "aws_efs_mount_target" "raw_storage" {
  for_each = aws_subnet.private

  file_system_id  = aws_efs_file_system.raw_storage.id
  subnet_id       = each.value.id
  security_groups = [aws_security_group.efs.id]
}

resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.name_prefix}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_task_execution_secret_access" {
  name = "${local.name_prefix}-ecs-exec-secret-access"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.database_url.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "${local.name_prefix}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "ecs_task_efs_access" {
  name = "${local.name_prefix}-ecs-task-efs-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "elasticfilesystem:ClientMount",
          "elasticfilesystem:ClientWrite",
          "elasticfilesystem:DescribeMountTargets"
        ]
        Resource = [
          aws_efs_file_system.raw_storage.arn,
          aws_efs_access_point.raw_storage.arn
        ]
      }
    ]
  })
}

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.common_tags
}

resource "aws_lb" "api" {
  name               = substr("${local.name_prefix}-alb", 0, 32)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = [for subnet in aws_subnet.public : subnet.id]

  tags = local.common_tags
}

resource "aws_lb_target_group" "api" {
  name        = substr("${local.name_prefix}-tg", 0, 32)
  port        = var.container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    enabled             = true
    path                = "/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = local.common_tags
}

resource "aws_lb_listener" "http" {
  count = var.acm_certificate_arn == "" ? 1 : 0

  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_lb_listener" "http_redirect" {
  count = var.acm_certificate_arn == "" ? 0 : 1

  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  count = var.acm_certificate_arn == "" ? 0 : 1

  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name_prefix}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  volume {
    name = "raw-storage"

    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.raw_storage.id
      transit_encryption = "ENABLED"

      authorization_config {
        access_point_id = aws_efs_access_point.raw_storage.id
        iam             = "ENABLED"
      }
    }
  }

  container_definitions = jsonencode([
    {
      name      = "records-workflow-api"
      image     = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = tostring(var.container_port) },
        { name = "TARGETED_PAGES_STORAGE_DIR", value = "/app/storage/targeted-pages" },
        { name = "CAPTURED_FORMS_STORAGE_DIR", value = "/app/storage/captured-forms" },
        { name = "ACCEPTED_FORMS_STORAGE_DIR", value = "/app/storage/accepted-forms" },
        { name = "HOSPITAL_SUBMISSION_REQUIREMENTS_STORAGE_DIR", value = "/app/storage/hospital-submission-requirements" },
        { name = "QUESTION_MAPPING_STORAGE_DIR", value = "/app/storage/question-mappings" },
        { name = "PUBLISHED_TEMPLATE_STORAGE_DIR", value = "/app/storage/published-templates" },
        { name = "PARSED_STORAGE_DIR", value = "/app/storage/parsed" },
        { name = "DATA_INTAKE_STORAGE_DIR", value = "/app/storage/data-intake" },
        { name = "SEED_SCOPE_STORAGE_DIR", value = "/app/storage/internal/seed-scopes" },
        { name = "TRIAGE_STORAGE_DIR", value = "/app/storage/internal/triage-decisions" },
        { name = "RAW_STORAGE_DIR", value = "/app/storage/raw" },
        { name = "LEGACY_RAW_STORAGE_DIR", value = "/app/storage/raw" },
        { name = "SOURCE_DOCUMENT_STORAGE_DIR", value = "/app/storage/source-documents" },
        { name = "LEGACY_SOURCE_DOCUMENT_STORAGE_DIR", value = "/app/storage/source-documents" },
        { name = "CRAWL_STATE", value = "TX" }
      ]
      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = aws_secretsmanager_secret.database_url.arn
        }
      ]
      command = ["sh", "-c", "npm run migrate && npm run seed && npm run start"]
      mountPoints = [
        {
          sourceVolume  = "raw-storage"
          containerPath = "/app/storage"
          readOnly      = false
        }
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "wget -q -O - http://localhost:${var.container_port}/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 45
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "api"
        }
      }
    }
  ])

  tags = local.common_tags

  depends_on = [aws_secretsmanager_secret_version.database_url]
}

resource "aws_ecs_service" "api" {
  name            = "${local.name_prefix}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  network_configuration {
    subnets          = [for subnet in aws_subnet.public : subnet.id]
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "records-workflow-api"
    container_port   = var.container_port
  }

  tags = local.common_tags

  depends_on = [
    aws_lb_listener.http,
    aws_lb_listener.http_redirect,
    aws_lb_listener.https
  ]
}

resource "aws_ecs_task_definition" "crawler" {
  count = var.enable_scheduled_crawl ? 1 : 0

  family                   = "${local.name_prefix}-crawler"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.crawler_task_cpu
  memory                   = var.crawler_task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  volume {
    name = "raw-storage"

    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.raw_storage.id
      transit_encryption = "ENABLED"

      authorization_config {
        access_point_id = aws_efs_access_point.raw_storage.id
        iam             = "ENABLED"
      }
    }
  }

  container_definitions = jsonencode([
    {
      name      = "records-workflow-crawler"
      image     = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
      essential = true
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = tostring(var.container_port) },
        { name = "TARGETED_PAGES_STORAGE_DIR", value = "/app/storage/targeted-pages" },
        { name = "CAPTURED_FORMS_STORAGE_DIR", value = "/app/storage/captured-forms" },
        { name = "ACCEPTED_FORMS_STORAGE_DIR", value = "/app/storage/accepted-forms" },
        { name = "HOSPITAL_SUBMISSION_REQUIREMENTS_STORAGE_DIR", value = "/app/storage/hospital-submission-requirements" },
        { name = "QUESTION_MAPPING_STORAGE_DIR", value = "/app/storage/question-mappings" },
        { name = "PUBLISHED_TEMPLATE_STORAGE_DIR", value = "/app/storage/published-templates" },
        { name = "PARSED_STORAGE_DIR", value = "/app/storage/parsed" },
        { name = "DATA_INTAKE_STORAGE_DIR", value = "/app/storage/data-intake" },
        { name = "SEED_SCOPE_STORAGE_DIR", value = "/app/storage/internal/seed-scopes" },
        { name = "TRIAGE_STORAGE_DIR", value = "/app/storage/internal/triage-decisions" },
        { name = "RAW_STORAGE_DIR", value = "/app/storage/raw" },
        { name = "LEGACY_RAW_STORAGE_DIR", value = "/app/storage/raw" },
        { name = "SOURCE_DOCUMENT_STORAGE_DIR", value = "/app/storage/source-documents" },
        { name = "LEGACY_SOURCE_DOCUMENT_STORAGE_DIR", value = "/app/storage/source-documents" },
        { name = "CRAWL_STATE", value = "TX" }
      ]
      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = aws_secretsmanager_secret.database_url.arn
        }
      ]
      command = ["sh", "-c", "npm run migrate && npm run crawl"]
      mountPoints = [
        {
          sourceVolume  = "raw-storage"
          containerPath = "/app/storage"
          readOnly      = false
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "crawler"
        }
      }
    }
  ])

  tags = local.common_tags

  depends_on = [aws_secretsmanager_secret_version.database_url]
}

resource "aws_iam_role" "events_invoke_ecs" {
  count = var.enable_scheduled_crawl ? 1 : 0

  name = "${local.name_prefix}-events-ecs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "events_invoke_ecs" {
  count = var.enable_scheduled_crawl ? 1 : 0

  name = "${local.name_prefix}-events-ecs-policy"
  role = aws_iam_role.events_invoke_ecs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:RunTask"
        ]
        Resource = [
          aws_ecs_task_definition.crawler[0].arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = [
          aws_iam_role.ecs_task_execution.arn,
          aws_iam_role.ecs_task.arn
        ]
      }
    ]
  })
}

resource "aws_cloudwatch_event_rule" "crawl_schedule" {
  count = var.enable_scheduled_crawl ? 1 : 0

  name                = "${local.name_prefix}-crawl-schedule"
  description         = "Periodic records workflow crawl"
  schedule_expression = var.crawl_schedule_expression

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "crawl_schedule" {
  count = var.enable_scheduled_crawl ? 1 : 0

  rule     = aws_cloudwatch_event_rule.crawl_schedule[0].name
  arn      = aws_ecs_cluster.main.arn
  role_arn = aws_iam_role.events_invoke_ecs[0].arn

  ecs_target {
    launch_type         = "FARGATE"
    task_count          = 1
    task_definition_arn = aws_ecs_task_definition.crawler[0].arn

    network_configuration {
      subnets          = [for subnet in aws_subnet.public : subnet.id]
      security_groups  = [aws_security_group.ecs.id]
      assign_public_ip = true
    }
  }
}
