INSERT INTO `sys_menu` (
  `id`, `menu_type`, `menu_name`, `icon_type`, `icon`, `route_name`, `route_path`, `component`,
  `path_param`, `status`, `active_menu`, `hide_in_menu`, `pid`, `sequence`, `i18n_key`,
  `keep_alive`, `constant`, `href`, `multi_tab`, `created_by`
)
SELECT 34, 'menu', 'account-management_script-settings', 1, 'tabler:script',
  'account-management_script-settings', '/account-management/script-settings',
  'view.account-management_script-settings', NULL, 'ENABLED', NULL, false, 30, 4,
  'route.account-management_script-settings', false, false, NULL, false, '-1'
FROM DUAL
WHERE EXISTS (SELECT 1 FROM `sys_menu` WHERE `id` = 30)
  AND NOT EXISTS (SELECT 1 FROM `sys_menu` WHERE `id` = 34);

INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`, `domain`)
SELECT '1', 34, 'built-in'
FROM DUAL
WHERE EXISTS (SELECT 1 FROM `sys_menu` WHERE `id` = 34);
INSERT IGNORE INTO `sys_role_menu` (`role_id`, `menu_id`, `domain`)
SELECT '2', 34, 'built-in'
FROM DUAL
WHERE EXISTS (SELECT 1 FROM `sys_menu` WHERE `id` = 34);
