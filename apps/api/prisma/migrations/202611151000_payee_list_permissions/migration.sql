UPDATE sys_menu
SET menu_name = '收款列表'
WHERE route_name = 'account-management_receiving-accounts';

INSERT INTO casbin_rule (ptype, v0, v1, v2, v3)
SELECT 'p', roles.role_name, 'payee', 'delete', 'built-in'
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
    AND v1 = 'payee'
    AND v2 = 'delete'
    AND v3 = 'built-in'
);
