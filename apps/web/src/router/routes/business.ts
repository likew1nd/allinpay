import type { CustomRoute, ElegantConstRoute } from '@elegant-router/types';

// eslint-disable-next-line max-params
const page = (name: string, path: string, title: string, icon: string, description?: string) => ({
  name,
  path,
  component: `view.${name}`,
  meta: { title, i18nKey: `route.${name}`, icon, description }
});

export const businessRoutes = [
  {
    name: 'overview',
    path: '/overview',
    component: 'layout.base$view.overview',
    meta: { title: '运营总览', i18nKey: 'route.overview', icon: 'tabler:layout-dashboard', order: 1 }
  },
  {
    name: 'site-management',
    path: '/site-management',
    component: 'layout.base',
    meta: { title: '站点中心', i18nKey: 'route.site-management', icon: 'tabler:world', order: 2 },
    children: [
      page('site-management_list', '/site-management/list', '站点管理', 'tabler:list-details'),
      page('site-management_data', '/site-management/data', '站点数据', 'tabler:chart-bar'),
      page('site-management_channels', '/site-management/channels', '通道数据', 'tabler:arrows-split'),
      page('site-management_orders', '/site-management/orders', '订单数据', 'tabler:list-details'),
      page('strategy-center_groups', '/strategy-center/groups', '站点策略', 'tabler:adjustments-horizontal'),
      page('strategy-center_adjustments', '/strategy-center/adjustments', '策略日志', 'tabler:history'),
      ...[
        page('site-management_polling-groups', '/site-management/polling-groups', '轮询组', 'tabler:chart-bar')
      ].map(route => ({ ...route, meta: { ...route.meta, hideInMenu: true, activeMenu: 'site-management_data' } }))
    ]
  },
  {
    name: 'account-management',
    path: '/account-management',
    component: 'layout.base',
    meta: { title: '支付中心', i18nKey: 'route.account-management', icon: 'tabler:users', order: 3 },
    children: [
      page('account-management_collectors', '/account-management/collectors', '采集管理', 'tabler:device-desktop-code'),
      page('account-management_bindings', '/account-management/bindings', '环境列表', 'tabler:link'),
      page('account-management_receiving-accounts', '/account-management/receiving-accounts', '收款列表', 'tabler:coins'),
      page(
        'fund-management_payment-requests',
        '/fund-management/payment-requests',
        '转账管理',
        'tabler:file-invoice',
        '资金能力将在 P8 开放.'
      ),
      page('fund-management_transfer-strategies', '/fund-management/transfer-strategies', '转账策略', 'tabler:arrows-split'),
      {
        ...page('account-management_script-settings', '/account-management/script-settings', '脚本设置', 'tabler:script'),
        meta: { hideInMenu: true, activeMenu: 'account-management_collectors' }
      }
    ]
  },
  {
    name: 'runtime-monitor',
    path: '/runtime-monitor',
    component: 'layout.base',
    meta: { title: '运行监控', i18nKey: 'route.runtime-monitor', icon: 'tabler:activity', order: 7 },
    children: [
      page('runtime-monitor_exceptions', '/runtime-monitor/exceptions', '异常情况', 'tabler:alert-triangle'),
      {
        ...page('runtime-monitor_sync-status', '/runtime-monitor/sync-status', '同步状态', 'tabler:list-details'),
        meta: { hideInMenu: true, activeMenu: 'site-management_list' }
      },
      page(
        'runtime-monitor_collection-runs',
        '/runtime-monitor/collection-runs',
        '采集运行',
        'tabler:radar',
        '采集端能力将在 P6 开放。'
      ),
      page('runtime-monitor_executions', '/runtime-monitor/executions', '系统日志', 'tabler:logs'),
      page(
        'runtime-monitor_evidence-notifications',
        '/runtime-monitor/evidence-notifications',
        '证据与通知',
        'tabler:bell',
        '证据和通知能力将在 P10 开放。'
      )
    ]
  },
  {
    name: 'system-settings',
    path: '/system-settings',
    component: 'layout.base',
    meta: { title: '系统设置', i18nKey: 'route.system-settings', icon: 'tabler:settings', order: 8 },
    children: [
      page(
        'system-settings_mfa',
        '/system-settings/mfa',
        '多因素认证',
        'tabler:shield-lock',
        '绑定验证器，管理系统 MFA 开关。'
      ),
      page('system-settings_telegram', '/system-settings/telegram', 'Telegram 设置', 'tabler:brand-telegram')
    ]
  }
] as unknown as CustomRoute[];

// 按当前用户实际可见的入口折叠重复菜单，日志直达路由继续注册。
export function withStrategyLogMenu(route: ElegantConstRoute, canReadLogs: boolean): ElegantConstRoute {
  if (route.name !== 'site-management' || !canReadLogs ||
      !route.children?.some(child => child.name === 'strategy-center_groups' && !child.meta?.hideInMenu)) {
    return route;
  }

  return {
    ...route,
    children: route.children.map<ElegantConstRoute>(child => child.name === 'strategy-center_adjustments' && child.meta
      ? { ...child, meta: { ...child.meta, hideInMenu: true, activeMenu: 'strategy-center_groups' } }
      : child)
  };
}
