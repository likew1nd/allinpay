-- Only change the default; preserve explicitly saved sample thresholds.
ALTER TABLE `strategy_template` ALTER COLUMN `min_samples` SET DEFAULT 1;

-- Reclassify historical snapshots using the original, unmodified source status.
UPDATE `epay_order`
SET `status` = CASE
    WHEN `source_status` REGEXP '^[0-9]+$' THEN
      CASE WHEN CAST(`source_status` AS UNSIGNED) > 0 THEN 'SUCCESS' ELSE 'FAILED' END
    ELSE 'EXCLUDED'
  END,
  `source_version` = 'epay-pro-2070-status-v2';

UPDATE `epay_sync_run` SET `mapping_version` = 'epay-pro-2070-status-v2'
WHERE `mapping_version` = 'epay-pro-2070-status-v1';
