-- 移除适配器与站点接入页面的菜单及角色关联，保留站点业务数据。
START TRANSACTION;

DELETE FROM `sys_role_menu`
WHERE `menu_id` IN (
  SELECT `id` FROM `sys_menu`
  WHERE `route_name` IN ('system-settings_adapters', 'system-settings_site-access')
);

DELETE FROM `sys_menu`
WHERE `route_name` IN ('system-settings_adapters', 'system-settings_site-access');

COMMIT;
