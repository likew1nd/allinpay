-- 保留旧菜单记录和角色绑定，仅隐藏重复入口，旧页面负责跳转。
UPDATE `sys_menu`
SET `hide_in_menu` = true,
    `active_menu` = CASE `route_name`
      WHEN 'risk-recovery_pauses' THEN 'site-management_list'
      WHEN 'risk-recovery_tasks' THEN 'runtime-monitor_exceptions'
      WHEN 'risk-recovery_status' THEN 'runtime-monitor_sync-status'
      ELSE `active_menu`
    END
WHERE `route_name` IN ('risk-recovery', 'risk-recovery_pauses', 'risk-recovery_tasks', 'risk-recovery_status');