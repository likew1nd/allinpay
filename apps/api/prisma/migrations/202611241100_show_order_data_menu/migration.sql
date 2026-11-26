UPDATE sys_menu
SET menu_name = '订单数据', icon = 'tabler:list-details', hide_in_menu = 0, active_menu = NULL
WHERE route_name = 'site-management_orders' AND hide_in_menu = 1 AND active_menu = 'site-management_data';
