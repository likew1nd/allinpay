-- 清理旧风险跳转入口和用户详情占位页的角色菜单关联。
DELETE role_menu
FROM sys_role_menu AS role_menu
JOIN sys_menu AS retired_menu ON retired_menu.id = role_menu.menu_id
WHERE retired_menu.route_name IN (
  'risk-recovery',
  'risk-recovery_pauses',
  'risk-recovery_tasks',
  'risk-recovery_status',
  'manage_user-detail'
);

-- 仅删除对应菜单，不修改用户、站点、异常或日志业务数据。
DELETE FROM sys_menu
WHERE route_name IN (
  'risk-recovery',
  'risk-recovery_pauses',
  'risk-recovery_tasks',
  'risk-recovery_status',
  'manage_user-detail'
);
