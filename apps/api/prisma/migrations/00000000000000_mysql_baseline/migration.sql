-- Source migration: 0_init_migration
-- CreateEnum

-- CreateEnum

-- CreateTable
CREATE TABLE `sys_user` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `built_in` BOOLEAN NOT NULL DEFAULT false,
    `avatar` VARCHAR(191),
    `email` VARCHAR(191),
    `phone_number` VARCHAR(191),
    `nick_name` VARCHAR(191) NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(191) NOT NULL,
    `updated_at` TIMESTAMP(3),
    `updated_by` VARCHAR(191),

    CONSTRAINT `sys_user_pkey` PRIMARY KEY (`id`)
);

-- CreateTable
CREATE TABLE `casbin_rule` (
    `id` INT AUTO_INCREMENT NOT NULL,
    `ptype` VARCHAR(191) NOT NULL,
    `v0` VARCHAR(191),
    `v1` VARCHAR(191),
    `v2` VARCHAR(191),
    `v3` VARCHAR(191),
    `v4` VARCHAR(191),
    `v5` VARCHAR(191),

    CONSTRAINT `casbin_rule_pkey` PRIMARY KEY (`id`)
);

-- CreateTable
CREATE TABLE `sys_domain` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191),
    `status` VARCHAR(32) NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(191) NOT NULL,
    `updated_at` TIMESTAMP(3),
    `updated_by` VARCHAR(191),

    CONSTRAINT `sys_domain_pkey` PRIMARY KEY (`id`)
);

-- CreateTable
CREATE TABLE `sys_role` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191),
    `pid` VARCHAR(191) NOT NULL DEFAULT '0',
    `status` VARCHAR(32) NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(191) NOT NULL,
    `updated_at` TIMESTAMP(3),
    `updated_by` VARCHAR(191),

    CONSTRAINT `sys_role_pkey` PRIMARY KEY (`id`)
);

-- CreateTable
CREATE TABLE `sys_user_role` (
    `user_id` VARCHAR(191) NOT NULL,
    `role_id` VARCHAR(191) NOT NULL,

    CONSTRAINT `sys_user_role_pkey` PRIMARY KEY (`user_id`,`role_id`)
);

-- CreateTable
CREATE TABLE `sys_endpoint` (
    `id` VARCHAR(191) NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `resource` VARCHAR(191) NOT NULL,
    `controller` VARCHAR(191) NOT NULL,
    `summary` VARCHAR(191),
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` TIMESTAMP(3),

    CONSTRAINT `sys_endpoint_pkey` PRIMARY KEY (`id`)
);

-- CreateTable
CREATE TABLE `sys_organization` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191),
    `pid` VARCHAR(191) NOT NULL DEFAULT '0',
    `status` VARCHAR(32) NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(191) NOT NULL,
    `updated_at` TIMESTAMP(3),
    `updated_by` VARCHAR(191),

    CONSTRAINT `sys_organization_pkey` PRIMARY KEY (`id`)
);

-- CreateTable
CREATE TABLE `sys_login_log` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `login_time` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(191) NOT NULL,
    `port` INTEGER,
    `address` VARCHAR(191) NOT NULL,
    `user_agent` VARCHAR(191) NOT NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(191) NOT NULL,

    CONSTRAINT `sys_login_log_pkey` PRIMARY KEY (`id`)
);

-- CreateTable
CREATE TABLE `sys_operation_log` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `module_name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(191) NOT NULL,
    `user_agent` VARCHAR(191),
    `params` JSON,
    `body` JSON,
    `response` JSON,
    `start_time` TIMESTAMP(3) NOT NULL,
    `end_time` TIMESTAMP(3) NOT NULL,
    `duration` INTEGER NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT `sys_operation_log_pkey` PRIMARY KEY (`id`)
);

