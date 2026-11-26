-- 只调整菜单名称与分组，保留路由、页面及原有角色授权。
UPDATE sys_menu AS strategy_menu
JOIN sys_menu AS site_menu ON site_menu.route_name = 'site-management'
SET strategy_menu.menu_name = '站点策略',
    strategy_menu.pid = site_menu.id,
    strategy_menu.sequence = 6
WHERE strategy_menu.route_name = 'strategy-center_groups';

-- 原有策略用户需要新父级目录才能继续看到已授权的菜单。
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, domain)
SELECT role_menu.role_id, site_menu.id, role_menu.domain
FROM sys_role_menu AS role_menu
JOIN sys_menu AS strategy_menu ON strategy_menu.id = role_menu.menu_id
JOIN sys_menu AS site_menu ON site_menu.route_name = 'site-management'
WHERE strategy_menu.route_name = 'strategy-center_groups';
