-- 环境账号支付密码独立加密保存，旧账号默认未设置。
ALTER TABLE `account_credentials`
  ADD COLUMN `payment_password_encrypted` TEXT NULL;
