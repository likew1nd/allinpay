-- 转账策略软删除：转账单对策略有外键保护，历史转账记录要继续显示策略名，只打删除时间不真删行
ALTER TABLE `transfer_rule` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- 转账策略删除权限：超级管理员、管理员（和收款账号删除权限一致）
INSERT INTO casbin_rule (ptype, v0, v1, v2, v3)
SELECT 'p', roles.role_name, 'transfer-rule', 'delete', 'built-in'
FROM (
  SELECT 'ROLE_SUPER' AS role_name
  UNION ALL
  SELECT 'ROLE_ADMIN'
) AS roles
WHERE NOT EXISTS (
  SELECT 1
  FROM casbin_rule
  WHERE ptype = 'p'
    AND v0 = roles.role_name
    AND v1 = 'transfer-rule'
    AND v2 = 'delete'
    AND v3 = 'built-in'
);
