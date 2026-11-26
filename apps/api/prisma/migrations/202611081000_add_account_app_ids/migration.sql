ALTER TABLE `script_setting`
  ADD COLUMN `tab3_url` VARCHAR(500) NOT NULL DEFAULT 'https://open.alipay.com/develop/manage';

ALTER TABLE `account`
  ADD COLUMN `app_ids_refresh_requested_at` DATETIME(3) NULL;

ALTER TABLE `account_credentials`
  ADD COLUMN `app_ids` JSON NULL;

UPDATE `account_credentials`
SET `app_ids` = JSON_ARRAY(`app_id`)
WHERE `app_id` <> '';
