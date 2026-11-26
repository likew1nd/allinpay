-- 新增环境监控开关字段，默认关闭，新同步进来的环境不自动监控
ALTER TABLE `account` ADD COLUMN `monitoring_enabled` TINYINT(1) NOT NULL DEFAULT 0;
