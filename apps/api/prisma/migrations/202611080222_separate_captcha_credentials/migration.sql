-- 为每个打码平台分别保存凭据，兼容已有数据
-- 1. 添加新字段
ALTER TABLE `script_setting`
  ADD COLUMN `ttshitu_username` VARCHAR(191) NOT NULL DEFAULT '' AFTER `captcha_provider`,
  ADD COLUMN `ttshitu_password_encrypted` TEXT NULL AFTER `ttshitu_username`,
  ADD COLUMN `bingtop_username` VARCHAR(191) NOT NULL DEFAULT '' AFTER `ttshitu_password_encrypted`,
  ADD COLUMN `bingtop_password_encrypted` TEXT NULL AFTER `bingtop_username`;

-- 2. 迁移已有数据：将 captcha_username/captcha_password_encrypted 迁移到对应平台
UPDATE `script_setting`
SET
  `ttshitu_username` = `captcha_username`,
  `ttshitu_password_encrypted` = `captcha_password_encrypted`
WHERE `captcha_provider` = 'TTSHITU';

UPDATE `script_setting`
SET
  `bingtop_username` = `captcha_username`,
  `bingtop_password_encrypted` = `captcha_password_encrypted`
WHERE `captcha_provider` = 'BINGTOP';

-- 3. 删除旧字段
ALTER TABLE `script_setting`
  DROP COLUMN `captcha_username`,
  DROP COLUMN `captcha_password_encrypted`;
