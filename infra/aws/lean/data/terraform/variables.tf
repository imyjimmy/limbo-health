variable "aws_region" {
  description = "AWS region for the persistent lean data stack."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project slug used in AWS resource names."
  type        = string
  default     = "limbo-health"
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "prod"
}

variable "availability_zone" {
  description = "Availability zone for the persistent EBS data volume. Leave null to use the first AZ in the region."
  type        = string
  default     = null
}

variable "data_volume_size" {
  description = "Persistent data volume size in GB."
  type        = number
  default     = 100
}

variable "backup_bucket_name" {
  description = "Optional explicit S3 bucket name for backups and deployment artifacts. Leave null to auto-generate."
  type        = string
  default     = null
}

variable "backup_retention_days" {
  description = "Retention window for S3 backups."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Additional tags applied to all resources."
  type        = map(string)
  default     = {}
}
