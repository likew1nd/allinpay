-- 转账策略的 TG 结果通知改为固定发送：删除策略和转账单上的通知开关列
ALTER TABLE `transfer_rule` DROP COLUMN `notify_enabled`;
ALTER TABLE `transfer_request` DROP COLUMN `notify_enabled`;
