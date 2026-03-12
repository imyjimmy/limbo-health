variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project slug used in resource names."
  type        = string
  default     = "limbo-records-workflow"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)."
  type        = string
  default     = "dev"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones to use."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be between 2 and 3."
  }
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs (must include at least az_count entries)."
  type        = list(string)
  default     = ["10.40.0.0/24", "10.40.1.0/24", "10.40.2.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) >= 3
    error_message = "public_subnet_cidrs must include at least 3 entries."
  }
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDRs (must include at least az_count entries)."
  type        = list(string)
  default     = ["10.40.10.0/24", "10.40.11.0/24", "10.40.12.0/24"]

  validation {
    condition     = length(var.private_subnet_cidrs) >= 3
    error_message = "private_subnet_cidrs must include at least 3 entries."
  }
}

variable "container_port" {
  description = "Container port for records-workflow-api."
  type        = number
  default     = 3020
}

variable "desired_count" {
  description = "Desired ECS service task count."
  type        = number
  default     = 1
}

variable "task_cpu" {
  description = "Fargate CPU units for API task definition."
  type        = string
  default     = "512"
}

variable "task_memory" {
  description = "Fargate memory (MiB) for API task definition."
  type        = string
  default     = "1024"
}

variable "crawler_task_cpu" {
  description = "Fargate CPU units for scheduled crawler task."
  type        = string
  default     = "1024"
}

variable "crawler_task_memory" {
  description = "Fargate memory (MiB) for scheduled crawler task."
  type        = string
  default     = "2048"
}

variable "image_tag" {
  description = "Container image tag pushed to ECR."
  type        = string
  default     = "latest"
}

variable "acm_certificate_arn" {
  description = "Optional ACM certificate ARN for HTTPS listener. Leave empty to serve HTTP only."
  type        = string
  default     = ""
}

variable "db_name" {
  description = "Database name for records workflow service."
  type        = string
  default     = "recordsworkflow"
}

variable "db_username" {
  description = "Database admin username."
  type        = string
  default     = "recordsadmin"
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage (GB) for RDS."
  type        = number
  default     = 20
}

variable "db_engine_version" {
  description = "Optional Postgres engine version (set null for default latest supported major)."
  type        = string
  default     = null
}

variable "db_backup_retention_days" {
  description = "Backup retention in days for RDS."
  type        = number
  default     = 7
}

variable "db_skip_final_snapshot" {
  description = "Skip final snapshot on destroy (good for non-prod)."
  type        = bool
  default     = true
}

variable "db_deletion_protection" {
  description = "Enable deletion protection for RDS."
  type        = bool
  default     = false
}

variable "enable_scheduled_crawl" {
  description = "Enable EventBridge-triggered periodic crawler runs."
  type        = bool
  default     = true
}

variable "crawl_schedule_expression" {
  description = "EventBridge schedule expression for crawler task."
  type        = string
  default     = "rate(30 days)"
}

variable "tags" {
  description = "Additional tags to merge onto all resources."
  type        = map(string)
  default     = {}
}
