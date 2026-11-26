UPDATE `sys_menu`
SET `i18n_key` = CONCAT('route.', `route_name`),
    `hide_in_menu` = CASE
      WHEN `route_name` IN ('strategy-center_strategies', 'strategy-center_templates') THEN true
      ELSE false
    END,
    `active_menu` = CASE
      WHEN `route_name` IN ('strategy-center_strategies', 'strategy-center_templates') THEN 'strategy-center_groups'
      ELSE NULL
    END
WHERE `route_name` IN (
  'strategy-center_groups',
  'strategy-center_strategies',
  'strategy-center_templates',
  'strategy-center_adjustments'
);
