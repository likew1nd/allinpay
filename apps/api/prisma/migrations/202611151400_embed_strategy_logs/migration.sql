-- 日志改由站点策略页面打开，隐藏独立入口并保留原有路由与权限。
UPDATE sys_menu
SET menu_name = '策略日志',
    hide_in_menu = 1,
    active_menu = 'strategy-center_groups'
WHERE route_name = 'strategy-center_adjustments';

-- 原策略中心仅余兼容路由，隐藏空菜单分组。
UPDATE sys_menu
SET hide_in_menu = 1
WHERE route_name = 'strategy-center';
