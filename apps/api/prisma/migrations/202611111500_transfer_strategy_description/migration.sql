-- 名称和说明先创建，之后配置规则；已有策略说明默认为空。
ALTER TABLE `transfer_rule` ADD COLUMN `description` VARCHAR(500) NOT NULL DEFAULT '';
