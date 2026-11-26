-- 转账终态截图：图片单独成表，transfer_request 只加一个轻量的采集时间
ALTER TABLE `transfer_request` ADD COLUMN `screenshot_at` DATETIME(3) NULL;

CREATE TABLE `transfer_screenshot` (
  `transfer_id` VARCHAR(191) NOT NULL,
  `image` MEDIUMTEXT NOT NULL,
  `result` VARCHAR(16) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`transfer_id`),
  CONSTRAINT `transfer_screenshot_transfer_id_fkey` FOREIGN KEY (`transfer_id`) REFERENCES `transfer_request` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
