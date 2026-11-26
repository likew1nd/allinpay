-- 收款账号移至采集管理，保留原菜单 ID 和已有角色授权。
UPDATE sys_menu AS receiving
JOIN sys_menu AS parent ON parent.route_name = 'account-management'
SET receiving.menu_name = '收款账号',
    receiving.route_name = 'account-management_receiving-accounts',
    receiving.route_path = '/account-management/receiving-accounts',
    receiving.component = 'view.account-management_receiving-accounts',
    receiving.i18n_key = 'route.account-management_receiving-accounts',
    receiving.pid = parent.id,
    receiving.sequence = 4
WHERE receiving.route_name = 'fund-management_receiving-pools';
