-- 旧策略保留原金额阈值和分配，读取时转换为单条规则。
ALTER TABLE `transfer_rule` ADD COLUMN `rules` JSON NULL;
