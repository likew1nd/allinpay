UPDATE `strategy_template` SET `name` = TRIM(`name`);
CREATE UNIQUE INDEX `strategy_template_name_key` ON `strategy_template`(`name`);
ALTER TABLE `strategy_target` ADD COLUMN `is_claim` BOOLEAN NOT NULL DEFAULT false;
