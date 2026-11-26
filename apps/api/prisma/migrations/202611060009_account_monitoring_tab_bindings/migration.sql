-- 持久保存两个用途的标签绑定，登录跳转后继续复用同一标签。
ALTER TABLE `account` ADD COLUMN `monitoring_tab_bindings` JSON NULL;