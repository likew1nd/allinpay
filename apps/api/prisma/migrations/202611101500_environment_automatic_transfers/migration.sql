-- 环境直连转账策略；历史资金记录保留，新开关默认关闭。
CREATE TABLE transfer_pool (
  id VARCHAR(191) NOT NULL, name VARCHAR(191) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT true,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE payee ADD pool_id VARCHAR(191) NULL,
  ADD daily_limit DECIMAL(20,2) NULL, ADD total_limit DECIMAL(20,2) NULL,
  ADD CONSTRAINT payee_pool_id_fkey FOREIGN KEY (pool_id) REFERENCES transfer_pool(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE transfer_rule MODIFY fund_account_id VARCHAR(191) NULL, MODIFY payee_id VARCHAR(191) NULL,
  ADD allocations JSON NULL, ADD is_template BOOLEAN NOT NULL DEFAULT false,
  ADD notify_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE account ADD transfer_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD transfer_rule_id VARCHAR(191) NULL, ADD transfer_refresh_required BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT account_transfer_rule_id_fkey FOREIGN KEY (transfer_rule_id) REFERENCES transfer_rule(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE transfer_request MODIFY fund_account_id VARCHAR(191) NULL,
  ADD account_id VARCHAR(191) NULL, ADD batch_id VARCHAR(191) NULL, ADD session_id VARCHAR(191) NULL,
  ADD reserve_snapshot DECIMAL(20,2) NOT NULL DEFAULT 0, ADD notify_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT transfer_request_account_id_fkey FOREIGN KEY (account_id) REFERENCES account(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD INDEX transfer_request_account_id_status_idx(account_id, status), ADD INDEX transfer_request_batch_id_idx(batch_id);

ALTER TABLE telegram_delivery ADD transferRequestId VARCHAR(191) NULL;

-- 只迁移关联与历史展示，绝不把旧任务直接变成新流程的付款任务。
UPDATE transfer_request t JOIN fund_account f ON f.id = t.fund_account_id SET t.account_id = f.account_id;
UPDATE transfer_rule SET enabled = false,
  allocations = JSON_ARRAY(JSON_OBJECT('kind', 'PAYEE', 'targetId', payee_id, 'basisPoints', 10000)) WHERE payee_id IS NOT NULL;
UPDATE transfer_request SET status = 'CANCELLED', completed_at = NOW(3), result_note = '已切换环境自动转账，请在环境列表重新开启并选择策略'
WHERE status IN ('READY', 'PENDING_CONFIRM');
UPDATE transfer_request SET status = 'UNKNOWN', result_note = '旧执行任务，请核对真实结果后处理' WHERE status = 'CLAIMED';

DELETE rm FROM sys_role_menu rm JOIN sys_menu m ON m.id = rm.menu_id WHERE m.route_name = 'fund-management_payment-approvals';
DELETE FROM sys_menu WHERE route_name = 'fund-management_payment-approvals';
DELETE FROM casbin_rule WHERE ptype = 'p' AND (v1 = 'payment-request' OR (v1 = 'transfer-request' AND v2 IN ('confirm', 'approve')));

INSERT INTO sys_menu (menu_type, menu_name, icon_type, icon, route_name, route_path, component, status, pid, sequence, i18n_key, created_by)
SELECT 'menu', '转账策略', 1, 'tabler:arrows-split', 'fund-management_transfer-strategies', '/fund-management/transfer-strategies',
  'view.fund-management_transfer-strategies', 'ENABLED', parent.id, 4, 'route.fund-management_transfer-strategies', '-1'
FROM sys_menu parent WHERE parent.route_name = 'fund-management'
  AND NOT EXISTS (SELECT 1 FROM sys_menu m WHERE m.route_name = 'fund-management_transfer-strategies');

INSERT IGNORE INTO sys_role_menu (role_id, menu_id, domain)
SELECT rm.role_id, target.id, rm.domain FROM sys_role_menu rm JOIN sys_menu source ON source.id = rm.menu_id
JOIN sys_menu target ON target.route_name = 'fund-management_transfer-strategies'
WHERE source.route_name = 'fund-management_payment-requests';
