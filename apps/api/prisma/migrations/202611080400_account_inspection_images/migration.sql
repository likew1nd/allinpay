-- 登录后巡检：账号限制截图与司法限制截图（图片本身仅在查看时单独读取）
ALTER TABLE `account`
  ADD COLUMN `restriction_image` MEDIUMTEXT NULL,
  ADD COLUMN `restriction_image_at` DATETIME(3) NULL,
  ADD COLUMN `judicial_image` MEDIUMTEXT NULL,
  ADD COLUMN `judicial_image_at` DATETIME(3) NULL;
