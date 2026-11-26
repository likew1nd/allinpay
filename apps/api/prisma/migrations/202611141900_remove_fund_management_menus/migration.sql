DELETE role_menu
FROM sys_role_menu AS role_menu
JOIN sys_menu AS menu ON menu.id = role_menu.menu_id
LEFT JOIN sys_menu AS parent ON parent.id = menu.pid
WHERE menu.route_name = 'fund-management'
   OR parent.route_name = 'fund-management';

DELETE menu
FROM sys_menu AS menu
LEFT JOIN sys_menu AS parent ON parent.id = menu.pid
WHERE menu.route_name = 'fund-management'
   OR parent.route_name = 'fund-management';
