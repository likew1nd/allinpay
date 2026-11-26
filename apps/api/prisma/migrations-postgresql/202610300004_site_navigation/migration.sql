-- Preserve existing menu IDs and role grants; old URLs remain as hidden redirects.
UPDATE sys_menu
SET hide_in_menu = true, active_menu = 'site-management_data'
WHERE route_name IN (
  'site-management_channels',
  'site-management_polling-groups',
  'site-management_orders'
);
