-- 账号在采集端详情里查看，移除独立的账号列表菜单
DELETE FROM `sys_role_menu`
WHERE `menu_id` IN (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'account-management_list');

-- 清理已手动删除菜单后遗留的孤儿角色绑定
DELETE FROM `sys_role_menu`
WHERE `menu_id` = 31
  AND NOT EXISTS (SELECT 1 FROM `sys_menu` WHERE `id` = 31);

DELETE FROM `sys_menu`
WHERE `route_name` = 'account-management_list';

-- 账号管理子菜单顺序：采集端 1、账号绑定 2、脚本设置 3
UPDATE `sys_menu` SET `sequence` = 1
WHERE `route_name` = 'account-management_collectors' AND `pid` = 30;

UPDATE `sys_menu` SET `sequence` = 2
WHERE `route_name` = 'account-management_bindings' AND `pid` = 30;

UPDATE `sys_menu` SET `sequence` = 3
WHERE `route_name` = 'account-management_script-settings' AND `pid` = 30;
