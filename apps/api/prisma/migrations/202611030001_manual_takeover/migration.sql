CREATE TABLE `manual_takeover` (
  `id` VARCHAR(191) NOT NULL, `site_id` VARCHAR(191) NOT NULL,
  `scope_type` VARCHAR(191) NOT NULL, `polling_group_code` VARCHAR(191) NOT NULL DEFAULT '',
  `channel_code` VARCHAR(191) NOT NULL DEFAULT '', `reason` VARCHAR(500) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE', `created_by` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `expires_at` DATETIME(3) NOT NULL,
  `released_by` VARCHAR(191) NULL, `released_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `manual_takeover_site_id_status_expires_at_idx` (`site_id`, `status`, `expires_at`),
  CONSTRAINT `manual_takeover_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `epay_site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
