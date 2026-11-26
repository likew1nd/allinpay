-- Add deletion to the built-in site administrators without changing custom roles.
INSERT INTO `casbin_rule` (`ptype`, `v0`, `v1`, `v2`, `v3`)
SELECT DISTINCT 'p', existing.`v0`, 'site', 'delete', existing.`v3`
FROM `casbin_rule` existing
WHERE existing.`ptype` = 'p'
  AND existing.`v0` IN ('ROLE_SUPER', 'ROLE_ADMIN')
  AND existing.`v1` = 'site'
  AND existing.`v2` = 'update'
  AND existing.`v3` = 'built-in'
  AND NOT EXISTS (
    SELECT 1 FROM `casbin_rule` granted
    WHERE granted.`ptype` = 'p' AND granted.`v0` = existing.`v0`
      AND granted.`v1` = 'site' AND granted.`v2` = 'delete'
      AND granted.`v3` = existing.`v3`
  );
