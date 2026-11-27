import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { Prisma, TelegramBot, TelegramDelivery } from '@prisma/client';
import { Api, InputFile } from 'grammy';
import type { CallbackQuery, InlineKeyboardMarkup } from 'grammy/types';
import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { formatQrVoid, missingTransferScreenshot, transferPhotoKey, transferResultKey } from '../transfer/transfer-notice';
import { formatIncidentNotice, hash } from '../notification/notification.types';
import type { NotificationPayload } from '../notification/notification.service';
import { readIds, readScope, safeTelegramError } from './telegram-policy';
import { TelegramAuthService } from './telegram-auth.service';
import { TelegramCommandService } from './telegram-command.service';
import { channelSnapshotPrefix, renderChannelSnapshot } from './channel-notice';
import { noticeTargets } from './channel-notice-targets';
import { environmentCard } from './environment-card';
import { alertCaption, noticeCaption, NoticeImageOptions, renderNoticeImage, THEME_BLUE, THEME_ORANGE, THEME_RED, THEME_TEAL } from './notice-image';
import { summaryPrefix, renderEnvironmentAlert, renderSummary } from './environment-notice';
import { eventCardRoute, transferNoticePrefixes } from './notification-routing';
import { resultNoticeKey, resultNoticeParts, resultNoticeRoutes } from './result-notice';

// 转账二维码排队超过扫码等待时长（脚本设置 qrWaitMinutes，取不到时用此默认分钟数）仍未发出就作废，避免晚到的二维码误导群成员
const DEFAULT_QR_WAIT_MINUTES = 8;
export const reminderConfirmationPrefix = 'notice-ack:';
export const reminderKeyboard = (id: string) => ({ inline_keyboard: [[{ text: '确认并停止重复提醒', callback_data: reminderConfirmationPrefix + id }]] });

// 数据量最大的两类通知画成卡片图发送；其余通知仍是文字。两类用不同主题色，连续发送时一眼能分开：环境巡检蓝色，通道状态青绿色。
const ENV_IMAGE: NoticeImageOptions = { title: '环境巡检', english: 'ENVIRONMENT  MONITOR', fig: 'FIG. 01', theme: THEME_BLUE };
const CHANNEL_IMAGE: NoticeImageOptions = { title: '通道状态', english: 'CHANNEL  STATUS', fig: 'FIG. 02', theme: THEME_TEAL };
// 运行异常（账号异常卡片、采集端离线、策略失败）画成单张通栏卡片图，橙红主题，与环境巡检（蓝）、通道状态（青绿）区分。
const ALERT_IMAGE: NoticeImageOptions = { title: '运行异常', english: 'INCIDENT  ALERT', fig: 'FIG. 03', theme: THEME_ORANGE, single: true };
const ALERT_IMAGE_KINDS = new Set(['ENV_ALERT', 'ENV_ALERT_TEST', 'ENV_ALERT_PREVIEW', 'NOTICE', 'NOTICE_ROUTE_TEST']);
// 二维码作废卡片：红色主题，替换原二维码图片，让群里不再留着一张还能扫的图。
const VOID_IMAGE: NoticeImageOptions = { title: '二维码作废', english: 'QR  VOIDED', fig: 'FIG. 04', theme: THEME_RED, single: true };
const RESULT_CARDS: Record<string, NoticeImageOptions> = {
  RESTRICTION_CLOSE_CARD: { title: '账号受限', english: 'ACCOUNT RESTRICTION', fig: 'FIG. 05', theme: THEME_RED, single: true },
  RESTRICTION_RECOVERY_CARD: { title: '账号恢复', english: 'ACCOUNT RECOVERY', fig: 'FIG. 06', theme: THEME_TEAL, single: true },
  STRATEGY_TRIGGER_CARD: { title: '站点策略触发', english: 'SITE STRATEGY', fig: 'FIG. 07', theme: THEME_BLUE, single: true },
};
// 后台「测试发送」产生的消息类型：优先出队，并允许「撤销测试」。
export const TEST_KINDS = ['TEST', 'TRANSFER_QR_TEST', 'TRANSFER_RESULT_TEST', 'ENV_SUMMARY_TEST', 'ENV_SUMMARY_PREVIEW', 'ENV_ALERT_TEST', 'ENV_ALERT_PREVIEW', 'NOTICE_ROUTE_TEST', 'CHANNEL_TEST', 'STRATEGY_TRIGGER_CARD_TEST', 'RESTRICTION_RECOVERY_CARD_TEST', 'RESTRICTION_DETAILS_TEST'];
const CARD_IMAGE_KINDS: Record<string, NoticeImageOptions> = {
  ENV_SUMMARY: ENV_IMAGE,
  ENV_SUMMARY_TEST: ENV_IMAGE,
  ENV_SUMMARY_PREVIEW: ENV_IMAGE,
  CHANNEL_NOTICE: CHANNEL_IMAGE,
  CHANNEL_TEST: CHANNEL_IMAGE,
};

