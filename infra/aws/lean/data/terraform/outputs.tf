output "data_volume_id" {
  description = "Persistent EBS volume ID for Limbo application data."
  value       = aws_ebs_volume.data.id
}

output "data_volume_availability_zone" {
  description = "Availability zone for the persistent EBS data volume."
  value       = aws_ebs_volume.data.availability_zone
}

output "backup_bucket_name" {
  description = "Persistent S3 bucket used for backups and deployment artifacts."
  value       = aws_s3_bucket.backups.bucket
}
