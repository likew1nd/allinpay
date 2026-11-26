UPDATE sys_menu
SET menu_name = '通道数据', icon = 'tabler:arrows-split', hide_in_menu = 0, active_menu = NULL
WHERE route_name = 'site-management_channels' AND hide_in_menu = 1 AND active_menu = 'site-management_data';