-- CreateTable
CREATE TABLE `sys_menu` (
    `id` INT AUTO_INCREMENT NOT NULL,
    `menu_type` VARCHAR(32) NOT NULL,
    `menu_name` VARCHAR(64) NOT NULL,
    `icon_type` INTEGER DEFAULT 1,
    `icon` VARCHAR(64),
    `route_name` VARCHAR(64) NOT NULL,
    `route_path` VARCHAR(128) NOT NULL,
    `component` VARCHAR(64) NOT NULL,
    `path_param` VARCHAR(64),
    `status` VARCHAR(32) NOT NULL,
    `active_menu` VARCHAR(64),
    `hide_in_menu` BOOLEAN DEFAULT false,
    `pid` INTEGER NOT NULL DEFAULT 0,
    `sequence` INTEGER NOT NULL,
    `i18n_key` VARCHAR(64),
    `keep_alive` BOOLEAN DEFAULT false,
    `constant` BOOLEAN NOT NULL DEFAULT false,
    `href` VARCHAR(64),
    `multi_tab` BOOLEAN DEFAULT false,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(191) NOT NULL,
    `updated_at` TIMESTAMP(3),
    `updated_by` VARCHAR(191),

    CONSTRAINT `sys_menu_pkey` PRIMARY KEY (`id`)
);

-- CreateTable
CREATE TABLE `sys_role_menu` (
    `role_id` VARCHAR(191) NOT NULL,
    `menu_id` INTEGER NOT NULL,
    `domain` VARCHAR(191) NOT NULL,

    CONSTRAINT `sys_role_menu_pkey` PRIMARY KEY (`role_id`,`menu_id`,`domain`)
);

-- CreateIndex
CREATE UNIQUE INDEX `sys_user_username_key` ON `sys_user`(`username`);

-- CreateIndex
CREATE UNIQUE INDEX `sys_user_email_key` ON `sys_user`(`email`);

-- CreateIndex
CREATE UNIQUE INDEX `sys_user_phone_number_key` ON `sys_user`(`phone_number`);

-- CreateIndex
CREATE UNIQUE INDEX `sys_domain_code_key` ON `sys_domain`(`code`);

-- CreateIndex
CREATE UNIQUE INDEX `sys_role_code_key` ON `sys_role`(`code`);

-- CreateIndex
CREATE UNIQUE INDEX `sys_organization_code_key` ON `sys_organization`(`code`);

-- CreateIndex
CREATE UNIQUE INDEX `sys_menu_route_name_key` ON `sys_menu`(`route_name`);

-- Source migration: 0_migration
-- CreateTable
CREATE TABLE `sys_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `access_token` VARCHAR(191) NOT NULL,
    `refresh_token` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `login_time` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(191) NOT NULL,
    `port` INTEGER,
    `address` VARCHAR(191) NOT NULL,
    `user_agent` VARCHAR(191) NOT NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(191) NOT NULL,

    CONSTRAINT `sys_tokens_pkey` PRIMARY KEY (`id`)
);

-- Source migration: 1_migration
DROP TABLE IF EXISTS `sys_tokens`;

-- CreateTable
CREATE TABLE `sys_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `access_token` VARCHAR(191) NOT NULL,
    `refresh_token` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `login_time` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(191) NOT NULL,
    `port` INTEGER,
    `address` VARCHAR(191) NOT NULL,
    `user_agent` VARCHAR(191) NOT NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(191) NOT NULL,

    CONSTRAINT `sys_tokens_pkey` PRIMARY KEY (`id`)
);

