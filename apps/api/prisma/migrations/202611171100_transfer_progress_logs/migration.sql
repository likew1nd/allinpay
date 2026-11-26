-- 转账执行日志：像监控日志一样保存完整的步骤和事件，供页面查看；只保留最近 300 条。
ALTER TABLE transfer_request ADD progress_logs JSON NULL;
