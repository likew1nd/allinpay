-- 新增滑块补偿距离配置字段，默认 +10 像素
ALTER TABLE `script_setting` ADD COLUMN `slider_offset_px` INT NOT NULL DEFAULT 10;