-- Source migration: 20240902161339_migration
-- CreateTable
CREATE TABLE `sys_access_key` (
    `id` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `access_key_id` VARCHAR(191) NOT NULL,
    `access_key_secret` VARCHAR(191) NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `description` VARCHAR(191),
    `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(191) NOT NULL,

    CONSTRAINT `sys_access_key_pkey` PRIMARY KEY (`id`)
);

-- CreateIndex
CREATE UNIQUE INDEX `sys_access_key_access_key_id_key` ON `sys_access_key`(`access_key_id`);

-- CreateIndex
CREATE UNIQUE INDEX `sys_access_key_access_key_secret_key` ON `sys_access_key`(`access_key_secret`);

-- Source migration: 202610300001_epay_core
-- P1 core domain tables. Secrets are deliberately represented by credential_ref only.
CREATE TABLE `epay_site` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `base_url` VARCHAR(191) NOT NULL,
  `table_prefix` VARCHAR(191),
  `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Shanghai',
  `db_host` VARCHAR(191) NOT NULL,
  `db_port` INTEGER NOT NULL DEFAULT 3306,
  `db_name` VARCHAR(191) NOT NULL,
  `db_user` VARCHAR(191) NOT NULL,
  `credential_ref` VARCHAR(191) NOT NULL,
  `connection_status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  `structure_status` VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
  `structure_report` JSON,
  `adapter_version` VARCHAR(191),
  `agent_version` VARCHAR(191),
  `last_heartbeat_at` TIMESTAMP(3),
  `last_sync_at` TIMESTAMP(3),
  `last_error` VARCHAR(191),
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by` VARCHAR(191) NOT NULL,
  `updated_at` TIMESTAMP(3),
  `updated_by` VARCHAR(191),
  CONSTRAINT `epay_site_pkey` PRIMARY KEY (`id`)
);
CREATE INDEX `epay_site_connection_status_idx` ON `epay_site`(`connection_status`);

