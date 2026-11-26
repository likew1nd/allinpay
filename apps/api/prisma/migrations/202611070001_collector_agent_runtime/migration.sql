-- Windows Agent 会话、命令与环境清单结构；仅新增字段与表，不改写既有数据。
ALTER TABLE `collector` ADD COLUMN `ads_power_checked_at` DATETIME(3) NULL,
    ADD COLUMN `ads_power_status` VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN `agent_session_id` VARCHAR(64) NULL,
    ADD COLUMN `agent_session_started_at` DATETIME(3) NULL,
    ADD COLUMN `applied_revision` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `environment_sync_error` VARCHAR(500) NULL,
    ADD COLUMN `environment_synced_at` DATETIME(3) NULL,
    ADD COLUMN `inventory_last_completed_id` VARCHAR(64) NULL,
    ADD COLUMN `inventory_sync_id` VARCHAR(64) NULL;

CREATE TABLE `collector_command` (
    `id` VARCHAR(64) NOT NULL,
    `collector_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NULL,
    `kind` VARCHAR(32) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `session_id` VARCHAR(64) NULL,
    `config_revision` INTEGER NOT NULL DEFAULT 1,
    `lease_until` DATETIME(3) NULL,
    `payload` JSON NULL,
    `result` JSON NULL,
    `login_attempt_at` DATETIME(3) NULL,
    `login_credential_hash` VARCHAR(64) NULL,
    `captcha_attempts` INTEGER NOT NULL DEFAULT 0,
    `captcha_hashes` JSON NULL,
    `error` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,

    INDEX `collector_command_collector_id_status_kind_idx`(`collector_id`, `status`, `kind`),
    INDEX `collector_command_lease_until_idx`(`lease_until`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `collector_inventory_page` (
    `id` VARCHAR(191) NOT NULL,
    `collector_id` VARCHAR(191) NOT NULL,
    `sync_id` VARCHAR(64) NOT NULL,
    `page` INTEGER NOT NULL,
    `total_pages` INTEGER NOT NULL,
    `profiles` JSON NOT NULL,
    `digest` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `collector_inventory_page_collector_id_sync_id_page_key`(`collector_id`, `sync_id`, `page`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `collector_command` ADD CONSTRAINT `collector_command_collector_id_fkey` FOREIGN KEY (`collector_id`) REFERENCES `collector`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `collector_inventory_page` ADD CONSTRAINT `collector_inventory_page_collector_id_fkey` FOREIGN KEY (`collector_id`) REFERENCES `collector`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
