-- 新增登录等待超时配置字段，默认 3 分钟
ALTER TABLE `script_setting` ADD COLUMN `login_timeout_minutes` INT NOT NULL DEFAULT 3;