CREATE TABLE `epay_channel` (
  `id` VARCHAR(191) NOT NULL,
  `site_id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `channel_type` VARCHAR(191),
  `status` VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
  `current_weight` INTEGER NOT NULL DEFAULT 0,
  `source_version` VARCHAR(191),
  `updated_at` TIMESTAMP(3),
  CONSTRAINT `epay_channel_pkey` PRIMARY KEY (`id`)
);
CREATE UNIQUE INDEX `epay_channel_site_id_code_key` ON `epay_channel`(`site_id`, `code`);
CREATE INDEX `epay_channel_site_id_status_idx` ON `epay_channel`(`site_id`, `status`);
ALTER TABLE `epay_channel` ADD CONSTRAINT `epay_channel_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `epay_site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `epay_polling_group` (
  `id` VARCHAR(191) NOT NULL,
  `site_id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
  `source_version` VARCHAR(191),
  CONSTRAINT `epay_polling_group_pkey` PRIMARY KEY (`id`)
);
CREATE UNIQUE INDEX `epay_polling_group_site_id_code_key` ON `epay_polling_group`(`site_id`, `code`);
ALTER TABLE `epay_polling_group` ADD CONSTRAINT `epay_polling_group_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `epay_site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `epay_polling_member` (
  `group_id` VARCHAR(191) NOT NULL,
  `channel_id` VARCHAR(191) NOT NULL,
  `weight` INTEGER NOT NULL DEFAULT 0,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT `epay_polling_member_pkey` PRIMARY KEY (`group_id`, `channel_id`)
);
ALTER TABLE `epay_polling_member` ADD CONSTRAINT `epay_polling_member_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `epay_polling_group`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `epay_polling_member` ADD CONSTRAINT `epay_polling_member_channel_id_fkey` FOREIGN KEY (`channel_id`) REFERENCES `epay_channel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `epay_order` (
  `id` VARCHAR(191) NOT NULL,
  `site_id` VARCHAR(191) NOT NULL,
  `external_id` VARCHAR(191) NOT NULL,
  `channel_code` VARCHAR(191),
  `amount` DECIMAL(18,2) NOT NULL,
  `source_status` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `paid_at` TIMESTAMP(3),
  `occurred_at` TIMESTAMP(3) NOT NULL,
  `source_version` VARCHAR(191),
  CONSTRAINT `epay_order_pkey` PRIMARY KEY (`id`)
);
CREATE UNIQUE INDEX `epay_order_site_id_external_id_key` ON `epay_order`(`site_id`, `external_id`);
CREATE INDEX `epay_order_site_id_status_occurred_at_idx` ON `epay_order`(`site_id`, `status`, `occurred_at`);
ALTER TABLE `epay_order` ADD CONSTRAINT `epay_order_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `epay_site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `epay_site_metric` (
  `id` VARCHAR(191) NOT NULL,
  `site_id` VARCHAR(191) NOT NULL,
  `window_start` TIMESTAMP(3) NOT NULL,
  `window_end` TIMESTAMP(3) NOT NULL,
  `order_count` INTEGER NOT NULL,
  `success_count` INTEGER NOT NULL,
  `failed_count` INTEGER NOT NULL,
  `success_rate` DECIMAL(7,4) NOT NULL,
  `failure_rate` DECIMAL(7,4) NOT NULL,
  `calculated_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `mapping_version` VARCHAR(191) NOT NULL,
  CONSTRAINT `epay_site_metric_pkey` PRIMARY KEY (`id`)
);
CREATE INDEX `epay_site_metric_site_id_window_end_idx` ON `epay_site_metric`(`site_id`, `window_end`);
ALTER TABLE `epay_site_metric` ADD CONSTRAINT `epay_site_metric_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `epay_site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `strategy_group` (
  `id` VARCHAR(191) NOT NULL,
  `site_id` VARCHAR(191),
  `name` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191),
  `execution_order` INTEGER NOT NULL DEFAULT 0,
  `status` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  `current_version` INTEGER NOT NULL DEFAULT 1,
  `last_run_at` TIMESTAMP(3),
  CONSTRAINT `strategy_group_pkey` PRIMARY KEY (`id`)
);
CREATE INDEX `strategy_group_site_id_status_idx` ON `strategy_group`(`site_id`, `status`);
ALTER TABLE `strategy_group` ADD CONSTRAINT `strategy_group_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `epay_site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `strategy` (
  `id` VARCHAR(191) NOT NULL,
  `group_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `condition` JSON NOT NULL,
  `scope` JSON NOT NULL,
  `action` JSON NOT NULL,
  `schedule` VARCHAR(191),
  `priority` INTEGER NOT NULL DEFAULT 0,
  `status` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  `last_triggered_at` TIMESTAMP(3),
  CONSTRAINT `strategy_pkey` PRIMARY KEY (`id`)
);
CREATE INDEX `strategy_group_id_status_priority_idx` ON `strategy`(`group_id`, `status`, `priority`);
ALTER TABLE `strategy` ADD CONSTRAINT `strategy_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `strategy_group`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE `adjustment_record` (
  `id` VARCHAR(191) NOT NULL,
  `site_id` VARCHAR(191) NOT NULL,
  `strategy_id` VARCHAR(191),
  `action` VARCHAR(191) NOT NULL,
  `target` JSON NOT NULL,
  `before_state` JSON,
  `desired_state` JSON,
  `actual_state` JSON,
  `status` VARCHAR(191) NOT NULL,
  `failure_reason` VARCHAR(191),
  `idempotency_key` VARCHAR(191) NOT NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` TIMESTAMP(3),
  CONSTRAINT `adjustment_record_pkey` PRIMARY KEY (`id`)
);
CREATE UNIQUE INDEX `adjustment_record_idempotency_key_key` ON `adjustment_record`(`idempotency_key`);
CREATE INDEX `adjustment_record_site_id_created_at_idx` ON `adjustment_record`(`site_id`, `created_at`);
ALTER TABLE `adjustment_record` ADD CONSTRAINT `adjustment_record_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `epay_site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Source migration: 202610300002_site_credentials
ALTER TABLE `epay_site`
ADD COLUMN `db_password_encrypted` VARCHAR(191),
ADD COLUMN `agent_token_encrypted` VARCHAR(191);

-- Source migration: 202610300003_site_data
-- Additive site data synchronization schema; preserve existing IAM and site records.
ALTER TABLE `epay_site` ADD COLUMN `sync_revision` INTEGER NOT NULL DEFAULT 1, ADD COLUMN `active_sync_id` VARCHAR(191);
ALTER TABLE `epay_channel` ADD COLUMN `plugin` VARCHAR(191), ADD COLUMN `payment_type_id` VARCHAR(191),
 ADD COLUMN `source_status` INTEGER NOT NULL DEFAULT 0, ADD COLUMN `day_status` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `epay_polling_group` ADD COLUMN `kind` INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN `position` INTEGER NOT NULL DEFAULT 0, ADD COLUMN `payment_type_id` VARCHAR(191),
 ADD COLUMN `payment_type_name` VARCHAR(191), ADD COLUMN `updated_at` TIMESTAMP(3);
