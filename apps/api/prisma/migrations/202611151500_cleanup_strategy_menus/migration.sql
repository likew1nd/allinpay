-- 日志作为站点中心的直接子菜单，保留日志内容、原路由及原有授权。
UPDATE sys_menu AS log_menu
JOIN sys_menu AS site_menu ON site_menu.route_name = 'site-management'
SET log_menu.menu_name = '策略日志',
    log_menu.pid = site_menu.id,
    log_menu.sequence = 7,
    log_menu.hide_in_menu = 0,
    log_menu.active_menu = NULL
WHERE log_menu.route_name = 'strategy-center_adjustments';

-- 已获日志授权的角色保留新父级目录的可见性。
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, domain)
SELECT role_menu.role_id, site_menu.id, role_menu.domain
FROM sys_role_menu AS role_menu
JOIN sys_menu AS log_menu ON log_menu.id = role_menu.menu_id
JOIN sys_menu AS site_menu ON site_menu.route_name = 'site-management'
WHERE log_menu.route_name = 'strategy-center_adjustments';

-- 先清理废弃菜单授权，再删除不再使用的分组和跳转菜单。
DELETE role_menu
FROM sys_role_menu AS role_menu
JOIN sys_menu AS retired_menu ON retired_menu.id = role_menu.menu_id
WHERE retired_menu.route_name IN ('strategy-center', 'strategy-center_strategies', 'strategy-center_templates');

DELETE FROM sys_menu
WHERE route_name IN ('strategy-center', 'strategy-center_strategies', 'strategy-center_templates');
