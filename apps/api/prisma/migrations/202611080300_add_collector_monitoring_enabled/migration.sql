-- 采集端级监控开关，关闭后中心不再向该采集端派发巡检任务
ALTER TABLE `collector` ADD COLUMN `monitoring_enabled` BOOLEAN NOT NULL DEFAULT true;