ALTER TABLE `epay_polling_member` ADD COLUMN `position` INTEGER NOT NULL DEFAULT 0;
CREATE TABLE `epay_sync_run` (
 `id` VARCHAR(191) NOT NULL PRIMARY KEY, `site_id` VARCHAR(191) NOT NULL, `revision` INTEGER NOT NULL,
 `status` VARCHAR(191) NOT NULL DEFAULT 'RUNNING', `window_start` TIMESTAMP(3) NOT NULL,
 `window_end` TIMESTAMP(3) NOT NULL, `mapping_version` VARCHAR(191) NOT NULL, `metadata` JSON NOT NULL,
 `pages` JSON NOT NULL DEFAULT (JSON_ARRAY()), `order_count` INTEGER NOT NULL DEFAULT 0,
 `expected_count` INTEGER NOT NULL, `error` VARCHAR(191), `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `completed_at` TIMESTAMP(3), CONSTRAINT `epay_sync_run_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `epay_site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE `epay_order` ADD COLUMN `sync_run_id` VARCHAR(191), ADD COLUMN `merchant_id` VARCHAR(191),
 ADD COLUMN `payment_type_id` VARCHAR(191), ADD COLUMN `payment_type_name` VARCHAR(191),
 ADD COLUMN `subchannel_code` VARCHAR(191), ADD COLUMN `real_amount` DECIMAL(18,2);
ALTER TABLE `epay_order` ADD CONSTRAINT `epay_order_sync_run_id_fkey` FOREIGN KEY (`sync_run_id`) REFERENCES `epay_sync_run`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX `epay_order_site_id_external_id_key` ON `epay_order`;
CREATE UNIQUE INDEX `epay_order_sync_run_id_external_id_key` ON `epay_order`(`sync_run_id`, `external_id`);
CREATE INDEX `epay_order_site_id_sync_run_id_occurred_at_idx` ON `epay_order`(`site_id`, `sync_run_id`, `occurred_at`);
CREATE INDEX `epay_sync_run_site_id_created_at_idx` ON `epay_sync_run`(`site_id`, `created_at`);

-- Source migration: 202610300004_site_navigation
-- Preserve existing menu IDs and role grants; old URLs remain as hidden redirects.
UPDATE sys_menu
SET hide_in_menu = true, active_menu = 'site-management_data'
WHERE route_name IN (
  'site-management_channels',
  'site-management_polling-groups',
  'site-management_orders'
);

-- Source migration: 202610300005_strategy_control
-- P4 strategy execution and site-agent control queue.
ALTER TABLE `epay_site` ADD COLUMN `automation_paused` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `adjustment_record`
  ADD COLUMN `strategy_version` INTEGER,
  ADD COLUMN `target_version` VARCHAR(191),
  ADD COLUMN `expires_at` TIMESTAMP(3);
CREATE INDEX `adjustment_record_site_id_status_created_at_idx`
  ON `adjustment_record`(`site_id`, `status`, `created_at`);

-- Source migration: 202610300007_account_collectors
-- P6 script collectors, account health and site-channel bindings.
CREATE TABLE `collector` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `token_encrypted` VARCHAR(191),
  `status` VARCHAR(32) NOT NULL DEFAULT 'OFFLINE',
  `version` VARCHAR(191),
  `last_heartbeat_at` TIMESTAMP(3),
  `last_error` VARCHAR(191),
  `metadata` JSON,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3),
  CONSTRAINT `collector_pkey` PRIMARY KEY (`id`)
);
CREATE INDEX `collector_status_last_heartbeat_at_idx` ON `collector`(`status`, `last_heartbeat_at`);

CREATE TABLE `account` (
  `id` VARCHAR(191) NOT NULL,
  `collector_id` VARCHAR(191),
  `external_id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191),
  `status` VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
  `browser_state` VARCHAR(191),
  `last_seen_at` TIMESTAMP(3),
  `last_error` VARCHAR(191),
  `metadata` JSON,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3),
  CONSTRAINT `account_pkey` PRIMARY KEY (`id`)
);
CREATE UNIQUE INDEX `account_collector_id_external_id_key` ON `account`(`collector_id`, `external_id`);
CREATE INDEX `account_status_last_seen_at_idx` ON `account`(`status`, `last_seen_at`);
ALTER TABLE `account` ADD CONSTRAINT `account_collector_id_fkey` FOREIGN KEY (`collector_id`) REFERENCES `collector`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `account_binding` (
  `id` VARCHAR(191) NOT NULL,
  `account_id` VARCHAR(191) NOT NULL,
  `site_id` VARCHAR(191) NOT NULL,
  `channel_code` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3),
  CONSTRAINT `account_binding_pkey` PRIMARY KEY (`id`)
);
CREATE UNIQUE INDEX `account_binding_account_id_site_id_channel_code_key` ON `account_binding`(`account_id`, `site_id`, `channel_code`);
CREATE INDEX `account_binding_site_id_channel_code_enabled_idx` ON `account_binding`(`site_id`, `channel_code`, `enabled`);
ALTER TABLE `account_binding` ADD CONSTRAINT `account_binding_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `account_binding` ADD CONSTRAINT `account_binding_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `epay_site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Source migration: 202610300010_strategy_versions
-- P7 strategy version snapshots and effective windows.
ALTER TABLE `strategy`
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `effective_from` TIMESTAMP(3),
  ADD COLUMN `effective_to` TIMESTAMP(3);

CREATE TABLE `strategy_version` (
  `id` VARCHAR(191) NOT NULL,
  `strategy_id` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `condition` JSON NOT NULL,
  `scope` JSON NOT NULL,
  `action` JSON NOT NULL,
  `schedule` VARCHAR(191),
  `priority` INTEGER NOT NULL,
  `effective_from` TIMESTAMP(3),
  `effective_to` TIMESTAMP(3),
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `strategy_version_pkey` PRIMARY KEY (`id`)
);
CREATE UNIQUE INDEX `strategy_version_strategy_id_version_key` ON `strategy_version`(`strategy_id`, `version`);
CREATE INDEX `strategy_version_strategy_id_created_at_idx` ON `strategy_version`(`strategy_id`, `created_at`);
ALTER TABLE `strategy_version` ADD CONSTRAINT `strategy_version_strategy_id_fkey` FOREIGN KEY (`strategy_id`) REFERENCES `strategy`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Source migration: 202610300011_fund_accounts
CREATE TABLE IF NOT EXISTS `fund_account` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `owner` VARCHAR(191) NOT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'CNY',
  `balance` DECIMAL(20,2) NOT NULL DEFAULT 0,
  `frozen` DECIMAL(20,2) NOT NULL DEFAULT 0,
  `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL,
  CONSTRAINT `fund_account_pkey` PRIMARY KEY (`id`)
);
CREATE INDEX `fund_account_status_currency_idx` ON `fund_account`(`status`, `currency`);

