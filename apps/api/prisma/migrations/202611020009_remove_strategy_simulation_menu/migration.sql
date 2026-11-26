DELETE FROM `sys_role_menu`
WHERE `menu_id` IN (SELECT `id` FROM `sys_menu` WHERE `route_name` = 'strategy-center_simulation');

DELETE FROM `sys_menu`
WHERE `route_name` = 'strategy-center_simulation';
