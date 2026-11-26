import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma, TelegramBot } from '@prisma/client';
import { Api } from 'grammy';
import type { Update } from 'grammy/types';
import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { hash } from '../notification/notification.types';
import { NotificationService } from '../notification/notification.service';
import { TelegramCommandService } from './telegram-command.service';
import { reminderConfirmationPrefix, reminderKeyboard, TelegramDeliveryService } from './telegram-delivery.service';
import { TelegramTransportService } from './telegram-transport.service';
import { parseCommand, readIds, safeTelegramError } from './telegram-policy';
import { channelOrderMetrics } from '../site/channel-order-metrics';
import { channelCardTemplate, formatChannelNotice, channelSnapshotPrefix, ChannelNoticeSite, noticeTemplate } from './channel-notice';
import { noticePreview } from './notice-preview';
import { object } from './telegram-input';
import { scheduleEnvironmentSummary, queueEnvironment, summaryPrefix } from './environment-notice';
import { getNotificationRoutes } from './notification-routing';
import { activeTemplate, envKind, envTemplate } from './environment-template';
import { noticeTargets, parseNoticeTargets } from './channel-notice-targets';

@Injectable()
export class TelegramRuntimeService implements OnModuleDestroy {
  // 本地启动器记录本次启动标识，确认进程退出后可精确释放它持有的租约。
  private readonly localInstance = /^--epay-instance=([a-f0-9-]{36})$/.exec(process.argv.at(-1) ?? '')?.[1];
  private readonly owner = this.localInstance ? this.localInstance + ':' + process.pid : randomUUID();
  private busy = false;
  private stopping = false;
  private scanAt = 0;
  private cleanupAt = 0;
  private menuRetryAt = 0;
  private rerun = false;
  private api?: Api;
  private credentialsVersion = -1;
  private conflictVersion = -1;
  constructor(private readonly prisma: PrismaService, private readonly transport: TelegramTransportService,
    private readonly commands: TelegramCommandService, private readonly delivery: TelegramDeliveryService, private readonly notifications: NotificationService) {}

  async onModuleDestroy() {
    this.stopping = true;
    await this.prisma.telegramBot.updateMany({ where: { id: 'default', leaseOwner: this.owner }, data: { leaseOwner: null, leaseUntil: null } }).catch(() => undefined);
  }

