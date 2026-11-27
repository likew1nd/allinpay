ALTER TABLE `script_setting`
  ADD COLUMN `close_restricted_channels` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `restore_recovered_channels` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `account`
  ADD COLUMN `restriction_observed_at` DATETIME(3) NULL,
  ADD COLUMN `restriction_cleared_at` DATETIME(3) NULL;
ALTER TABLE `notification_event` ADD COLUMN `payload` JSON NULL;
CREATE TABLE `restriction_channel_hold` (
  `channel_id` VARCHAR(191) NOT NULL,
  `account_id` VARCHAR(191) NOT NULL,
  `app_id` VARCHAR(191) NOT NULL,
  `fingerprint` CHAR(64) NOT NULL,
  `state` VARCHAR(191) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `restriction_channel_hold_account_id_state_idx` (`account_id`, `state`),
  PRIMARY KEY (`channel_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `restriction_channel_job` (
  `id` VARCHAR(191) NOT NULL,
  `account_id` VARCHAR(191) NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `source` VARCHAR(191) NOT NULL,
  `event_types` JSON NOT NULL,
  `evidence` JSON NULL,
  `results` JSON NULL,
  `notified_results` JSON NULL,
  `next_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3) NULL,
  `lease_until` DATETIME(3) NULL,
  `lease_owner` VARCHAR(191) NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `restriction_channel_job_completed_at_next_at_idx` (`completed_at`, `next_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
