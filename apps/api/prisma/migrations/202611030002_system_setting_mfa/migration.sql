CREATE TABLE `system_setting` (
  `setting_key` VARCHAR(191) NOT NULL, `setting_value` VARCHAR(191) NOT NULL,
  `updated_by` VARCHAR(191) NULL, `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`setting_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_totp` (
  `id` VARCHAR(191) NOT NULL, `user_id` VARCHAR(191) NOT NULL,
  `secret_encrypted` VARCHAR(191) NOT NULL, `verified` BOOLEAN NOT NULL DEFAULT false,
  `last_used_step` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `verified_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `user_totp_user_id_key` (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
