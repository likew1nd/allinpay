-- 每个账号保留最近 200 条巡检事件，不混入人工操作审计。
ALTER TABLE `account` ADD COLUMN `monitoring_logs` JSON NULL;
