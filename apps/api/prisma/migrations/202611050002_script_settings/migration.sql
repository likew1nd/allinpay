CREATE TABLE `script_setting` (
  `id` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT false,
  `tab1_url` VARCHAR(500) NOT NULL,
  `tab2_url` VARCHAR(500) NOT NULL,
  `min_refresh_seconds` INT NOT NULL DEFAULT 45,
  `max_refresh_seconds` INT NOT NULL DEFAULT 90,
  `navigation_timeout_seconds` INT NOT NULL DEFAULT 30,
  `max_concurrent_accounts` INT NOT NULL DEFAULT 4,
  `retry_count` INT NOT NULL DEFAULT 2,
  `action_timeout_seconds` INT NOT NULL DEFAULT 15,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,`updated_by` VARCHAR(191) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `script_setting` (
  `id`, `enabled`, `tab1_url`, `tab2_url`, `min_refresh_seconds`, `max_refresh_seconds`,
  `navigation_timeout_seconds`, `max_concurrent_accounts`, `retry_count`, `action_timeout_seconds`,
  `created_at`, `updated_at`
) VALUES (
  'default', false,
  'https://b.alipay.com/page/home',
  'https://b.alipay.com/page/self-relieving-web/riskManage/list',
  45, 90, 30, 4, 2, 15, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
);
