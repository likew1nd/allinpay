import { createHash } from 'node:crypto';
import type { NotificationIncident } from '@prisma/client';

export const EVENT_LABELS: Record<string, string> = {
  ACCOUNT_RESTRICTION: '商家资金限制', ACCOUNT_JUDICIAL: '司法限制',
  ACCOUNT_LOGIN_REQUIRED: '账号需要登录', ACCOUNT_PASSWORD_REJECTED: '密码错误，巡检已关闭',
  ACCOUNT_CAPTCHA_REQUIRED: '账号需要验证码', ACCOUNT_ENV_UNAVAILABLE: '环境不可用',
  ACCOUNT_COLLECTION_FAILED: '页面采集失败', COLLECTOR_OFFLINE: '采集端离线',
  STRATEGY_EXECUTION_FAILED: '策略执行失败',
  STRATEGY_TRIGGERED: '站点策略触发',
  ACCOUNT_RESTRICTION_RECOVERED: '账号已解除限制',
};
export const noticeIcons: Record<string, string> = {
  CHANNEL_NOTICE: '🚦', ENV_SUMMARY: '📋', TRANSFER: '💸', TRANSFER_QR: '📲',
  ACCOUNT_RESTRICTION: '🔒', ACCOUNT_JUDICIAL: '⚖️', ACCOUNT_LOGIN_REQUIRED: '🔑',
  ACCOUNT_PASSWORD_REJECTED: '⛔', ACCOUNT_CAPTCHA_REQUIRED: '🧩', ACCOUNT_ENV_UNAVAILABLE: '🔌',
  ACCOUNT_COLLECTION_FAILED: '⚠️', COLLECTOR_OFFLINE: '📡', STRATEGY_EXECUTION_FAILED: '❌',
  STRATEGY_TRIGGERED: '⚙️', ACCOUNT_RESTRICTION_RECOVERED: '🔓',
};

export function incidentHeading(type: string, title: string, phase: string) {
  const state = phase === 'REMIND' ? '🟠 持续异常' : '🔴 发现异常';
  return `${state}｜${noticeIcons[type] ?? '⚠️'} ${title}`;
}

export function formatIncidentNotice(incident: Pick<NotificationIncident, 'id' | 'title' | 'entityId' | 'occurredAt' | 'eventType'>, phase: string) {
  const at = new Date(incident.occurredAt.getTime() + 8 * 3600_000).toISOString().slice(5, 16).replace('T', ' ');
  const collector = incident.eventType === 'COLLECTOR_OFFLINE';
  return [incidentHeading(incident.eventType, incident.title, phase), `${collector ? '采集端' : '调整记录'}：${incident.entityId}`,
    collector ? '请检查采集端进程、网络和最近心跳。' : '请在策略调整记录中查看失败原因和执行结果。',
    `发生：${at}（北京时间）`, `事件：${incident.id}`].join('\n');
}

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export interface Observation { eventType: string; active: boolean; cause?: string }
export function accountObservations(status: string, inspection?: {
  restriction?: { limited: boolean }; judicial?: { limited: boolean };
}): Observation[] {
  const result: Observation[] = [];
  if (inspection?.restriction) result.push({ eventType: 'ACCOUNT_RESTRICTION', active: inspection.restriction.limited });
  if (inspection?.judicial) result.push({ eventType: 'ACCOUNT_JUDICIAL', active: inspection.judicial.limited });
  const abnormal: Record<string, string> = {
    LOGIN_REQUIRED: 'ACCOUNT_LOGIN_REQUIRED', QR_LOGIN_REQUIRED: 'ACCOUNT_LOGIN_REQUIRED', AUTH_EXPIRED: 'ACCOUNT_LOGIN_REQUIRED',
    PASSWORD_REJECTED: 'ACCOUNT_PASSWORD_REJECTED', CAPTCHA_REQUIRED: 'ACCOUNT_CAPTCHA_REQUIRED',
    PAGE_ERROR: 'ACCOUNT_COLLECTION_FAILED', DEGRADED: 'ACCOUNT_COLLECTION_FAILED',
  };
  if (abnormal[status]) result.push({ eventType: abnormal[status], active: true });
  if (status === 'LOGGED_IN' || status === 'HEALTHY') {
    for (const eventType of ['ACCOUNT_LOGIN_REQUIRED', 'ACCOUNT_PASSWORD_REJECTED', 'ACCOUNT_CAPTCHA_REQUIRED']) result.push({ eventType, active: false });
    if (inspection?.restriction && inspection.judicial) result.push({ eventType: 'ACCOUNT_COLLECTION_FAILED', active: false });
  }
  if (status === 'ENV_UNAVAILABLE') result.push({ eventType: 'ACCOUNT_ENV_UNAVAILABLE', active: true, cause: 'OPEN_FAILED' });
  else if (status !== 'UNKNOWN' && (abnormal[status] || ['LOGGED_IN', 'HEALTHY'].includes(status))) {
    result.push({ eventType: 'ACCOUNT_ENV_UNAVAILABLE', active: false, cause: 'OPEN_FAILED' });
  }
  return result;
}