@Injectable()
export class TelegramDeliveryService {
  private readonly chatSentAt = new Map<string, number>();
  constructor(private readonly prisma: PrismaService, private readonly auth: TelegramAuthService, private readonly commands: TelegramCommandService) {}

  async expand(bot: TelegramBot) {
    const events = await this.prisma.notificationEvent.findMany({ where: { expandedAt: null }, take: 50, orderBy: { createdAt: 'asc' } });
    for (const event of events) await this.prisma.$transaction(async tx => {
      if (!(await tx.notificationEvent.updateMany({ where: { id: event.id, expandedAt: null }, data: { expandedAt: new Date() } })).count) return;
      if (event.telegramEpoch !== bot.dispatchEpoch) {
        await tx.notificationEvent.update({ where: { id: event.id }, data: { skippedReason: '停用期间或旧启用世代的事件' } });
        return;
      }
      const incident = await tx.notificationIncident.findUnique({ where: { id: event.incidentId } });
      if (!incident || (!event.payload && (incident.recoveredAt || event.phase === 'RECOVER'))) return;
      const payload = event.payload as unknown as NotificationPayload | null;
      const cardRoute = !payload && incident.entityType === 'ACCOUNT' ? await eventCardRoute(tx, incident.eventType) : null;
      const targets = await tx.telegramTarget.findMany({ where: { botId: bot.botId!, enabled: true, archived: false, verified: true, ...(event.targetId ? { id: event.targetId } : {}) } });
      for (const target of targets) {
        if (payload) {
          const scope = readScope(target.scope);
          const routes = await resultNoticeRoutes(tx, payload, target.id);
          if (!routes.length || !await this.auth.entityAllowed(incident.entityType, incident.entityId, [scope], undefined, tx)) continue;
          for (const part of resultNoticeParts(payload, scope, routes, event.createdAt)) {
            const dedupeKey = resultNoticeKey(event.id, target.id, part.key);
            await tx.telegramDelivery.upsert({ where: { dedupeKey }, create: {
              id: randomUUID(), botId: bot.botId!, epoch: bot.dispatchEpoch, eventId: event.id, incidentId: incident.id,
              targetId: target.id, chatId: target.chatId, threadKey: target.threadKey, kind: part.kind, text: part.text, dedupeKey,
            }, update: {} });
          }
          continue;
        }
        const subscription = await tx.telegramSubscription.findUnique({ where: { targetId_eventType: { targetId: target.id, eventType: incident.eventType } } });
        const inherited = !cardRoute?.explicit && cardRoute?.ids.includes(target.id);
        if (!inherited && !subscription?.enabled) continue;
        if (event.phase === 'REMIND' && (inherited || !subscription?.repeatIntervalMinutes)) continue;
        if (!await this.auth.entityAllowed(incident.entityType, incident.entityId, [readScope(target.scope)], undefined, tx)) continue;
        if (event.phase === 'REMIND' && (incident.recoveredAt || incident.acknowledgedAt)) continue;
        const text = incident.entityType === 'ACCOUNT' ? incident.title : formatIncidentNotice(incident, event.phase);
        await tx.telegramDelivery.upsert({ where: { dedupeKey: hash(`event:${event.id}:${target.id}`) }, create: {
          id: randomUUID(), botId: bot.botId!, epoch: bot.dispatchEpoch, eventId: event.id, incidentId: incident.id,
          targetId: target.id, chatId: target.chatId, threadKey: target.threadKey, kind: incident.entityType === 'ACCOUNT' ? 'ENV_ALERT' : 'NOTICE', text,
          dedupeKey: hash(`event:${event.id}:${target.id}`),
        }, update: {} });
      }
    });
  }

