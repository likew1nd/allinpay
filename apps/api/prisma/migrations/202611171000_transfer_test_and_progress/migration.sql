-- 转账测试单：手动发起、不属于任何策略也不关联收款人库，收款信息随单保存；同时记录采集端的进度心跳。
ALTER TABLE transfer_request
  MODIFY rule_id VARCHAR(191) NULL,
  MODIFY rule_version INT NULL,
  MODIFY payee_id VARCHAR(191) NULL,
  ADD test_payee_name VARCHAR(100) NULL,
  ADD test_payee_account_encrypted TEXT NULL,
  ADD test_remark VARCHAR(20) NULL,
  ADD progress_at DATETIME(3) NULL,
  ADD progress_note VARCHAR(200) NULL;

-- 转账测试权限只给超级管理员：它会真实付款
INSERT INTO casbin_rule (ptype, v0, v1, v2, v3)
SELECT 'p', 'ROLE_SUPER', 'transfer-request', 'test', 'built-in' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM casbin_rule WHERE ptype = 'p' AND v0 = 'ROLE_SUPER' AND v1 = 'transfer-request' AND v2 = 'test');