-- Source migration: 202610300012_payment_requests
CREATE TABLE IF NOT EXISTS `payment_request` (
  `id` VARCHAR(191) NOT NULL,
  `fund_account_id` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(20,2) NOT NULL,
  `currency` VARCHAR(191) NOT NULL,
  `payee` VARCHAR(191) NOT NULL,
  `purpose` VARCHAR(191) NOT NULL,
  `requester` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL,
  CONSTRAINT `payment_request_pkey` PRIMARY KEY (`id`),
  CONSTRAINT `payment_request_fund_account_id_fkey` FOREIGN KEY (`fund_account_id`) REFERENCES `fund_account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX `payment_request_status_created_at_idx` ON `payment_request`(`status`, `created_at`);

-- Source migration: 202610300013_settlement_records
CREATE TABLE IF NOT EXISTS `settlement_record` (
  `id` VARCHAR(191) NOT NULL,
  `fund_account_id` VARCHAR(191) NOT NULL,
  `period_start` TIMESTAMP(3) NOT NULL,
  `period_end` TIMESTAMP(3) NOT NULL,
  `amount` DECIMAL(20,2) NOT NULL,
  `fee` DECIMAL(20,2) NOT NULL DEFAULT 0,
  `currency` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `note` VARCHAR(191),
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` TIMESTAMP(3) NOT NULL,
  CONSTRAINT `settlement_record_pkey` PRIMARY KEY (`id`),
  CONSTRAINT `settlement_record_fund_account_id_fkey` FOREIGN KEY (`fund_account_id`) REFERENCES `fund_account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX `settlement_record_status_period_end_idx` ON `settlement_record`(`status`, `period_end`);

-- Source migration: 202610300014_strategy_group_bindings
CREATE TABLE IF NOT EXISTS `strategy_group_binding` (
  `id` VARCHAR(191) NOT NULL,
  `group_id` VARCHAR(191) NOT NULL,
  `site_id` VARCHAR(191) NOT NULL,
  `polling_group_code` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `strategy_group_binding_pkey` PRIMARY KEY (`id`),
  CONSTRAINT `strategy_group_binding_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `strategy_group`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `strategy_group_binding_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `epay_site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX `strategy_group_binding_group_site_polling_key` ON `strategy_group_binding`(`group_id`, `site_id`, `polling_group_code`);
CREATE INDEX `strategy_group_binding_site_polling_enabled_idx` ON `strategy_group_binding`(`site_id`, `polling_group_code`, `enabled`);

-- Source migration: 202610300006_strategy_permissions
INSERT INTO `casbin_rule` (`ptype`, `v0`, `v1`, `v2`, `v3`) VALUES
  ('p', 'ROLE_SUPER', 'strategy', 'read', 'built-in'), ('p', 'ROLE_SUPER', 'strategy', 'create', 'built-in'), ('p', 'ROLE_SUPER', 'strategy', 'update', 'built-in'), ('p', 'ROLE_SUPER', 'adjustment', 'read', 'built-in'),
  ('p', 'ROLE_ADMIN', 'strategy', 'read', 'built-in'), ('p', 'ROLE_ADMIN', 'strategy', 'create', 'built-in'), ('p', 'ROLE_ADMIN', 'strategy', 'update', 'built-in'), ('p', 'ROLE_ADMIN', 'adjustment', 'read', 'built-in');

-- Source migration: 202610300008_account_permissions
INSERT INTO `casbin_rule` (`ptype`, `v0`, `v1`, `v2`, `v3`) VALUES
  ('p', 'ROLE_SUPER', 'collector', 'read', 'built-in'), ('p', 'ROLE_SUPER', 'collector', 'create', 'built-in'), ('p', 'ROLE_SUPER', 'account', 'read', 'built-in'), ('p', 'ROLE_SUPER', 'account-binding', 'read', 'built-in'), ('p', 'ROLE_SUPER', 'account-binding', 'create', 'built-in'), ('p', 'ROLE_SUPER', 'account-binding', 'update', 'built-in'), ('p', 'ROLE_SUPER', 'account-binding', 'delete', 'built-in'),
  ('p', 'ROLE_ADMIN', 'collector', 'read', 'built-in'), ('p', 'ROLE_ADMIN', 'collector', 'create', 'built-in'), ('p', 'ROLE_ADMIN', 'account', 'read', 'built-in'), ('p', 'ROLE_ADMIN', 'account-binding', 'read', 'built-in'), ('p', 'ROLE_ADMIN', 'account-binding', 'create', 'built-in'), ('p', 'ROLE_ADMIN', 'account-binding', 'update', 'built-in'), ('p', 'ROLE_ADMIN', 'account-binding', 'delete', 'built-in');

-- Source migration: 202610300009_collector_delete_permission
INSERT INTO `casbin_rule` (`ptype`, `v0`, `v1`, `v2`, `v3`) VALUES ('p', 'ROLE_SUPER', 'collector', 'delete', 'built-in'), ('p', 'ROLE_ADMIN', 'collector', 'delete', 'built-in');

