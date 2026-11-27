import { Prisma } from '@prisma/client';
import type { AccountChannelResult, NotificationPayload } from '../notification/notification.service';
import { EVENT_LABELS, hash } from '../notification/notification.types';
import { noticeTargets } from './channel-notice-targets';
import { eventCardRoute, recoveryNoticePrefix, strategyTriggerPrefix } from './notification-routing';
import type { TelegramScope } from './telegram-policy';

export const resultNoticeKey = (eventId: string, targetId: string, part: string) => hash(`result-event:${eventId}:${targetId}:${part}`);

export async function resultNoticeRoutes(db: Prisma.TransactionClient, payload: NotificationPayload, targetId: string) {
  if (payload.type === 'STRATEGY') return (await noticeTargets(db, strategyTriggerPrefix))?.includes(targetId) ? payload.routes : [];
  if (payload.type === 'RECOVERY') {
    const configured = await noticeTargets(db, recoveryNoticePrefix);
    if (configured !== null) return configured.includes(targetId) ? payload.routes : [];
  }
  const matches = await Promise.all(payload.routes.map(async eventType => {
    const route = await eventCardRoute(db, eventType);
    if (!route.explicit && route.ids.includes(targetId)) return eventType;
    const subscription = await db.telegramSubscription.findUnique({ where: { targetId_eventType: { targetId, eventType } } });
    return subscription?.enabled ? eventType : null;
  }));
  return matches.filter(type => type !== null);
}

const resultLabels: Record<AccountChannelResult['status'], string> = {
  CLOSED: '已关闭', OPENED: '已开启', ALREADY_CLOSED: '原已关闭', ALREADY_OPEN: '原已开启',
  HELD: '保持原状', FAILED: '操作失败', UNCERTAIN: '待核实',
};

export function resultNoticeParts(payload: NotificationPayload, scope: TelegramScope, routes: string[], at: Date) {
  const recovery = payload.type === 'RECOVERY';
  const strategy = payload.type === 'STRATEGY';
  const lamp = strategy ? '🔵' : recovery ? '🟢' : '🔴';
  // 只列出接收群有权限查看的站点。环境权限由派送层单独校验。
  const results = (payload.results ?? []).filter(item => scope.all || scope.siteIds.includes(item.siteId));
  const count = (status: AccountChannelResult['status']) => results.filter(item => item.status === status).length;
  const summary = strategy ? [] : [
    `限制类型：${routes.map(type => EVENT_LABELS[type]).join('、')}`,
    ...(payload.source ? [`来源：${payload.source}`] : []),
    `本次${recovery ? '开启' : '关闭'} ${count(recovery ? 'OPENED' : 'CLOSED')} 条 · 失败 ${count('FAILED')} 条 · 待核实 ${count('UNCERTAIN')} 条`,
    ...(payload.note ? [payload.note] : []),
  ];
  const heading = [`${lamp} ${payload.title}`, `${strategy ? '站点' : '环境'}：${payload.subject}`,
    `时间：${at.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京时间）`];
  const details = results.sort((a, b) => a.siteName.localeCompare(b.siteName, 'zh-CN') || a.code.localeCompare(b.code, 'zh-CN', { numeric: true }))
    .map(item => `${item.siteName} · ${item.code} ${item.name}｜${resultLabels[item.status]}${item.reason ? `（${item.reason}）` : ''}`);
  const parts: { key: string; kind: string; text: string; image?: string }[] = [
    { key: 'card', kind: strategy ? 'STRATEGY_TRIGGER_CARD' : recovery ? 'RESTRICTION_RECOVERY_CARD' : 'RESTRICTION_CLOSE_CARD',
      text: [...heading, ...summary, ...(payload.lines ?? [])].join('\n') },
  ];
  if (details.length) {
    let text = `${payload.title} · 通道明细\n${payload.subject}`;
    let index = 0;
    for (const line of details) {
      if (text.length + line.length > 3800) {
        parts.push({ key: `details:${index++}`, kind: 'RESTRICTION_DETAILS', text });
        text = `${payload.title} · 通道明细（续）\n${payload.subject}`;
      }
      text += '\n' + line;
    }
    parts.push({ key: `details:${index}`, kind: 'RESTRICTION_DETAILS', text });
  }
  if (!recovery && !strategy) for (const type of routes) {
    const image = payload.evidence?.[type];
    if (image) parts.push({ key: `evidence:${type}`, kind: 'RESTRICTION_EVIDENCE', text: `${payload.subject}\n${EVENT_LABELS[type]} · 本轮巡检截图`, image });
  }
  return parts;
}
