variable "aws_region" {
  description = "AWS region for the lean deployment."
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

variable "instance_type" {
  description = "EC2 instance type for the lean deployment. Use t4g.large until MySQL is removed."
  type        = string
  default     = "t4g.large"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.72.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR block for the public subnet."
  type        = string
  default     = "10.72.0.0/24"
}

variable "allowed_http_cidrs" {
  description = "CIDR blocks allowed to reach ports 80 and 443."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "root_volume_size" {
  description = "Root volume size in GB."
  type        = number
  default     = 20
}

variable "data_volume_size" {
  description = "Data volume size in GB."
  type        = number
  default     = 100
}

variable "data_device_name" {
  description = "Requested Linux device name for the attached data volume."
  type        = string
  default     = "/dev/sdf"
}

variable "data_mount_point" {
  description = "Mount point for the persistent data volume."
  type        = string
  default     = "/srv/limbo-data"
}

variable "host_project_root" {
  description = "Path on the EC2 instance where the repository will live."
  type        = string
  default     = "/opt/limbo-health"
}

variable "data_volume_id" {
  description = "Persistent EBS volume ID that stores Limbo application data."
  type        = string
}

variable "backup_bucket_name" {
  description = "Persistent S3 bucket name used for backups and deployment artifacts."
  type        = string
}

variable "domain_name" {
  description = "Optional DNS name to point at the instance Elastic IP."
  type        = string
  default     = "limbo.health"
}

variable "route53_zone_id" {
  description = "Optional hosted zone ID for automatic DNS record creation."
  type        = string
  default     = null
}

variable "alarm_email" {
  description = "Optional email address for CloudWatch alarm notifications."
  type        = string
  default     = null
}

variable "ssm_parameter_path_prefix" {
  description = "SSM parameter path prefix that stores the rendered app env for the EC2 host."
  type        = string
  default     = "/limbo-health/prod/lean"
}

variable "tags" {
  description = "Additional tags applied to all resources."
  type        = map(string)
  default     = {}
}