  async reminders(bot: TelegramBot) {
    const incidents = await this.prisma.notificationIncident.findMany({ where: { recoveredAt: null, acknowledgedAt: null, lastAnnouncedEpoch: bot.dispatchEpoch } });
    const subscriptions = await this.prisma.telegramSubscription.findMany({ where: { enabled: true, repeatIntervalMinutes: { gt: 0 } } });
    for (const incident of incidents) for (const subscription of subscriptions.filter(row => row.eventType === incident.eventType)) {
      const slot = Math.floor((Date.now() - incident.occurredAt.getTime()) / (subscription.repeatIntervalMinutes * 60000));
      if (slot < 1) continue;
      const eventKey = hash(`remind:${incident.id}:${subscription.targetId}:${bot.dispatchEpoch}:${slot}`);
      await this.prisma.notificationEvent.upsert({ where: { eventKey }, create: { id: randomUUID(), eventKey, incidentId: incident.id,
        phase: 'REMIND', sourceId: `slot:${slot}`, targetId: subscription.targetId, telegramEpoch: bot.dispatchEpoch }, update: {} });
    }
  }

  async acknowledgeReminder(bot: TelegramBot, callback: CallbackQuery) {
    const message = callback.message;
    const id = callback.data?.slice(reminderConfirmationPrefix.length);
    if (callback.from.is_bot || !message || !id || !callback.data?.startsWith(reminderConfirmationPrefix)) return { text: '提醒已失效' };
    const row = await this.prisma.telegramDelivery.findUnique({ where: { id } });
    const keyboard = row?.buttons as unknown as InlineKeyboardMarkup | null;
    if (!row?.targetId || row.status !== 'SENT' || row.botId !== bot.botId ||
      row.epoch !== bot.dispatchEpoch || row.chatId !== String(message.chat.id) || row.messageId !== message.message_id ||
      !keyboard?.inline_keyboard?.some(line => line.some(button => 'callback_data' in button && button.callback_data === callback.data))) {
      return { text: '提醒已失效' };
    }
    const threadKey = 'message_thread_id' in message ? message.message_thread_id ?? 0 : 0;
    if (row.threadKey !== threadKey) return { text: '提醒已失效' };
    if (!row.incidentId && !row.eventId && ['NOTICE_ROUTE_TEST', 'ENV_ALERT_PREVIEW'].includes(row.kind)) {
      return { confirmed: true, text: '测试消息已确认' };
    }
    if (!row.incidentId || !row.eventId) return { text: '提醒已失效' };
    const [target, binding, incident] = await Promise.all([
      this.prisma.telegramTarget.findUnique({ where: { id: row.targetId } }),
      this.prisma.telegramUserBinding.findUnique({ where: { botId_telegramUserId: { botId: row.botId, telegramUserId: String(callback.from.id) } } }),
      this.prisma.notificationIncident.findUnique({ where: { id: row.incidentId } }),
    ]);
    if (!target?.enabled || !target.verified || target.archived || target.botId !== bot.botId || target.chatId !== row.chatId ||
      target.threadKey !== row.threadKey ||
      !binding?.enabled || !readIds(binding.allowedTargetIds).includes(target.id) || !incident ||
      !await this.auth.allowed(binding.sysUserId, 'notification:update') ||
      !await this.auth.entityAllowed(incident.entityType, incident.entityId, [readScope(target.scope), readScope(binding.scope)], binding.sysUserId)) {
      return { text: '请使用已绑定且有权确认该异常的账号' };
    }
    const result = await this.prisma.notificationIncident.updateMany({
      where: { id: incident.id, recoveredAt: null, acknowledgedAt: null },
      data: { acknowledgedAt: new Date(), acknowledgedBy: binding.sysUserId },
    });
    return { confirmed: true, text: result.count ? '已确认，重复提醒已停止' : '该异常已确认或已恢复' };
  }

