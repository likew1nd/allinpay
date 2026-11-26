-- P6 account and collector permissions for built-in operator roles.
INSERT INTO "casbin_rule" ("ptype", "v0", "v1", "v2", "v3")
SELECT 'p', role, resource, action, 'built-in'
FROM (VALUES
  ('ROLE_SUPER', 'collector', 'read'),
  ('ROLE_SUPER', 'collector', 'create'),
  ('ROLE_SUPER', 'account', 'read'),
  ('ROLE_SUPER', 'account-binding', 'read'),
  ('ROLE_SUPER', 'account-binding', 'create'),
  ('ROLE_SUPER', 'account-binding', 'update'),
  ('ROLE_SUPER', 'account-binding', 'delete'),
  ('ROLE_ADMIN', 'collector', 'read'),
  ('ROLE_ADMIN', 'collector', 'create'),
  ('ROLE_ADMIN', 'account', 'read'),
  ('ROLE_ADMIN', 'account-binding', 'read'),
  ('ROLE_ADMIN', 'account-binding', 'create'),
  ('ROLE_ADMIN', 'account-binding', 'update'),
  ('ROLE_ADMIN', 'account-binding', 'delete')
) AS rules(role, resource, action)
WHERE NOT EXISTS (
  SELECT 1 FROM "casbin_rule" current
  WHERE current."ptype" = 'p'
    AND current."v0" = rules.role
    AND current."v1" = rules.resource
    AND current."v2" = rules.action
    AND current."v3" = 'built-in'
);
