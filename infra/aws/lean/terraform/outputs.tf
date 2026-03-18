output "instance_id" {
  description = "EC2 instance ID for the lean deployment host."
  value       = aws_instance.this.id
}

output "instance_public_ip" {
  description = "Elastic public IP address."
  value       = aws_eip.this.public_ip
}

output "backup_bucket_name" {
  description = "Persistent S3 bucket used for backups and deployment artifacts."
  value       = var.backup_bucket_name
}

output "ssm_start_session_command" {
  description = "Command to start an SSM shell session."
  value       = "aws ssm start-session --target ${aws_instance.this.id} --region ${var.aws_region}"
}

output "host_project_root" {
  description = "Path on the EC2 instance where the repository should be deployed."
  value       = var.host_project_root
}

output "data_mount_point" {
  description = "Host mount point for the persistent EBS-backed data volume."
  value       = var.data_mount_point
}

output "route53_record_fqdn" {
  description = "Route53 record created for the app, if enabled."
  value       = var.route53_zone_id == null ? null : aws_route53_record.app[0].fqdn
}
