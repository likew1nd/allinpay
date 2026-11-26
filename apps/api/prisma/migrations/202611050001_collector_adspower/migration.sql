ALTER TABLE `collector`
  ADD COLUMN `api_endpoint` VARCHAR(300) NULL,
  ADD COLUMN `api_key_encrypted` TEXT NULL,
  ADD COLUMN `next_sync_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `sync_lease_until` DATETIME(3) NULL,
  ADD COLUMN `sync_lease_owner` VARCHAR(191) NULL,
  ADD COLUMN `config_revision` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `account`
  ADD COLUMN `profile_no` VARCHAR(191) NULL,
  ADD COLUMN `group_name` VARCHAR(191) NULL,
  ADD COLUMN `profile_present` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `business_status` ENUM('NORMAL','RESTRICTED','JUDICIAL','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN `receipt_limit` DECIMAL(20,2) NULL,
  ADD COLUMN `payment_limit` DECIMAL(20,2) NULL,
  ADD COLUMN `unavailable_balance` DECIMAL(20,2) NULL,
  ADD COLUMN `pending_balance` DECIMAL(20,2) NULL;