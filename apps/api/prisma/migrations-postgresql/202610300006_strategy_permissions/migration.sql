-- Strategy and adjustment APIs use the same native Casbin policy model as site APIs.
INSERT INTO casbin_rule (ptype, v0, v1, v2, v3)
SELECT 'p', role_code, resource, action, 'built-in'
FROM (VALUES
  ('ROLE_SUPER', 'strategy', 'read'), ('ROLE_SUPER', 'strategy', 'create'), ('ROLE_SUPER', 'strategy', 'update'),
  ('ROLE_SUPER', 'adjustment', 'read'),
  ('ROLE_ADMIN', 'strategy', 'read'), ('ROLE_ADMIN', 'strategy', 'create'), ('ROLE_ADMIN', 'strategy', 'update'),
  ('ROLE_ADMIN', 'adjustment', 'read')
) AS rules(role_code, resource, action)
WHERE NOT EXISTS (
  SELECT 1 FROM casbin_rule existing
  WHERE existing.ptype = 'p' AND existing.v0 = rules.role_code
    AND existing.v1 = rules.resource AND existing.v2 = rules.action
    AND existing.v3 = 'built-in'
);
