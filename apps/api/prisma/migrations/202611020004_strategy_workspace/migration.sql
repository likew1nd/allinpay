ALTER TABLE `strategy_group` ADD COLUMN `configuration` JSON NULL;
UPDATE `strategy_group` g JOIN `strategy_template` t ON t.id = g.template_id
SET g.configuration = JSON_OBJECT(
  'controlType', t.control_type, 'windowMinutes', t.window_minutes,
  'minSamples', t.min_samples, 'cooldownSeconds', t.cooldown_seconds,
  'minWeight', t.min_weight, 'maxWeight', t.max_weight, 'rules', t.rules
);
ALTER TABLE `strategy_group` DROP FOREIGN KEY `strategy_group_template_id_fkey`;
ALTER TABLE `strategy_group` ADD CONSTRAINT `strategy_group_template_id_fkey`
FOREIGN KEY (`template_id`) REFERENCES `strategy_template`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE `sys_menu` SET `menu_name` = '策略配置' WHERE `route_name` = 'strategy-center_groups';
UPDATE `sys_menu` SET `hide_in_menu` = true, `active_menu` = 'strategy-center_groups'
WHERE `route_name` IN ('strategy-center_templates', 'strategy-center_strategies');
