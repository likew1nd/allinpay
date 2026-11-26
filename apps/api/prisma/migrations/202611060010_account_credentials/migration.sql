-- 手填凭据独立存储，普通账号查询不携带密码密文。
CREATE TABLE account_credentials (
  account_id VARCHAR(191) NOT NULL,
  login_account VARCHAR(191) NOT NULL DEFAULT '',
  app_id VARCHAR(191) NOT NULL DEFAULT '',
  password_encrypted TEXT NULL,
  PRIMARY KEY (account_id),
  CONSTRAINT account_credentials_account_id_fkey FOREIGN KEY (account_id) REFERENCES account (id) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;