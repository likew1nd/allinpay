ALTER TABLE `epay_site`
  ADD COLUMN `next_connection_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN `connection_lease_until` DATETIME(3) NULL,
  ADD COLUMN `connection_lease_owner` VARCHAR(191) NULL;

CREATE INDEX `epay_site_next_connection_at_connection_lease_until_idx`
  ON `epay_site` (`next_connection_at`, `connection_lease_until`);
