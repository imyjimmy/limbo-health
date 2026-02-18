-- Limbo Health Database Schema
-- Greenfield design with oauth_connections for multi-provider auth
-- Created: 2025-11-09

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";
SET FOREIGN_KEY_CHECKS = 0;

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

-- ============================================================================
-- CORE AUTHENTICATION & AUTHORIZATION
-- ============================================================================

CREATE TABLE `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `create_datetime` datetime DEFAULT NULL,
  `update_datetime` datetime DEFAULT NULL,
  `name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `slug` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_admin` tinyint DEFAULT NULL,
  `appointments` int DEFAULT NULL,
  `customers` int DEFAULT NULL,
  `services` int DEFAULT NULL,
  `users` int DEFAULT NULL,
  `system_settings` int DEFAULT NULL,
  `user_settings` int DEFAULT NULL,
  `webhooks` int DEFAULT NULL,
  `blocked_periods` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `create_datetime` datetime DEFAULT NULL,
  `update_datetime` datetime DEFAULT NULL,
  `first_name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mobile_number` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone_number` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `zip_code` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `timezone` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT 'UTC',
  `language` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT 'english',
  `is_private` tinyint DEFAULT '0',
  `id_roles` int DEFAULT NULL,
  `nostr_pubkey` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ed25519_pubkey` VARCHAR(64),
  `encrypted_ed25519_privkey` TEXT,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_nostr_pubkey` (`nostr_pubkey`),
  KEY `id_roles` (`id_roles`),
  KEY `idx_email` (`email`),
  CONSTRAINT `users_roles` FOREIGN KEY (`id_roles`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `oauth_connections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `provider` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'google, github, apple, etc',
  `provider_user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'User ID from OAuth provider',
  `provider_email` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `access_token` text COLLATE utf8mb4_unicode_ci NULL,
  `refresh_token` text COLLATE utf8mb4_unicode_ci NULL,
  `token_expires_at` datetime NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_provider_user` (`provider`, `provider_user_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_provider` (`provider`),
  CONSTRAINT `oauth_connections_users` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_settings` (
  `id_users` int NOT NULL,
  `username` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `salt` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `working_plan` text COLLATE utf8mb4_unicode_ci,
  `working_plan_exceptions` text COLLATE utf8mb4_unicode_ci,
  `notifications` tinyint DEFAULT NULL,
  `google_sync` tinyint DEFAULT NULL,
  `google_calendar` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `caldav_sync` tinyint DEFAULT '0',
  `caldav_url` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `caldav_username` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `caldav_password` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sync_past_days` int DEFAULT '30',
  `sync_future_days` int DEFAULT '90',
  `calendar_view` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT 'default',
  PRIMARY KEY (`id_users`),
  CONSTRAINT `user_settings_users` FOREIGN KEY (`id_users`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Repository ownership and metadata
CREATE TABLE repositories (
  id VARCHAR(128) PRIMARY KEY,
  description TEXT,
  repo_type VARCHAR(64) DEFAULT 'medical-history',
  owner_user_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_owner (owner_user_id),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Per-repo access grants (supports multi-user access in the future)
CREATE TABLE repository_access (
  id INT AUTO_INCREMENT PRIMARY KEY,
  repo_id VARCHAR(128) NOT NULL,
  user_id INT NOT NULL,
  access_level ENUM('admin', 'read-write', 'read-only') NOT NULL DEFAULT 'read-only',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_repo_user (repo_id, user_id),
  INDEX idx_user_id (user_id),
  FOREIGN KEY (repo_id) REFERENCES repositories(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Scan sessions for doctor sharing
CREATE TABLE scan_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_token VARCHAR(128) UNIQUE NOT NULL,
  staging_repo_id VARCHAR(128) NOT NULL,
  patient_user_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  is_revoked BOOLEAN DEFAULT FALSE,
  INDEX idx_token (session_token),
  INDEX idx_expires (expires_at),
  INDEX idx_staging_repo (staging_repo_id),
  FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- PROVIDER PROFILES
-- ============================================================================

CREATE TABLE `provider_profiles` (
  `user_id` INT PRIMARY KEY,
  `username` VARCHAR(100) UNIQUE,
  `bio` TEXT,
  `profile_pic_url` VARCHAR(255),
  `year_of_birth` INT,
  `place_of_birth` VARCHAR(30),
  `gender` CHAR(1),
  `languages` JSON,
  `first_name` VARCHAR(22),
  `last_name` VARCHAR(25),
  `suffix` VARCHAR(3),
  `license_number` VARCHAR(9),
  `license_state` VARCHAR(2) DEFAULT 'TX',
  `license_issued_date` DATE,
  `license_expiration_date` DATE,
  `registration_status` VARCHAR(3),
  `registration_date` DATE,
  `method_of_licensure` CHAR(1),
  `medical_school` VARCHAR(67),
  `graduation_year` INT,
  `degree_type` VARCHAR(2),
  `primary_specialty` VARCHAR(30),
  `secondary_specialty` VARCHAR(30),
  `board_certifications` JSON,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `working_plan` JSON,
  `timezone` VARCHAR(50) DEFAULT 'America/Chicago',
  
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_username` (`username`),
  INDEX `idx_license` (`license_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- SERVICES & CATEGORIES
-- ============================================================================

CREATE TABLE `service_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `create_datetime` datetime DEFAULT NULL,
  `update_datetime` datetime DEFAULT NULL,
  `name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `services` (
  `id` int NOT NULL AUTO_INCREMENT,
  `create_datetime` datetime DEFAULT NULL,
  `update_datetime` datetime DEFAULT NULL,
  `name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` int DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `currency` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `color` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT '#7cbae8',
  `location` text COLLATE utf8mb4_unicode_ci,
  `availabilities_type` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT 'flexible',
  `attendants_number` int DEFAULT '1',
  `is_private` tinyint DEFAULT '0',
  `id_service_categories` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `id_service_categories` (`id_service_categories`),
  CONSTRAINT `services_service_categories` FOREIGN KEY (`id_service_categories`) REFERENCES `service_categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `services_providers` (
  `id_users` int NOT NULL,
  `id_services` int NOT NULL,
  PRIMARY KEY (`id_users`,`id_services`),
  KEY `services_providers_services` (`id_services`),
  CONSTRAINT `services_providers_services` FOREIGN KEY (`id_services`) REFERENCES `services` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `services_providers_users_provider` FOREIGN KEY (`id_users`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- APPOINTMENTS & SCHEDULING
-- ============================================================================

CREATE TABLE `appointments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `create_datetime` datetime DEFAULT NULL,
  `update_datetime` datetime DEFAULT NULL,
  `book_datetime` datetime DEFAULT NULL,
  `start_datetime` datetime DEFAULT NULL,
  `end_datetime` datetime DEFAULT NULL,
  `location` text COLLATE utf8mb4_unicode_ci,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `hash` text COLLATE utf8mb4_unicode_ci,
  `color` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT '#7cbae8',
  `status` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `is_unavailability` tinyint NOT NULL DEFAULT '0',
  `id_users_provider` int DEFAULT NULL,
  `id_users_customer` int DEFAULT NULL,
  `id_services` int DEFAULT NULL,
  `id_google_calendar` text COLLATE utf8mb4_unicode_ci,
  `id_caldav_calendar` text COLLATE utf8mb4_unicode_ci,
  `meeting_link` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'WebRTC meeting room name (e.g. bright-dolphin-swimming)',
  PRIMARY KEY (`id`),
  KEY `id_users_provider` (`id_users_provider`),
  KEY `id_users_customer` (`id_users_customer`),
  KEY `id_services` (`id_services`),
  CONSTRAINT `appointments_services` FOREIGN KEY (`id_services`) REFERENCES `services` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `appointments_users_customer` FOREIGN KEY (`id_users_customer`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `appointments_users_provider` FOREIGN KEY (`id_users_provider`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `blocked_periods` (
  `id` int NOT NULL AUTO_INCREMENT,
  `create_datetime` datetime DEFAULT NULL,
  `update_datetime` datetime DEFAULT NULL,
  `name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_datetime` datetime DEFAULT NULL,
  `end_datetime` datetime DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- BILLING & PAYMENTS
-- ============================================================================

CREATE TABLE `invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appointment_id` int NOT NULL,
  `payment_request` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount_sats` int NOT NULL,
  `invoice_hash` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `created_at` datetime DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_invoice_hash` (`invoice_hash`),
  CONSTRAINT `invoices_appointments` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- ADMINISTRATIVE TABLES
-- ============================================================================

CREATE TABLE `secretaries_providers` (
  `id_users_secretary` int NOT NULL,
  `id_users_provider` int NOT NULL,
  PRIMARY KEY (`id_users_secretary`,`id_users_provider`),
  KEY `secretaries_users_provider` (`id_users_provider`),
  CONSTRAINT `secretaries_users_provider` FOREIGN KEY (`id_users_provider`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `secretaries_users_secretary` FOREIGN KEY (`id_users_secretary`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

CREATE TABLE `consents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `create_datetime` datetime DEFAULT NULL,
  `update_datetime` datetime DEFAULT NULL,
  `created` timestamp NULL DEFAULT NULL,
  `modified` timestamp NULL DEFAULT NULL,
  `first_name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `create_datetime` datetime DEFAULT NULL,
  `update_datetime` datetime DEFAULT NULL,
  `name` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `value` longtext COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `webhooks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `create_datetime` datetime DEFAULT NULL,
  `update_datetime` datetime DEFAULT NULL,
  `name` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `url` text COLLATE utf8mb4_unicode_ci,
  `actions` text COLLATE utf8mb4_unicode_ci,
  `secret_header` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT 'X-Ea-Token',
  `secret_token` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_ssl_verified` tinyint NOT NULL DEFAULT '1',
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `migrations` (
  `version` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- SEED DATA (Default roles and settings)
-- ============================================================================

INSERT INTO `roles` (`id`, `create_datetime`, `update_datetime`, `name`, `slug`, `is_admin`, `appointments`, `customers`, `services`, `users`, `system_settings`, `user_settings`, `webhooks`, `blocked_periods`) VALUES
(1, NULL, NULL, 'Administrator', 'admin', 1, 15, 15, 15, 15, 15, 15, 15, 15),
(2, NULL, NULL, 'Provider', 'provider', 1, 15, 15, 15, 15, 15, 15, NULL, NULL),
(3, NULL, NULL, 'Customer', 'customer', 0, 0, 0, 0, 0, 0, 0, 0, 0),
(4, NULL, NULL, 'Secretary', 'secretary', 0, 15, 15, 0, 0, 0, 15, 0, 0),
(5, NULL, NULL, 'Admin Provider', 'admin-provider', 1, 15, 15, 15, 15, 15, 15, NULL, NULL);

INSERT INTO `migrations` (`version`) VALUES (62);

INSERT INTO `settings` (`id`, `create_datetime`, `update_datetime`, `name`, `value`) VALUES
(1, NULL, NULL, 'company_working_plan', '{\"monday\":{\"start\":\"09:00\",\"end\":\"23:55\",\"breaks\":[{\"start\":\"14:30\",\"end\":\"15:00\"}]},\"tuesday\":{\"start\":\"09:00\",\"end\":\"23:55\",\"breaks\":[{\"start\":\"14:30\",\"end\":\"15:00\"}]},\"wednesday\":{\"start\":\"09:00\",\"end\":\"23:55\",\"breaks\":[{\"start\":\"14:30\",\"end\":\"15:00\"}]},\"thursday\":{\"start\":\"09:00\",\"end\":\"23:55\",\"breaks\":[{\"start\":\"14:30\",\"end\":\"15:00\"}]},\"friday\":{\"start\":\"09:00\",\"end\":\"23:55\",\"breaks\":[{\"start\":\"14:30\",\"end\":\"15:00\"}]},\"saturday\":{\"start\":\"09:00\",\"end\":\"23:55\",\"breaks\":[{\"start\":\"14:30\",\"end\":\"15:00\"}]},\"sunday\":{\"start\":\"09:00\",\"end\":\"23:55\",\"breaks\":[{\"start\":\"14:30\",\"end\":\"15:00\"}]}}'),
(2, NULL, NULL, 'book_advance_timeout', '30'),
(71, NULL, NULL, 'company_name', 'Limbo Health'),
(72, NULL, NULL, 'company_email', 'admin@limbohealth.com'),
(73, NULL, NULL, 'company_link', 'https://limbohealth.com');

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;