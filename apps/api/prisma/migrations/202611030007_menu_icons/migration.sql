-- 统一可见菜单图标，仅修改图标字段，保留菜单结构和授权。
UPDATE `sys_menu`
SET `icon_type` = 1,
    `icon` = CASE `route_name`
      WHEN 'overview' THEN 'tabler:layout-dashboard'
      WHEN 'site-management' THEN 'tabler:world'
      WHEN 'site-management_list' THEN 'tabler:list-details'
      WHEN 'site-management_data' THEN 'tabler:chart-bar'
      WHEN 'account-management' THEN 'tabler:users'
      WHEN 'account-management_list' THEN 'tabler:user-circle'
      WHEN 'account-management_collectors' THEN 'tabler:device-desktop-code'
      WHEN 'account-management_bindings' THEN 'tabler:link'
      WHEN 'strategy-center' THEN 'tabler:git-branch'
      WHEN 'strategy-center_groups' THEN 'tabler:adjustments-horizontal'
      WHEN 'strategy-center_adjustments' THEN 'tabler:history'
      WHEN 'fund-management' THEN 'tabler:wallet'
      WHEN 'fund-management_accounts' THEN 'tabler:building-bank'
      WHEN 'fund-management_settlements' THEN 'tabler:receipt'
      WHEN 'fund-management_payment-requests' THEN 'tabler:file-invoice'
      WHEN 'fund-management_payment-approvals' THEN 'tabler:clipboard-check'
      WHEN 'fund-management_receiving-pools' THEN 'tabler:coins'
      WHEN 'fund-management_external-flows' THEN 'tabler:arrows-exchange'
      WHEN 'runtime-monitor' THEN 'tabler:activity'
      WHEN 'runtime-monitor_exceptions' THEN 'tabler:alert-triangle'
      WHEN 'runtime-monitor_collection-runs' THEN 'tabler:radar'
      WHEN 'runtime-monitor_executions' THEN 'tabler:list-check'
      WHEN 'runtime-monitor_evidence-notifications' THEN 'tabler:bell'
      WHEN 'system-settings' THEN 'tabler:settings'
      WHEN 'manage_user' THEN 'tabler:user-cog'
      WHEN 'manage_role' THEN 'tabler:user-shield'
      WHEN 'manage_menu' THEN 'tabler:sitemap'
      WHEN 'system-settings_mfa' THEN 'tabler:shield-lock'
      WHEN 'system-settings_adapters' THEN 'tabler:plug'
      WHEN 'system-settings_site-access' THEN 'tabler:plug-connected'
      WHEN 'system-settings_operations' THEN 'tabler:server-cog'
      ELSE `icon`
    END
WHERE `route_name` IN (
  'overview',
  'site-management',
  'site-management_list',
  'site-management_data',
  'account-management',
  'account-management_list',
  'account-management_collectors',
  'account-management_bindings',
  'strategy-center',
  'strategy-center_groups',
  'strategy-center_adjustments',
  'fund-management',
  'fund-management_accounts',
  'fund-management_settlements',
  'fund-management_payment-requests',
  'fund-management_payment-approvals',
  'fund-management_receiving-pools',
  'fund-management_external-flows',
  'runtime-monitor',
  'runtime-monitor_exceptions',
  'runtime-monitor_collection-runs',
  'runtime-monitor_executions',
  'runtime-monitor_evidence-notifications',
  'system-settings',
  'manage_user',
  'manage_role',
  'manage_menu',
  'system-settings_mfa',
  'system-settings_adapters',
  'system-settings_site-access',
  'system-settings_operations'
);
