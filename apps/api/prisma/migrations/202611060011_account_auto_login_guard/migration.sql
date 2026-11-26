ALTER TABLE `account_credentials`
  ADD COLUMN `login_attempt_after` DATETIME(3) NULL,
  ADD COLUMN `login_blocked` BOOLEAN NOT NULL DEFAULT false;
