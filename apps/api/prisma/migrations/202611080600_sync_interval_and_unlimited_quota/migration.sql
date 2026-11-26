-- 环境同步间隔放入脚本设置（分钟，默认 30）
ALTER TABLE `script_setting` ADD COLUMN `environment_sync_minutes` INT NOT NULL DEFAULT 30;

-- 收款/付款额度显示为“不限额”时的标记
ALTER TABLE `account`
  ADD COLUMN `receipt_unlimited` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `payment_unlimited` BOOLEAN NOT NULL DEFAULT false;