  @Interval(1000)
  async tick() {
    if (this.busy || this.stopping) return;
    this.busy = true;
    let bot: TelegramBot | null = null;
    let renewal: ReturnType<typeof setInterval> | undefined;
    let leaseLost = false;
    try {
      bot = await this.prisma.telegramBot.findUnique({ where: { id: 'default' } });
      if (!bot?.enabled || !bot.tokenEncrypted || !bot.botId || bot.version === this.conflictVersion) return;
      const lease = await this.prisma.telegramBot.updateMany({ where: { id: bot.id, enabled: true, version: bot.version,
        OR: [{ leaseOwner: this.owner }, { leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, data: { leaseOwner: this.owner, leaseUntil: new Date(Date.now() + 60000), heartbeatAt: new Date() } });
      if (!lease.count) return;
      renewal = setInterval(() => {
        void this.prisma.telegramBot.updateMany({
          where: { id: 'default', leaseOwner: this.owner, enabled: true, version: bot!.version, leaseUntil: { gt: new Date() } },
          data: { leaseUntil: new Date(Date.now() + 60000), heartbeatAt: new Date() },
        }).then(result => { if (!result.count) leaseLost = true; }).catch(() => { leaseLost = true; });
      }, 10000);
      if (!this.api || this.credentialsVersion !== bot.credentialsVersion) {
        const api = this.transport.fromEncrypted(bot.tokenEncrypted);
        const info = await api.getWebhookInfo();
        if (info.url) {
          this.conflictVersion = bot.version;
          await this.prisma.telegramBot.update({ where: { id: bot.id }, data: { lastError: '已有 webhook，未接管其他部署，请处理后重新保存配置' } });
          return;
        }
        this.api = api;
        this.credentialsVersion = bot.credentialsVersion;
      }
      await this.prisma.telegramDelivery.updateMany({ where: { status: 'SENDING', leaseUntil: { lt: new Date() } }, data: { status: 'UNKNOWN', error: '发送进程中断，需确认是否已经送达' } });
      await this.prisma.telegramCommandExecution.updateMany({ where: { status: 'AWAITING_CONFIRMATION', expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED', completedAt: new Date() } });
      await this.prisma.telegramUpdate.updateMany({ where: { botId: bot.botId, status: 'PROCESSING' }, data: { status: 'PENDING' } });
      if (Date.now() - this.scanAt > 30000) {
        await this.notifications.scan();
        await this.delivery.reminders(bot);
        await scheduleEnvironmentSummary(this.prisma, bot, new Date());
        this.scanAt = Date.now();
      }
      await this.delivery.expand(bot);
      await this.scheduleChannelNotices(bot);
      await this.delivery.send(bot, this.api, this.owner);
      await this.syncMenus(bot, this.api);
      if (leaseLost || !await this.ownsLease(bot)) return;
      const updates = await this.api.getUpdates({ offset: bot.nextUpdateOffset, limit: 30, timeout: 1, allowed_updates: ['message', 'callback_query', 'my_chat_member'] });
      if (updates.length) await this.prisma.$transaction(async tx => {
        const owned = await tx.telegramBot.updateMany({ where: { id: bot!.id, version: bot!.version, enabled: true, leaseOwner: this.owner, leaseUntil: { gt: new Date() } }, data: { heartbeatAt: new Date() } });
        if (!owned.count) throw new Error('接收租约已失效');
        for (const update of updates) await tx.telegramUpdate.upsert({ where: { botId_updateId: { botId: bot!.botId!, updateId: update.update_id } },
          create: { id: randomUUID(), botId: bot!.botId!, updateId: update.update_id, epoch: bot!.dispatchEpoch, payload: this.payload(update, bot!.username ?? "") }, update: {} });
        await tx.telegramBot.updateMany({ where: { id: bot!.id, version: bot!.version, leaseOwner: this.owner }, data: { nextUpdateOffset: Math.max(...updates.map(update => update.update_id)) + 1, lastReceivedAt: new Date() } });
      });
      const pending = await this.prisma.telegramUpdate.findMany({ where: { botId: bot.botId, status: 'PENDING' }, orderBy: { updateId: 'asc' }, take: 20 });
      for (const update of pending) {
        if (this.stopping || leaseLost || !await this.ownsLease(bot)) return;
        const current = await this.prisma.telegramBot.findUnique({ where: { id: bot.id } });
        if (!current?.enabled || current.dispatchEpoch !== bot.dispatchEpoch || current.leaseOwner !== this.owner) return;
        if (update.epoch !== bot.dispatchEpoch) { await this.prisma.telegramUpdate.update({ where: { id: update.id }, data: { status: 'EXPIRED' } }); continue; }
        await this.prisma.telegramUpdate.update({ where: { id: update.id }, data: { status: 'PROCESSING' } });
        const payload = update.payload as unknown as Update;
        try {
          const callback = payload.callback_query;
          const reminderCallback = callback?.data?.startsWith(reminderConfirmationPrefix);
          if (callback && reminderCallback) {
            const result = await this.delivery.acknowledgeReminder(bot, callback);
            await this.api.answerCallbackQuery(callback.id, { text: result.text }).catch(() => undefined);
            if (result.confirmed && callback.message) {
              await this.api.editMessageReplyMarkup(callback.message.chat.id, callback.message.message_id, { reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
            }
          } else if (callback) await this.api.answerCallbackQuery(callback.id, { text: '正在校验操作权限' }).catch(() => undefined);
          if (payload.my_chat_member && ['left', 'kicked'].includes(payload.my_chat_member.new_chat_member.status)) {
            await this.prisma.telegramTarget.updateMany({ where: { botId: bot.botId, chatId: String(payload.my_chat_member.chat.id) }, data: { enabled: false, verified: false, version: { increment: 1 }, lastError: 'Bot 已离开群' } });
          }
          if (payload.message?.migrate_to_chat_id) await this.delivery.migrate(String(payload.message.chat.id), String(payload.message.migrate_to_chat_id), bot.botId);
          if (!reminderCallback) await this.commands.handle(bot, payload);
          // 接入码入库前已哈希；处理完成再移除其余命令正文。
          await this.prisma.telegramUpdate.update({ where: { id: update.id }, data: { status: 'DONE', payload: { update_id: update.updateId } } });
        } catch {
          await this.prisma.telegramUpdate.update({ where: { id: update.id }, data: { status: 'FAILED', error: '更新处理失败，请重新发起命令', payload: { update_id: update.updateId } } });
        }
      }
      await this.prisma.telegramBot.updateMany({ where: { id: bot.id, version: bot.version }, data: { heartbeatAt: new Date(), lastError: null } });
      if (Date.now() - this.cleanupAt > 3600000) { await this.cleanup(); this.cleanupAt = Date.now(); }
    } catch (error) {
      if ((error as { error_code?: number }).error_code === 409 && bot) this.conflictVersion = bot.version;
      if (bot) await this.prisma.telegramBot.updateMany({ where: { id: bot.id, version: bot.version }, data: { lastError: safeTelegramError(error) } }).catch(() => undefined);
    } finally {
      if (renewal) clearInterval(renewal);
      this.busy = false;
      // 循环忙碌时提交的测试或通知，本轮结束后立即再跑一轮，不必等下一个 1 秒周期。
      if (this.rerun) { this.rerun = false; void this.tick().catch(() => undefined); }
    }
  }

  private async ownsLease(bot: TelegramBot) {
    return !!await this.prisma.telegramBot.count({ where: { id: bot.id, enabled: true, version: bot.version, leaseOwner: this.owner, leaseUntil: { gt: new Date() } } });
  }

  private async scheduleChannelNotices(bot: TelegramBot) {
    if (!bot.channelStatusNoticeEnabled || !bot.channelStatusNoticeTemplate || !bot.botId) return;
    const interval = bot.channelStatusNoticeIntervalMinutes * 60_000;
    const now = new Date();
    if (bot.channelStatusNoticeSentAt && now.getTime() - bot.channelStatusNoticeSentAt.getTime() < interval) return;
    await this.prisma.$transaction(async tx => {
      const claimed = await tx.telegramBot.updateMany({ where: { id: bot.id, version: bot.version, channelStatusNoticeEnabled: true,
        OR: [{ channelStatusNoticeSentAt: null }, { channelStatusNoticeSentAt: { lte: new Date(now.getTime() - interval) } }] }, data: { channelStatusNoticeSentAt: now } });
      if (!claimed.count) return;
      await this.queueChannelNotices(tx, bot, bot.channelStatusNoticeTemplate, now, String(now.getTime()), 'CHANNEL_NOTICE');
    });
  }

  async testNotificationRoute(key: string) {
    const bot = await this.prisma.telegramBot.findUnique({ where: { id: 'default' } });
    if (!bot?.enabled || !bot.botId || !bot.tokenEncrypted || this.conflictVersion === bot.version) throw new BadRequestException('请确认 Telegram Bot 已启用且连接正常');
    const result = await this.prisma.$transaction(async tx => {
      const route = (await getNotificationRoutes(tx, bot.botId)).find(item => item.key === key);
      if (!route) throw new BadRequestException('通知类型无效');
      const ids = route.targetIds;
      const targets = await tx.telegramTarget.findMany({ where: { botId: bot.botId!, enabled: true, verified: true, archived: false, ...(ids !== null && { id: { in: ids } }) } });
      if (!targets.length) throw new BadRequestException('请先为该通知选择已启用的接收群');
      const now = new Date();
      const recipients = new Map(route.kind === 'event' ? route.recipients.map(item => [item.targetId, item] as const) : []);
      const template = key === 'CHANNEL_NOTICE' ? bot.channelStatusNoticeTemplate || channelCardTemplate
        : key === 'ENV_SUMMARY' ? await activeTemplate(tx, 'summary') : undefined;
      const previews = new Map<boolean, ReturnType<typeof noticePreview>>();
      const rows = targets.flatMap(target => {
        const recipient = recipients.get(target.id);
        const repeats = (recipient?.repeatIntervalMinutes ?? 0) > 0;
        const parts = previews.get(repeats) ?? noticePreview(key, route.label, now, template, repeats);
        previews.set(repeats, parts);
        return parts.map(part => {
          const id = randomUUID();
          return { ...part, id, botId: bot.botId!, epoch: bot.dispatchEpoch, targetId: target.id, chatId: target.chatId, threadKey: target.threadKey,
            dedupeKey: hash(`notice-test:${id}`), ...(repeats && { buttons: reminderKeyboard(id) }),
          };
        });
      });
      const messages = await tx.telegramDelivery.createMany({ data: rows });
      return { messages: messages.count, targets: targets.length, ids: rows.map(row => row.id) };
    });
    this.wake();
    return result;
  }

  async testEnvironmentNotice(input: unknown) {
    const body = object(input, ['kind','template','targetIds']);
    const kind = envKind(body.kind), template = envTemplate(kind, body.template);
    const draft = body.targetIds === undefined ? undefined : readIds(body.targetIds);
    const bot = await this.prisma.telegramBot.findUnique({ where: { id: 'default' } });
    if (!bot?.enabled || !bot.botId || !bot.tokenEncrypted || this.conflictVersion === bot.version) throw new BadRequestException('请确认 Telegram Bot 已启用且连接正常');
    const result = await this.prisma.$transaction(async tx => {
      if (draft) {
        if (!draft.length) throw new BadRequestException('请先选择接收群');
        return queueEnvironment(tx, bot, new Date(), draft, template, true);
      }
      const ids = await noticeTargets(tx, summaryPrefix) ?? [];
      if (!ids.length) throw new BadRequestException('请先在通知发送设置中配置接收群');
      return queueEnvironment(tx, bot, new Date(), ids, template, true, false);
    });
    if (!result.messages) throw new BadRequestException('所选群范围内暂无环境，未发送');
    this.wake();
    return result;
  }
  async testChannelNotice(input: unknown) {
    const body = object(input, ['template', 'targetIds']);
    const template = noticeTemplate(body.template);
    const draft = body.targetIds === undefined ? undefined : parseNoticeTargets(body.targetIds);
    const bot = await this.prisma.telegramBot.findUnique({ where: { id: 'default' } });
    if (!bot?.enabled || !bot.botId || !bot.tokenEncrypted) throw new BadRequestException('请先配置并启用 Telegram Bot');
    if (this.conflictVersion === bot.version) throw new BadRequestException('Bot 存在接入冲突，请检查 Bot 设置');
    const result = await this.prisma.$transaction(tx => this.queueChannelNotices(tx, bot, template, new Date(), randomUUID(), 'CHANNEL_TEST', draft));
    if (!result.messages) throw new BadRequestException('没有可发送的通道，请检查群是否已验证并启用，以及群范围内是否有已同步的通道');
    // 空闲时立即唤起投递；已有工作循环时记下来，本轮结束后马上再跑；其他实例持有租约时，由持有者继续发送。
    this.wake();
    return result;
  }

  // 唤起投递：空闲时立即跑一轮；忙碌时记下来，本轮结束后马上再跑。
  private wake() {
    if (this.busy) this.rerun = true;
    else void this.tick().catch(() => undefined);
  }

  // 测试失效：只处理二维码测试消息，防止借此改动正式通知。没发出的直接取消，已发出的改成作废卡片。
  async revokeNotificationTest(input: unknown) {
    const ids = readIds(object(input, ['ids']).ids);
    const bot = await this.prisma.telegramBot.findUnique({ where: { id: 'default' } });
    if (!bot?.botId || !bot.tokenEncrypted) throw new BadRequestException('请先配置并启用 Telegram Bot');
    const rows = await this.prisma.telegramDelivery.findMany({ where: { id: { in: ids }, botId: bot.botId, kind: 'TRANSFER_QR_TEST' } });
    const cancelled = await this.prisma.telegramDelivery.updateMany({ where: { id: { in: rows.map(row => row.id) }, status: { in: ['PENDING', 'RETRY'] } }, data: { status: 'CANCELLED', error: '测试已撤销', image: null } });
    const api = this.api ?? this.transport.fromEncrypted(bot.tokenEncrypted);
    let revoked = 0, failed = 0;
    for (const row of rows.filter(item => item.status === 'SENT' && item.messageId)) {
      try { await this.delivery.revokeSent(api, row); revoked++; } catch { failed++; }
    }
    return { cancelled: cancelled.count, revoked, failed, sending: rows.filter(item => item.status === 'SENDING').length };
  }

  private async queueChannelNotices(tx: Prisma.TransactionClient, bot: TelegramBot, template: string, now: Date, batch: string, kind: 'CHANNEL_NOTICE' | 'CHANNEL_TEST', draft?: string[] | null) {
    const ids = draft === undefined ? await noticeTargets(tx) : draft;
    const targets = await tx.telegramTarget.findMany({ where: { botId: bot.botId!, enabled: true, verified: true, archived: false, ...(ids !== null && { id: { in: ids } }) } });
    if (!targets.length) return { messages: 0, targets: 0 };
    const sites = await tx.epaySite.findMany({ where: { activeSyncId: { not: null } }, include: { channels: { where: { sourceVersion: { not: null } }, orderBy: { code: 'asc' } } } });
    const snapshots: ChannelNoticeSite[] = [];
    for (const site of sites) {
      if (!site.channels.length) continue;
      const metrics = await channelOrderMetrics(tx, site, site.channels.map(row => row.code), now);
      snapshots.push({ siteId: site.id, messages: site.channels.map(channel =>
        formatChannelNotice(template, site.name, channel, metrics.get(channel.code))) });
    }
    const rows: Prisma.TelegramDeliveryCreateManyInput[] = [];
    for (const target of targets) {
      const scope = target.scope as { all?: boolean; siteIds?: string[] };
      const visible = snapshots.filter(site => scope.all || scope.siteIds?.includes(site.siteId));
      if (!visible.length) continue;
      rows.push({ id: randomUUID(), botId: bot.botId!, epoch: bot.dispatchEpoch,
        dedupeKey: hash(`channel-status:${bot.dispatchEpoch}:${batch}:${target.id}`),
        targetId: target.id, chatId: target.chatId, threadKey: target.threadKey, kind,
        text: channelSnapshotPrefix + JSON.stringify(visible) });
    }
    if (rows.length) await tx.telegramDelivery.createMany({ data: rows, skipDuplicates: true });
    return { messages: rows.length, targets: new Set(rows.map(row => row.targetId)).size };
  }

  private payload(update: Update, username: string): Prisma.InputJsonValue {
    // 仅存处理所需字段，避免把群聊天、联系人或附件归档到中心。
    const message = update.message;
    const command = message?.text ? parseCommand(message.text, username) : null;
    const commandText = command && ['bind', 'connect'].includes(command.name)
      ? '/' + command.name + ' ' + command.args.map(hash).join(' ')
      : command ? message!.text?.slice(0, 1024) : undefined;
    if (message) return JSON.parse(JSON.stringify({ update_id: update.update_id, message: { message_id: message.message_id, date: message.date,
      chat: message.chat, from: message.from, sender_chat: message.sender_chat, message_thread_id: message.message_thread_id,
      text: commandText, migrate_to_chat_id: message.migrate_to_chat_id } }));
    if (update.callback_query) {
      const callback = update.callback_query;
      return JSON.parse(JSON.stringify({ update_id: update.update_id, callback_query: { id: callback.id, from: callback.from, data: callback.data, chat_instance: callback.chat_instance,
        message: callback.message ? { message_id: callback.message.message_id, date: callback.message.date, chat: callback.message.chat,
          ...('message_thread_id' in callback.message ? { message_thread_id: callback.message.message_thread_id } : {}) } : undefined } }));
    }
    return JSON.parse(JSON.stringify(update.my_chat_member ? { update_id: update.update_id, my_chat_member: update.my_chat_member } : { update_id: update.update_id }));
  }

  private async syncMenus(bot: TelegramBot, api: Api) {
    if (bot.menuVersion === bot.menuSyncedVersion || Date.now() < this.menuRetryAt) return;
    try {
      const commands = await this.prisma.telegramCommand.findMany({ where: { botId: bot.botId!, enabled: true } });
      const targets = await this.prisma.telegramTarget.findMany({ where: { botId: bot.botId! } });
      await api.setMyCommands([{ command: 'bind', description: '使用后台生成的绑定码绑定本人身份' }], { scope: { type: 'all_private_chats' } });
      await api.setMyCommands([{ command: 'connect', description: '使用后台接入码连接当前群' }], { scope: { type: 'all_group_chats' } });
      for (const chatId of [...new Set(targets.map(target => target.chatId))]) {
        if (!await this.ownsLease(bot)) return;
        const allowed = targets.filter(target => target.chatId === chatId && target.enabled && target.verified && !target.archived).map(target => target.id);
        const menu = commands.filter(command => readIds(command.allowedTargetIds).some(id => allowed.includes(id))).map(command => ({ command: command.name, description: command.description }));
        await api.setMyCommands(menu, { scope: { type: 'chat', chat_id: chatId } });
      }
      await this.prisma.telegramBot.updateMany({ where: { id: bot.id, menuVersion: bot.menuVersion }, data: { menuSyncedVersion: bot.menuVersion, menuError: null } });
    } catch (error) {
      this.menuRetryAt = Date.now() + 60000;
      await this.prisma.telegramBot.updateMany({ where: { id: bot.id, version: bot.version }, data: { menuError: safeTelegramError(error) } });
    }
  }

  private async cleanup() {
    await this.prisma.telegramChallenge.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86400000) } } });
    await this.prisma.telegramUpdate.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 86400000) }, status: { in: ['DONE', 'FAILED', 'EXPIRED'] } } });
    await this.prisma.telegramDelivery.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400000) }, status: { in: ['SENT', 'FAILED', 'CANCELLED'] } } });
    await this.prisma.telegramCommandExecution.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400000) }, status: { in: ['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'] } } });
  }
}
