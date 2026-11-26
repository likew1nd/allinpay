-- 移除系统运维页面菜单及角色关联；版本更新入口已并入顶部系统设置抽屉，不修改站点和版本业务数据。
START TRANSACTION;

DELETE FROM `sys_role_menu`
WHERE `menu_id` IN (
  SELECT `id` FROM `sys_menu`
  WHERE `route_name` = 'system-settings_operations'
);

DELETE FROM `sys_menu`
WHERE `route_name` = 'system-settings_operations';

COMMIT;
