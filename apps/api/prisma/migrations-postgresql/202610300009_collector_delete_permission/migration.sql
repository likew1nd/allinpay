-- Allow operators to remove a collector and its reported accounts.
INSERT INTO "casbin_rule" ("ptype", "v0", "v1", "v2", "v3")
SELECT 'p', role, 'collector', 'delete', 'built-in'
FROM (VALUES ('ROLE_SUPER'), ('ROLE_ADMIN')) AS roles(role)
WHERE NOT EXISTS (
  SELECT 1 FROM "casbin_rule" current
  WHERE current."ptype" = 'p'
    AND current."v0" = roles.role
    AND current."v1" = 'collector'
    AND current."v2" = 'delete'
    AND current."v3" = 'built-in'
);
