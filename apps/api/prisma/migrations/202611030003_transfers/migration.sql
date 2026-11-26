ALTER TABLE `account`
  ADD COLUMN `balance` DECIMAL(20, 2) NULL,
  ADD COLUMN `balance_currency` VARCHAR(191) NULL,
  ADD COLUMN `balance_at` DATETIME(3) NULL;

ALTER TABLE `fund_account` ADD COLUMN `account_id` VARCHAR(191) NULL;
ALTER TABLE `fund_account` ADD CONSTRAINT `fund_account_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `payee` (
  `id` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL,
  `account_encrypted` TEXT NOT NULL, `account_masked` VARCHAR(191) NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'CNY', `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  `created_by` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `payee_status_idx` (`status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `transfer_rule` (
  `id` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL,
  `fund_account_id` VARCHAR(191) NOT NULL, `payee_id` VARCHAR(191) NOT NULL,
  `mode` VARCHAR(191) NOT NULL DEFAULT 'OBSERVE',
  `trigger_balance` DECIMAL(20, 2) NOT NULL, `reserve_amount` DECIMAL(20, 2) NOT NULL DEFAULT 0,
  `fee_buffer` DECIMAL(20, 2) NOT NULL DEFAULT 0, `min_amount` DECIMAL(20, 2) NOT NULL DEFAULT 0,
  `max_amount` DECIMAL(20, 2) NOT NULL, `daily_limit` DECIMAL(20, 2) NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT false, `version` INTEGER NOT NULL DEFAULT 1,
  `created_by` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_by` VARCHAR(191) NULL, `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `transfer_rule_fund_account_id_enabled_idx` (`fund_account_id`, `enabled`),
  CONSTRAINT `transfer_rule_fund_account_id_fkey` FOREIGN KEY (`fund_account_id`) REFERENCES `fund_account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `transfer_rule_payee_id_fkey` FOREIGN KEY (`payee_id`) REFERENCES `payee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `transfer_request` (
  `id` VARCHAR(191) NOT NULL, `out_biz_no` VARCHAR(191) NOT NULL,
  `rule_id` VARCHAR(191) NOT NULL, `rule_version` INTEGER NOT NULL,
  `fund_account_id` VARCHAR(191) NOT NULL, `payee_id` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(20, 2) NOT NULL, `currency` VARCHAR(191) NOT NULL,
  `balance_snapshot` DECIMAL(20, 2) NOT NULL, `balance_at` DATETIME(3) NOT NULL,
  `mode` VARCHAR(191) NOT NULL, `status` VARCHAR(191) NOT NULL,
  `confirmed_by` VARCHAR(191) NULL, `confirmed_at` DATETIME(3) NULL,
  `collector_id` VARCHAR(191) NULL, `claimed_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL, `result_note` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `transfer_request_out_biz_no_key` (`out_biz_no`),
  INDEX `transfer_request_fund_account_id_status_idx` (`fund_account_id`, `status`),
  INDEX `transfer_request_status_created_at_idx` (`status`, `created_at`),
  CONSTRAINT `transfer_request_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `transfer_rule`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `transfer_request_fund_account_id_fkey` FOREIGN KEY (`fund_account_id`) REFERENCES `fund_account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `transfer_request_payee_id_fkey` FOREIGN KEY (`payee_id`) REFERENCES `payee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
