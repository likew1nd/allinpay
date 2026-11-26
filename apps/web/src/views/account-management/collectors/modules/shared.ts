import type { AccountBusinessStatus, AccountRecord, AccountRuntimeState, AccountStatus, CollectorMoney, CollectorStatus } from '@/service/api';
import { $t } from '@/locales';

export function businessLabel(status: AccountBusinessStatus) {
  const labels = {
    NORMAL: $t('page.collector.normal'),
    RESTRICTED: $t('page.collector.restricted'),
    JUDICIAL: $t('page.collector.judicial'),
    UNKNOWN: $t('page.collector.unknown')
  };
  return labels[status] ?? labels.UNKNOWN;
}
export function businessType(status: AccountBusinessStatus): 'success' | 'warning' | 'danger' | 'info' {
  const types = { NORMAL: 'success', RESTRICTED: 'warning', JUDICIAL: 'danger', UNKNOWN: 'info' } as const;
  return types[status] ?? 'info';
}
/**
 * 账号状态标签：账号限制与司法限制可同时存在，各显示一个标签；
 * 都没有时回退到 businessStatus（正常/未知），兼容尚未巡检过的账号。
 */
export function businessTags(
  row: Pick<AccountRecord, 'businessStatus' | 'restrictionActive' | 'judicialActive'>
): { label: string; type: 'success' | 'warning' | 'danger' | 'info' }[] {
  const tags: { label: string; type: 'success' | 'warning' | 'danger' | 'info' }[] = [];
  if (row.restrictionActive) tags.push({ label: businessLabel('RESTRICTED'), type: businessType('RESTRICTED') });
  if (row.judicialActive) tags.push({ label: businessLabel('JUDICIAL'), type: businessType('JUDICIAL') });
  if (!tags.length) tags.push({ label: businessLabel(row.businessStatus), type: businessType(row.businessStatus) });
  return tags;
}
export function connectionLabel(status: CollectorStatus) {
  return {
    ONLINE: $t('page.collector.online'),
    OFFLINE: $t('page.collector.offline'),
    ERROR: $t('page.collector.error')
  }[status];
}
export function connectionType(status: CollectorStatus) {
  return ({ ONLINE: 'success', OFFLINE: 'info', ERROR: 'danger' } as const)[status];
}
// 浏览器登录态映射，对应后端 AccountStatus
export function loginStateLabel(status: AccountStatus | null | undefined) {
  if (!status) return $t('page.collector.unknown');
  return {
    HEALTHY: $t('page.collector.loginHealthy'),
    DEGRADED: $t('page.collector.loginDegraded'),
    AUTH_EXPIRED: $t('page.collector.loginAuthExpired'),
    PASSWORD_REJECTED: $t('page.collector.loginPasswordRejected'),
    CAPTCHA_REQUIRED: $t('page.collector.loginCaptcha'),
    ENV_UNAVAILABLE: $t('page.collector.loginEnvUnavailable'),
    UNKNOWN: $t('page.collector.unknown')
  }[status] ?? $t('page.collector.unknown');
}
export function loginStateType(status: AccountStatus | null | undefined): 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<AccountStatus, 'success' | 'warning' | 'danger' | 'info'> = {
    HEALTHY: 'success',
    DEGRADED: 'warning',
    AUTH_EXPIRED: 'warning',
    PASSWORD_REJECTED: 'danger',
    CAPTCHA_REQUIRED: 'danger',
    ENV_UNAVAILABLE: 'danger',
    UNKNOWN: 'info'
  };
  return status ? (map[status] ?? 'info') : 'info';
}

export function runtimeStateLabel(state: AccountRuntimeState | null | undefined): string {
  if (!state) return $t('page.collector.runtimeIdle');
  return {
    RUNNING: $t('page.collector.runtimeRunning'),
    ERROR: $t('page.collector.runtimeError'),
    PENDING_LOGIN: $t('page.collector.runtimePendingLogin'),
    IDLE: $t('page.collector.runtimeIdle'),
  }[state] ?? $t('page.collector.runtimeIdle');
}

export function runtimeStateType(state: AccountRuntimeState | null | undefined): 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<AccountRuntimeState, 'success' | 'warning' | 'danger' | 'info'> = {
    RUNNING: 'success',
    ERROR: 'danger',
    PENDING_LOGIN: 'warning',
    IDLE: 'info',
  };
  return state ? (map[state] ?? 'info') : 'info';
}
export function accountMoney(row: AccountRecord): CollectorMoney[] {
  return [
    {
      available: row.balance,
      unavailable: row.unavailableBalance,
      pending: row.pendingBalance
    }
  ];
}
