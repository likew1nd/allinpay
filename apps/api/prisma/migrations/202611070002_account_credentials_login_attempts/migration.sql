ALTER TABLE `account_credentials`
  ADD COLUMN `login_attempts` INTEGER NOT NULL DEFAULT 0;
