import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EVENT_LABELS, noticeIcons } from '../notification/notification.types';
import { noticeTargets, saveNoticeTargets } from './channel-notice-targets';
import { alertPrefix, summaryPrefix } from './environment-notice';
import { integer, object } from './telegram-input';
import { readIds } from './telegram-policy';

export const transferNoticePrefixes = {
  TRANSFER: 'telegram.transfer-result.targets.',
  TRANSFER_QR: 'telegram.transfer-qr.targets.',
};
export const strategyTriggerPrefix = 'telegram.strategy-trigger.targets.';
export const recoveryNoticePrefix = 'telegram.account-recovery.targets.';
export const recoveryNoticeKey = 'ACCOUNT_RESTRICTION_RECOVERED';
const restrictionEvents = ['ACCOUNT_RESTRICTION', 'ACCOUNT_JUDICIAL'];
const directRoutes = {
  CHANNEL_NOTICE: { label: '通道状态通知', prefix: undefined, allByDefault: true },
  ENV_SUMMARY: { label: '环境巡检摘要', prefix: summaryPrefix, allByDefault: false },
  TRANSFER: { label: '自动转账结果', prefix: transferNoticePrefixes.TRANSFER, allByDefault: true },
  TRANSFER_QR: { label: '转账扫码二维码', prefix: transferNoticePrefixes.TRANSFER_QR, allByDefault: true },
  STRATEGY_TRIGGERED: { label: '站点策略触发', prefix: strategyTriggerPrefix, allByDefault: false },
  [recoveryNoticeKey]: { label: '账号解除限制', prefix: recoveryNoticePrefix, allByDefault: false },
};
const intervalPrefix = 'telegram.event.repeat.';
const routedEvents = Object.entries(EVENT_LABELS).filter(([type]) => !Object.hasOwn(directRoutes, type));
const accountEvents = routedEvents.map(([type]) => type).filter(type => type.startsWith('ACCOUNT_'));
const alertEventPrefix = (type: string) => `telegram.environment.event.${type}.targets.`;

export async function eventCardRoute(db: Prisma.TransactionClient, type: string, legacyIds?: string[]) {
  const explicit = await noticeTargets(db, alertEventPrefix(type));
  return { explicit: explicit !== null, ids: explicit ?? legacyIds ?? await noticeTargets(db, alertPrefix) ?? [] };
}

export async function getNotificationRoutes(tx: Prisma.TransactionClient, botId: string | null) {
  const targets = await tx.telegramTarget.findMany({ where: { botId: botId ?? '', archived: false }, select: { id: true } });
  const ids = targets.map(target => target.id);
  const [subscriptions, legacyIds, ...direct] = await Promise.all([
    tx.telegramSubscription.findMany({ where: { targetId: { in: ids }, enabled: true } }),
    noticeTargets(tx, alertPrefix),
    ...Object.values(directRoutes).map(rule => noticeTargets(tx, rule.prefix)),
  ] as const);
  const intervals = await tx.systemSetting.findMany({ where: { key: { startsWith: intervalPrefix } }, select: { key: true, value: true } });
  const events = await Promise.all(routedEvents.map(async ([key, label]) => {
    const card = accountEvents.includes(key);
    const route = card ? await eventCardRoute(tx, key, legacyIds ?? []) : { ids: [], explicit: false };
    const rules = subscriptions.filter(rule => rule.eventType === key);
    const recipients = ids.flatMap(targetId => {
      const rule = rules.find(item => item.targetId === targetId);
      const environmentCard = route.ids.includes(targetId);
      if (!rule && (route.explicit || !environmentCard)) return [];
      return [{ targetId, repeatIntervalMinutes: environmentCard && !route.explicit ? 0 : rule?.repeatIntervalMinutes ?? 0 }];
    });
    const minutes = new Set(recipients.map(item => item.repeatIntervalMinutes));
    const repeatIntervalMinutes = minutes.size > 1 ? null : recipients[0]?.repeatIntervalMinutes ?? Number(intervals.find(row => row.key === intervalPrefix + key)?.value ?? 0);
    return { key, label, icon: noticeIcons[key], repeatIntervalMinutes, kind: 'event' as const, targetIds: recipients.map(item => item.targetId), recipients };
  }));
  const oneTimeRoutes = Object.entries(directRoutes).map(([key, rule], index) => {
    const base = { key, label: rule.label, icon: noticeIcons[key], kind: 'direct' as const };
    if (key === recoveryNoticeKey && direct[index] === null) {
      const targetIds = [...new Set(events.filter(row => restrictionEvents.includes(row.key)).flatMap(row => row.targetIds))];
      return { ...base, targetIds, inheritsRestrictionTargets: true };
    }
    return { ...base, targetIds: direct[index] ?? (rule.allByDefault ? null : []) };
  });
  return [...oneTimeRoutes, ...events];
}

export async function saveNotificationRoute(tx: Prisma.TransactionClient, botId: string | null, key: string, input: unknown) {
  if (Object.hasOwn(directRoutes, key)) {
    const body = object(input, ['targetIds']);
    const { prefix } = directRoutes[key as keyof typeof directRoutes];
    await saveNoticeTargets(tx, botId, readIds(body.targetIds), prefix);
    return;
  }
  if (!routedEvents.some(([type]) => type === key)) throw new BadRequestException('通知类型无效');
  const body = object(input, ['recipients', 'repeatIntervalMinutes']);
  const interval = body.repeatIntervalMinutes == null ? undefined : integer(body.repeatIntervalMinutes, 0, 10080);
  if (!Array.isArray(body.recipients) || body.recipients.length > 1000) throw new BadRequestException('接收群列表无效');
  const accountEvent = accountEvents.includes(key);
  const recipients = body.recipients.map(item => {
    const rule = object(item, ['targetId', 'repeatIntervalMinutes', 'sendRecovery', 'environmentCard']);
    const minutes = integer(rule.repeatIntervalMinutes ?? 0, 0, 10080);
    return { targetId: rule.targetId, repeatIntervalMinutes: minutes };
  });
  const targetIds = readIds(recipients.map(rule => rule.targetId));
  if (targetIds.length !== recipients.length) throw new BadRequestException('接收群重复');
  const targets = await tx.telegramTarget.findMany({ where: { botId: botId ?? '' }, select: { id: true, enabled: true, verified: true, archived: true } });
  const available = new Set(targets.filter(target => target.enabled && target.verified && !target.archived).map(target => target.id));
  if (targetIds.some(id => !available.has(id))) throw new BadRequestException('所选群已停用或失效，请重新选择接收群');
  if (interval !== undefined) {
    const settingKey = intervalPrefix + key, value = String(interval);
    await tx.systemSetting.upsert({ where: { key: settingKey }, create: { key: settingKey, value }, update: { value } });
  }
  if (accountEvent) await saveNoticeTargets(tx, botId, [], alertEventPrefix(key));
  await tx.telegramSubscription.updateMany({ where: { eventType: key, enabled: true, targetId: { in: targets.map(target => target.id), notIn: targetIds } }, data: { enabled: false } });
  for (const [i, targetId] of targetIds.entries()) {
    const settings = { enabled: true, repeatIntervalMinutes: interval ?? recipients[i].repeatIntervalMinutes };
    await tx.telegramSubscription.upsert({ where: { targetId_eventType: { targetId, eventType: key } },
      create: { id: randomUUID(), targetId, eventType: key, ...settings }, update: settings });
  }
}