  async send(bot: TelegramBot, api: Api, owner: string) {
    // 429 的等待时间覆盖整个 Bot，避免换一条队列消息继续撞限流。
    const coolingDown = await this.prisma.telegramDelivery.findFirst({
      where: { botId: bot.botId!, status: { in: ['RETRY', 'FAILED'] }, error: safeTelegramError({ error_code: 429 }), nextAttemptAt: { gt: new Date() } },
      select: { id: true },
    });
    if (coolingDown) return;
    const due = { botId: bot.botId!, status: { in: ['PENDING', 'RETRY'] }, nextAttemptAt: { lte: new Date() } };
    // 转账二维码时效最短，先于普通消息出队
    const qrRows = await this.prisma.telegramDelivery.findMany({ where: { ...due, kind: 'TRANSFER_QR' }, orderBy: { createdAt: 'asc' }, take: 10 });
    // 测试消息排在积压的正式消息前面，点了「测试发送」不用等前面的通知发完。
    const testRows = await this.prisma.telegramDelivery.findMany({ where: { ...due, kind: { in: TEST_KINDS } }, orderBy: { createdAt: 'asc' }, take: 10 });
    const otherRows = await this.prisma.telegramDelivery.findMany({ where: { ...due, kind: { notIn: ['TRANSFER_QR', ...TEST_KINDS] } }, orderBy: { createdAt: 'asc' }, take: 30 });
    const rows = [...qrRows, ...testRows, ...otherRows];
    let sent = 0;
    for (const row of rows) {
      const current = await this.prisma.telegramBot.findUnique({ where: { id: 'default' } });
      if (!current?.enabled || current.dispatchEpoch !== bot.dispatchEpoch || current.leaseOwner !== owner || !current.leaseUntil || current.leaseUntil < new Date()) return;
      if (row.epoch !== bot.dispatchEpoch) { await this.cancel(row.id, '旧配置世代'); continue; }
      if (Date.now() - (this.chatSentAt.get(row.chatId) ?? 0) < 3000) continue;
      const recent = await this.prisma.telegramDelivery.findFirst({ where: { botId: bot.botId!, chatId: row.chatId, sentAt: { gt: new Date(Date.now() - 3000) } }, select: { id: true } });
      if (recent) continue;
      const prepared = await this.prepare(bot, row);
      if (!prepared) continue;
      const keepPayload = ['CHANNEL_NOTICE', 'CHANNEL_TEST', 'ENV_SUMMARY', 'ENV_SUMMARY_TEST', 'ENV_ALERT_TEST'].includes(row.kind);
      const claimed = await this.prisma.telegramDelivery.updateMany({ where: { id: row.id, kind: row.kind, status: { in: ['PENDING', 'RETRY'] } }, data: { status: 'SENDING',
        ...(row.kind === 'TRANSFER' && row.image && { kind: 'TRANSFER_PHOTO' }), attempts: { increment: 1 }, leaseOwner: owner, leaseUntil: new Date(Date.now() + 30000),
        ...(row.eventId && row.incidentId && { buttons: (row.buttons as Prisma.InputJsonValue | null) ?? Prisma.DbNull }), ...(!keepPayload && { text: prepared }) } });
      if (!claimed.count) continue;
      this.chatSentAt.set(row.chatId, Date.now());
      try {
        const result = await this.dispatch(api, row, prepared, { ...(row.threadKey ? { message_thread_id: row.threadKey } : {}),
          ...(row.buttons ? { reply_markup: row.buttons as unknown as InlineKeyboardMarkup } : {}) });
        await this.prisma.telegramDelivery.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date(), messageId: result.message_id, text: prepared, image: null, leaseOwner: null, leaseUntil: null, error: null } });
        await this.prisma.telegramBot.update({ where: { id: bot.id }, data: { lastSentAt: new Date() } });
      } catch (error) {
        const details = error as { error_code?: number; parameters?: { retry_after?: number; migrate_to_chat_id?: number } };
        if (details.parameters?.migrate_to_chat_id) {
          try {
            await this.migrate(row.chatId, String(details.parameters.migrate_to_chat_id), bot.botId!);
            await this.prisma.telegramDelivery.update({ where: { id: row.id }, data: { status: 'RETRY', nextAttemptAt: new Date(Date.now() + 3000), leaseOwner: null, leaseUntil: null } });
          } catch { await this.prisma.telegramDelivery.update({ where: { id: row.id }, data: { status: 'FAILED', error: '群迁移目标冲突，请重新接入群', leaseOwner: null, leaseUntil: null } }); }
        } else {
          const retry = !!details.error_code && (details.error_code === 429 || details.error_code >= 500) && row.attempts < 4;
          const delay = details.parameters?.retry_after ?? Math.min(300, 5 * 2 ** row.attempts + Math.random() * 3);
          await this.prisma.telegramDelivery.update({ where: { id: row.id }, data: { status: retry ? 'RETRY' : details.error_code ? 'FAILED' : 'UNKNOWN',
            nextAttemptAt: new Date(Date.now() + delay * 1000), error: safeTelegramError(error), leaseOwner: null, leaseUntil: null, ...(retry ? {} : { image: null }) } });
          if (row.targetId && [400, 403].includes(details.error_code ?? 0)) await this.prisma.telegramTarget.updateMany({ where: { id: row.targetId }, data: { enabled: false, lastError: safeTelegramError(error), version: { increment: 1 } } });
        }
      }
      // 每轮最多发 4 条：同群仍间隔 3 秒，不同群可以在同一轮发出；遇到 429 冷却立即停止。
      if (++sent >= 4 || await this.prisma.telegramDelivery.count({ where: { botId: bot.botId!, status: { in: ['RETRY', 'FAILED'] }, error: safeTelegramError({ error_code: 429 }), nextAttemptAt: { gt: new Date() } } })) return;
    }
  }

  // 带图片的投递（转账二维码）用 sendPhoto，文字作为图注（Telegram 图注上限 1024 字）；其余照旧 sendMessage
  private async dispatch(api: Api, row: TelegramDelivery, text: string, options: { message_thread_id?: number; reply_markup?: InlineKeyboardMarkup }) {
    const resultCard = RESULT_CARDS[(row.kind ?? '').replace(/_TEST$/, '')];
    if (resultCard) {
      const image = renderNoticeImage(text, resultCard);
      if (image?.format === 'png' && text.length <= 1024) {
        try {
          return await api.sendPhoto(row.chatId, new InputFile(image.data, 'notice.png'), { ...options, caption: text });
        } catch (error) {
          if ((error as { error_code?: number }).error_code !== 400) throw error;
        }
      }
      return api.sendMessage(row.chatId, text, options);
    }
    // 二维码作废：优先把原二维码消息编辑成作废卡片；编辑失败（消息已删除、内容未变等）就发一张新的作废卡片，再不行才发文字。
    if (row.kind === 'TRANSFER_QR_VOID') {
      if (row.messageId) {
        const edited = await this.editToVoid(api, row.chatId, row.messageId, text).catch(() => null);
        if (edited) return edited;
      }
      const voided = renderNoticeImage(text, VOID_IMAGE);
      if (voided?.format === 'png') return api.sendPhoto(row.chatId, new InputFile(voided.data, 'void.png'), { ...options, caption: text.slice(0, 1024) });
    }
    // 带限制截图的异常卡片仍发截图；旧版没有事件来源的 NOTICE 是通道状态快照，不走异常卡片。画图失败时继续走下面的文字发送。
    if (ALERT_IMAGE_KINDS.has(row.kind ?? '') && !row.image && (row.kind !== 'NOTICE' || row.incidentId)) {
      const image = renderNoticeImage(text, ALERT_IMAGE);
      if (image?.format === 'png') return api.sendPhoto(row.chatId, new InputFile(image.data, 'notice.png'), { ...options, caption: alertCaption(text) });
    }
    const cardImage = CARD_IMAGE_KINDS[row.kind ?? ''];
    if (cardImage) {
      const image = renderNoticeImage(text, cardImage);
      if (image) {
        const file = new InputFile(image.data, 'notice.' + image.format);
        const delivery = { ...options, caption: noticeCaption(text, cardImage.title) };
        return image.format === 'png' ? api.sendPhoto(row.chatId, file, delivery) : api.sendDocument(row.chatId, file, delivery);
      }
    }
    if (row.kind === 'ENV_SUMMARY' || row.kind === 'ENV_SUMMARY_TEST' || row.kind === 'ENV_SUMMARY_PREVIEW') {
      const card = environmentCard(text), entities = card.entities;
      text = card.text;
      if (text.length <= 1024) {
        const cover = new InputFile(join(__dirname, 'environment-cover.png'));
        return api.sendPhoto(row.chatId, cover, { ...options, caption: text, caption_entities: entities });
      }
      return api.sendMessage(row.chatId, text, { ...options, entities });
    }
    if (row.kind === 'CHANNEL_NOTICE' || row.kind === 'CHANNEL_TEST') {
      // 通道状态与环境巡检同版式：封面图加引用块；超过图注上限时退回纯文字，不截断。
      const card = environmentCard(text), entities = card.entities;
      text = card.text;
      if (text.length <= 1024) return api.sendPhoto(row.chatId, new InputFile(join(__dirname, 'channel-cover.png')), { ...options, caption: text, caption_entities: entities });
      return api.sendMessage(row.chatId, text, { ...options, entities });
    }
    if (!row.image) return api.sendMessage(row.chatId, text, options);
    const bytes = Buffer.from(row.image.slice(row.image.indexOf(',') + 1), 'base64');
    const name = row.kind?.startsWith('ENV_ALERT') || row.kind === 'RESTRICTION_EVIDENCE' ? 'environment' : row.kind?.startsWith('TRANSFER_QR') ? 'qr' : 'transfer-result';
    const extension = row.image.startsWith('data:image/png;') ? 'png' : 'jpg';
    if (row.kind === 'RESTRICTION_EVIDENCE') {
      try {
        return await api.sendPhoto(row.chatId, new InputFile(bytes, `${name}.${extension}`), { ...options, caption: text.slice(0, 1024) });
      } catch (error) {
        if ((error as { error_code?: number }).error_code !== 400) throw error;
        return api.sendMessage(row.chatId, `${text}\n巡检截图上传失败`, options);
      }
    }
    return api.sendPhoto(row.chatId, new InputFile(bytes, `${name}.${extension}`), { ...options, caption: text.slice(0, 1024) });
  }

  // 把已发出的二维码消息改成红色「已作废」卡片并去掉按钮；失败由调用方回退为发新消息。
  async editToVoid(api: Api, chatId: string, messageId: number, text: string) {
    const image = renderNoticeImage(text, VOID_IMAGE);
    if (image?.format !== 'png') throw new Error('作废卡片生成失败');
    await api.editMessageMedia(chatId, messageId, { type: 'photo', media: new InputFile(image.data, 'void.png'), caption: text.slice(0, 1024) }, { reply_markup: { inline_keyboard: [] } });
    return { message_id: messageId };
  }

  // 测试失效：只把二维码测试消息改成作废效果，其他消息不处理。
  async revokeSent(api: Api, row: TelegramDelivery) {
    if (!row.messageId) return;
    if (row.kind === 'TRANSFER_QR_TEST') await this.editToVoid(api, row.chatId, row.messageId, formatQrVoid(row.text, true));
  }

  async migrate(oldId: string, newId: string, botId: string) {
    await this.prisma.$transaction(async tx => {
      await tx.telegramTarget.updateMany({ where: { botId, chatId: oldId }, data: { chatId: newId, version: { increment: 1 } } });
      await tx.telegramDelivery.updateMany({ where: { botId, chatId: oldId, status: { in: ['PENDING', 'RETRY', 'SENDING'] } }, data: { chatId: newId } });
    });
  }

  // 二维码最长有效的发送等待时长：取脚本设置里的扫码等待分钟数，和采集端保持一致
  private async qrWaitMs() {
    const setting = await this.prisma.scriptSetting.findUnique({ where: { id: 'default' }, select: { qrWaitMinutes: true } });
    return (setting?.qrWaitMinutes ?? DEFAULT_QR_WAIT_MINUTES) * 60_000;
  }

  private cancel(id: string, error: string) { return this.prisma.telegramDelivery.updateMany({ where: { id, status: { in: ['PENDING', 'RETRY'] } }, data: { status: 'CANCELLED', error, image: null } }); }

  private async prepare(bot: TelegramBot, row: TelegramDelivery) {
    if (!row.targetId) return row.text;
    const target = await this.prisma.telegramTarget.findUnique({ where: { id: row.targetId } });
    if (!target || target.archived || !target.verified || (row.kind !== 'TEST' && !target.enabled) || target.botId !== bot.botId) { await this.cancel(row.id, '目标已停用或失效'); return null; }
    // 旧版快照使用 NOTICE，但没有事件、命令或转账来源。改群后，排队中的快照同样受新名单约束。
    if (row.kind === 'CHANNEL_NOTICE' || (row.kind === 'NOTICE' && !row.eventId && !row.incidentId && !row.transferRequestId && !row.commandExecutionId)) {
      const ids = await noticeTargets(this.prisma);
      if (ids !== null && !ids.includes(target.id)) { await this.cancel(row.id, '该群已移出通道状态接收范围'); return null; }
    }
    if ((row.kind === 'CHANNEL_NOTICE' || row.kind === 'CHANNEL_TEST') && row.text.startsWith(channelSnapshotPrefix)) {
      const text = renderChannelSnapshot(row.text, readScope(target.scope));
      if (!text) await this.cancel(row.id, '群范围内已无可见通道');
      return text && row.kind === 'CHANNEL_TEST' ? '【测试发送】\n' + text : text;
    }
    if (row.kind === 'ENV_SUMMARY' || row.kind === 'ENV_SUMMARY_TEST') {
      const allowed = row.kind === 'ENV_SUMMARY_TEST' || (await noticeTargets(this.prisma, summaryPrefix))?.includes(target.id);
      const text = allowed ? await renderSummary(this.prisma, target, row.text, row.createdAt) : null;
      if (!text) await this.cancel(row.id, '接收群或环境范围已变更');
      return text && row.kind === 'ENV_SUMMARY_TEST' ? '【测试发送】\n' + text : text;
    }
    if (row.kind === 'ENV_ALERT_TEST') {
      const incident = row.incidentId && await this.prisma.notificationIncident.findUnique({ where: { id: row.incidentId } });
      const allowed = incident && !incident.recoveredAt && incident.entityType === 'ACCOUNT' && await this.auth.entityAllowed('ACCOUNT', incident.entityId, [readScope(target.scope)]);
      const card = allowed && await renderEnvironmentAlert(this.prisma, incident.entityId, incident.eventType, incident.title, 'OBSERVE', incident.occurredAt);
      if (!card) { await this.cancel(row.id, '异常已恢复或群范围已变更'); return null; }
      row.image = card.image ?? null;
      return '【测试发送】\n' + card.text;
    }
    if (row.transferRequestId) {
      if (row.kind === 'TRANSFER_TEXT') { await this.cancel(row.id, '结果截图已另行排队'); return null; }
      const resultNotice = row.kind === 'TRANSFER' || row.kind === 'TRANSFER_PHOTO';
      if (resultNotice || row.kind === 'TRANSFER_QR') {
        const ids = await noticeTargets(this.prisma, resultNotice ? transferNoticePrefixes.TRANSFER : transferNoticePrefixes.TRANSFER_QR);
        if (ids !== null && !ids.includes(target.id)) { await this.cancel(row.id, '该群已移出转账通知接收范围'); return null; }
      }
      const transfer = await this.prisma.transferRequest.findUnique({ where: { id: row.transferRequestId } });
      // 二维码只在转账仍在等待扫码时才有意义：转账已结束（成功、失败、超时）或排队过久都不再发送
      if (row.kind === 'TRANSFER_QR' && (transfer?.status !== 'CLAIMED' || Date.now() - row.createdAt.getTime() > await this.qrWaitMs())) { await this.cancel(row.id, '转账已结束或二维码已过期，不再发送'); return null; }
      if (!transfer?.accountId || !await this.auth.entityAllowed('ACCOUNT', transfer.accountId, [readScope(target.scope)])) {
        await this.cancel(row.id, '转账环境不再属于允许范围'); return null;
      }
      if (resultNotice && !row.image) {
        const screenshot = await this.prisma.transferScreenshot.findUnique({ where: { transferId: row.transferRequestId } });
        if (screenshot) {
          const key = transferResultKey(row.transferRequestId, screenshot.result, row.targetId);
          if (row.dedupeKey === key || row.dedupeKey === transferPhotoKey(key)) row.image = screenshot.image;
        }
        if (!row.image) {
          await this.prisma.telegramDelivery.updateMany({
            where: { id: row.id, kind: row.kind, status: { in: ['PENDING', 'RETRY'] } },
            data: { status: 'CANCELLED', error: missingTransferScreenshot, image: null },
          });
          return null;
        }
      }
    }
    if (row.commandExecutionId) {
      const execution = await this.prisma.telegramCommandExecution.findUnique({ where: { id: row.commandExecutionId } });
      try {
        if (!execution) throw new Error('missing');
        const context = await this.commands.context(bot, execution.telegramUserId, target.chatId, target.threadKey, undefined, execution.commandId);
        if (context.binding.version !== execution.bindingVersion || target.version !== execution.targetVersion || context.command.version !== execution.commandVersion) throw new Error('changed');
        if (row.buttons && (!execution.expiresAt || execution.expiresAt < new Date() || execution.status !== 'AWAITING_CONFIRMATION')) throw new Error('expired');
        if (execution.objectId) {
          if (execution.actionKey.startsWith('account.')) {
            if (!await this.auth.entityAllowed('ACCOUNT', execution.objectId, context.scopes)) throw new Error('scope');
          } else {
            const incident = await this.prisma.notificationIncident.findUnique({ where: { id: execution.objectId } });
            if (!incident || !await this.auth.entityAllowed(incident.entityType, incident.entityId, context.scopes, context.user.id)) throw new Error('scope');
          }
        }
      } catch { await this.cancel(row.id, '命令授权或确认已失效'); return null; }
    }
    if (row.incidentId && row.eventId) {
      const incident = await this.prisma.notificationIncident.findUnique({ where: { id: row.incidentId } });
      const event = await this.prisma.notificationEvent.findUnique({ where: { id: row.eventId } });
      if (!incident || !event || !await this.auth.entityAllowed(incident.entityType, incident.entityId, [readScope(target.scope)])) { await this.cancel(row.id, '对象不再属于允许范围'); return null; }
      if (event.payload) {
        const payload = event.payload as unknown as NotificationPayload;
        const routes = await resultNoticeRoutes(this.prisma, payload, target.id);
        const part = routes.length && resultNoticeParts(payload, readScope(target.scope), routes, event.createdAt)
          .find(item => resultNoticeKey(event.id, target.id, item.key) === row.dedupeKey);
        if (!part) { await this.cancel(row.id, '通知接收范围已变更'); return null; }
        row.image = part.image ?? null;
        return part.text;
      }
      if (incident.recoveredAt || event.phase === 'RECOVER') { await this.cancel(row.id, '异常已恢复'); return null; }
      const cardRoute = incident.entityType === 'ACCOUNT' ? await eventCardRoute(this.prisma, incident.eventType) : null;
      const inherited = !cardRoute?.explicit && cardRoute?.ids.includes(target.id);
      const subscription = inherited ? null : await this.prisma.telegramSubscription.findUnique({ where: { targetId_eventType: { targetId: target.id, eventType: incident.eventType } } });
      if (!inherited && !subscription?.enabled) { await this.cancel(row.id, '通知已停用'); return null; }
      if (event.phase === 'REMIND') {
        const preference = await this.prisma.telegramIncidentPreference.findUnique({ where: { incidentId_targetId: { incidentId: incident.id, targetId: target.id } } });
        if (incident.recoveredAt || incident.acknowledgedAt || (preference && preference.mutedUntil > new Date()) || !subscription?.repeatIntervalMinutes) { await this.cancel(row.id, '异常已恢复、确认或静默'); return null; }
      }
      row.buttons = subscription?.repeatIntervalMinutes && !incident.acknowledgedAt && !incident.recoveredAt && event.phase !== 'RECOVER'
        ? reminderKeyboard(row.id) : null;
      if (cardRoute) {
        const card = await renderEnvironmentAlert(this.prisma, incident.entityId, incident.eventType, incident.title, event.phase, incident.occurredAt);
        if (!card) { await this.cancel(row.id, '环境已移除'); return null; }
        row.image = card.image ?? null;
        return card.text;
      }
      return formatIncidentNotice(incident, event.phase);
    }
    return row.text;
  }
}
