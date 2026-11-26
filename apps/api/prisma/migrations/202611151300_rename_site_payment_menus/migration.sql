-- 统一菜单显示名称，保留原路由、分组和角色授权。
UPDATE sys_menu
SET menu_name = CASE route_name
  WHEN 'site-management' THEN '站点中心'
  WHEN 'site-management_list' THEN '站点管理'
  WHEN 'account-management' THEN '支付中心'
  WHEN 'account-management_collectors' THEN '采集管理'
  WHEN 'fund-management_payment-requests' THEN '转账管理'
END
WHERE route_name IN (
  'site-management',
  'site-management_list',
  'account-management',
  'account-management_collectors',
  'fund-management_payment-requests'
);
