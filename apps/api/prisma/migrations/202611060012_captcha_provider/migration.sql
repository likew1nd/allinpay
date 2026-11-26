ALTER TABLE `script_setting`
  ADD COLUMN `captcha_provider` VARCHAR(32) NOT NULL DEFAULT 'NONE',
  ADD COLUMN `captcha_username` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `captcha_password_encrypted` TEXT NULL;

ALTER TABLE `account_credentials`
  ADD COLUMN `captcha_image_hash` VARCHAR(64) NULL,
  ADD COLUMN `captcha_attempt_after` DATETIME(3) NULL;
