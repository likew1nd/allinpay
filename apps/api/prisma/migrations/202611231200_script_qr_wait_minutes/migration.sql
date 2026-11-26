-- 脚本设置新增扫码确认等待时长（分钟），默认 8
ALTER TABLE `script_setting` ADD COLUMN `qr_wait_minutes` INT NOT NULL DEFAULT 8;
