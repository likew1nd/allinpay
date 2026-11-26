-- 355 环境扫码确认：转账单记录失败原因代码（QR_TIMEOUT），TG 投递支持图片消息
ALTER TABLE `transfer_request` ADD COLUMN `failure_code` VARCHAR(32) NULL;
ALTER TABLE `telegram_delivery` ADD COLUMN `image` MEDIUMTEXT NULL;
