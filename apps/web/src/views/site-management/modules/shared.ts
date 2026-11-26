import type { SiteRecord } from '@/service/api';
import { $t } from '@/locales';

export const connectionStatuses: SiteRecord['connectionStatus'][] = ['PENDING', 'ONLINE', 'OFFLINE', 'ERROR'];

export function connectionLabel(status: SiteRecord['connectionStatus']) {
  const keys = { PENDING: 'pending', ONLINE: 'online', OFFLINE: 'offline', ERROR: 'error' } as const;
  return $t(`page.site.${keys[status] ?? 'unavailable'}`);
}

export function structureLabel(status: SiteRecord['structureStatus']) {
  const keys = { UNKNOWN: 'unknown', COMPATIBLE: 'compatible', INCOMPATIBLE: 'incompatible' } as const;
  return $t(`page.site.${keys[status] ?? 'unknown'}`);
}

export function connectionType(status: SiteRecord['connectionStatus']): UI.ThemeColor {
  const types = { PENDING: 'warning', ONLINE: 'success', OFFLINE: 'info', ERROR: 'danger' } as const;
  return types[status];
}

export function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

export function percent(value: number | null) {
  return value === null ? '—' : `${(value * 100).toFixed(2)}%`;
}

const orderRateFormatter = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 });
export function formatOrderRate(value?: number | null) {
  return value == null ? '—' : orderRateFormatter.format(value);
}

export function orderRateWindows() {
  return [...[5, 15, 30, 60].map(minutes => $t('page.site.channelRateMinutes', { minutes })), $t('page.site.channelRateDay')];
}

export function availability(status: string) {
  if (status === 'ENABLED') return $t('page.site.enabled');
  if (status === 'DISABLED') return $t('page.site.disabled');
  return $t('page.site.unavailable');
}
export function pollingMode(kind: number) {
  if (kind === 0) return $t('page.site.sequential');
  if (kind === 1) return $t('page.site.weighted');
  if (kind === 2) return $t('page.site.firstAvailable');
  return $t('page.site.unavailable');
}
export function orderLabel(status: string) {
  const keys = { SUCCESS: 'success', FAILED: 'failed', PROCESSING: 'processing', EXCLUDED: 'excluded' } as const;
  return $t(`page.site.${keys[status as keyof typeof keys] ?? 'unavailable'}`);
}
