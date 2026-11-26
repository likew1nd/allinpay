CREATE TABLE `strategy_template` (
  `id` VARCHAR(191) NOT NULL, `name` VARCHAR(191) NOT NULL, `description` VARCHAR(500) NULL,
  `control_type` VARCHAR(191) NOT NULL, `window_minutes` INTEGER NOT NULL DEFAULT 10,
  `min_samples` INTEGER NOT NULL DEFAULT 30, `cooldown_seconds` INTEGER NOT NULL DEFAULT 300,
  `min_weight` INTEGER NOT NULL DEFAULT 1, `max_weight` INTEGER NOT NULL DEFAULT 100,
  `rules` JSON NOT NULL, `version` INTEGER NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `strategy_group` ADD COLUMN `template_id` VARCHAR(191) NULL;
ALTER TABLE `strategy_group` MODIFY COLUMN `description` VARCHAR(500) NULL;
ALTER TABLE `strategy_group` ADD CONSTRAINT `strategy_group_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `strategy_template`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `strategy_target` (
  `id` VARCHAR(191) NOT NULL, `group_id` VARCHAR(191) NOT NULL, `site_id` VARCHAR(191) NOT NULL,
  `control_type` VARCHAR(191) NOT NULL, `polling_group_code` VARCHAR(191) NOT NULL DEFAULT '',
  `channel_code` VARCHAR(191) NOT NULL, `last_triggered_at` DATETIME(3) NULL,
  `last_evaluated_at` DATETIME(3) NULL, `last_reason` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `strategy_target_owner_key` (`site_id`, `control_type`, `polling_group_code`, `channel_code`),
  INDEX `strategy_target_group_id_idx` (`group_id`),
  CONSTRAINT `strategy_target_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `strategy_group`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `strategy_target_site_id_fkey` FOREIGN KEY (`site_id`) REFERENCES `epay_site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `adjustment_record`
  ADD COLUMN `strategy_group_id` VARCHAR(191) NULL,
  ADD COLUMN `binding_id` VARCHAR(191) NULL,
  ADD COLUMN `group_version` INTEGER NULL,
  ADD COLUMN `rule_name` VARCHAR(191) NULL;

-- Preserve legacy rules for reference; require explicit template/object configuration.
UPDATE `strategy_group` SET `status` = 'PAUSED' WHERE `template_id` IS NULL;
UPDATE `strategy` SET `status` = 'PAUSED';
UPDATE `adjustment_record` SET `status` = 'SKIPPED', `failure_reason` = 'LEGACY_STRATEGY_REQUIRES_TEMPLATE', `completed_at` = CURRENT_TIMESTAMP(3) WHERE `status` = 'PENDING';
UPDATE `sys_menu` SET `hide_in_menu` = true, `active_menu` = 'strategy-center_templates' WHERE `route_name` = 'strategy-center_strategies';
