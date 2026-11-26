ALTER TABLE `collector`
  ADD COLUMN `script_next_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `script_lease_until` DATETIME(3) NULL,
  ADD COLUMN `script_lease_owner` VARCHAR(191) NULL;

ALTER TABLE `account`
  ADD COLUMN `script_next_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `script_lease_until` DATETIME(3) NULL,
  ADD COLUMN `script_lease_owner` VARCHAR(191) NULL;

CREATE INDEX `collector_script_next_at_script_lease_until_idx`
  ON `collector`(`script_next_at`, `script_lease_until`);
CREATE INDEX `account_collector_id_script_next_at_script_lease_until_idx`
  ON `account`(`collector_id`, `script_next_at`, `script_lease_until`);
