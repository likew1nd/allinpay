-- 登录后巡检：账号限制与司法限制各记一个标记，可同时为真
ALTER TABLE `account`
  ADD COLUMN `restriction_active` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `judicial_active` BOOLEAN NOT NULL DEFAULT false;

-- 已有的单值状态回填到标记，避免升级后丢失现有的受限/司法标签
UPDATE `account` SET `restriction_active` = true WHERE `business_status` = 'RESTRICTED';
UPDATE `account` SET `judicial_active` = true WHERE `business_status` = 'JUDICIAL';
