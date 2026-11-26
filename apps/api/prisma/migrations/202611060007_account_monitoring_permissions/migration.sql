-- 补齐账号监控的域内授权，保留已有自定义角色及历史策略。
INSERT INTO `casbin_rule` (`ptype`, `v0`, `v1`, `v2`, `v3`, `v4`)
SELECT 'p', 'ROLE_SUPER', 'account', 'update', 'built-in', 'allow'
WHERE NOT EXISTS (
  SELECT 1 FROM `casbin_rule`
  WHERE `ptype` = 'p' AND `v0` = 'ROLE_SUPER' AND `v1` = 'account'
    AND `v2` = 'update' AND `v3` = 'built-in'
);

INSERT INTO `casbin_rule` (`ptype`, `v0`, `v1`, `v2`, `v3`, `v4`)
SELECT 'p', 'ROLE_ADMIN', 'account', 'update', 'built-in', 'allow'
WHERE NOT EXISTS (
  SELECT 1 FROM `casbin_rule`
  WHERE `ptype` = 'p' AND `v0` = 'ROLE_ADMIN' AND `v1` = 'account'
    AND `v2` = 'update' AND `v3` = 'built-in'
);
