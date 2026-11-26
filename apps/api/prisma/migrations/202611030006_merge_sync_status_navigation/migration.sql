-- 同步状态并入站点列表，保留旧菜单及原有角色授权。
UPDATE `sys_menu`
SET `hide_in_menu` = true,
    `active_menu` = 'site-management_list'
WHERE `route_name` IN ('runtime-monitor_sync-status', 'risk-recovery_status');
