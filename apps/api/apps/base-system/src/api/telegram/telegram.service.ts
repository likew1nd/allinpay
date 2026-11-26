import { randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { encryptSiteSecret } from '../site/site-credentials';
import { EVENT_LABELS, hash } from '../notification/notification.types';
import { ACTIONS, commandNameValid, readIds, readScope, safeTelegramError } from './telegram-policy';
import { boolean, integer, object, page, text } from './telegram-input';
import { TelegramTransportService } from './telegram-transport.service';
import { TelegramAuthService } from './telegram-auth.service';

import { channelCardTemplate, noticePresets, noticeTemplate } from './channel-notice';
import { noticeTargets, parseNoticeTargets, saveNoticeTargets } from './channel-notice-targets';
import { intervalKey, summaryPrefix } from './environment-notice';
import { getNotificationRoutes, saveNotificationRoute } from './notification-routing';
import { activeTemplate, envKind, envPresets, envTemplate, libraryPrefix, templateKey, templateLibrary } from './environment-template';

const pending = ['PENDING', 'RETRY'];
const json = (value: unknown) => value as Prisma.InputJsonValue;


@Injectable()
export class TelegramService {
  constructor(private readonly prisma: PrismaService, private readonly transport: TelegramTransportService, private readonly auth: TelegramAuthService) {}
  async bot() {
    return this.prisma.telegramBot.upsert({
      where: { id: 'default' },
      create: { id: 'default', channelStatusNoticeTemplate: channelCardTemplate, channelStatusNoticeSavedTemplates: '[]' },
      update: {},
    });
  }
  async config() {
    const { tokenEncrypted, leaseOwner, leaseUntil, nextUpdateOffset, ...row } = await this.bot();
    return { ...row, hasToken: !!tokenEncrypted, state: !tokenEncrypted ? 'UNCONFIGURED' : !row.enabled ? 'DISABLED' : row.lastError ? 'ERROR' : leaseUntil && leaseUntil > new Date() ? 'RUNNING' : 'CONNECTING', eventTypes: EVENT_LABELS };
  }
  async notificationRoutes() {
    const bot = await this.bot();
    return this.prisma.$transaction(tx => getNotificationRoutes(tx, bot.botId));
  }
  async saveNotificationRoute(key: string, input: unknown) {
    const bot = await this.bot();
    await this.prisma.$transaction(tx => saveNotificationRoute(tx, bot.botId, key, input));
    return { saved: true };
  }
  async environmentNoticeConfig() {
    const [interval, summary, summaryTemplate, library] = await this.prisma.$transaction(async tx => Promise.all([
      tx.systemSetting.findUnique({ where: { key: intervalKey } }), noticeTargets(tx, summaryPrefix),
      activeTemplate(tx, 'summary'), templateLibrary(tx, 'summary'),
    ]));
    return { intervalMinutes: Number(interval?.value ?? 15), summaryTargetIds: summary ?? [], summaryTemplate, presets: { summary: envPresets.summary }, savedTemplates: { summary: library } };
  }
  async editEnvironmentTemplate(input: unknown, remove = false) {
    const body = object(input, remove ? ['kind','name'] : ['kind','name','template']);
    const kind = envKind(body.kind), name = text(body.name, 40), key = libraryPrefix(kind) + name;
    if (remove) await this.prisma.systemSetting.deleteMany({ where: { key } });
    else {
      const value = envTemplate(kind, body.template);
      await this.prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    return templateLibrary(this.prisma, kind);
  }
  async saveEnvironmentNoticeConfig(input: unknown) {
    const body = object(input, ['intervalMinutes', 'summaryTargetIds', 'summaryTemplate']);
    const value = String(integer(body.intervalMinutes, 1, 1440));
    const summary = body.summaryTargetIds === undefined ? undefined : readIds(body.summaryTargetIds);
    await this.prisma.$transaction(async tx => {
      await tx.systemSetting.upsert({ where: { key: intervalKey }, create: { key: intervalKey, value }, update: { value } });
      const bot = await tx.telegramBot.findUnique({ where: { id: 'default' }, select: { botId: true } });
      if (summary !== undefined) await saveNoticeTargets(tx, bot?.botId ?? null, summary, summaryPrefix);
      if (body.summaryTemplate !== undefined) {
        const key = templateKey('summary'), value = envTemplate('summary', body.summaryTemplate);
        await tx.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
      }
    });
    return this.environmentNoticeConfig();
  }
  async channelNoticeConfig() {
    const bot = await this.bot();
    return { enabled: bot.channelStatusNoticeEnabled, intervalMinutes: bot.channelStatusNoticeIntervalMinutes, targetIds: await noticeTargets(this.prisma), template: bot.channelStatusNoticeTemplate, presets: noticePresets, savedTemplates: this.readChannelNoticeTemplates(bot.channelStatusNoticeSavedTemplates) };
  }
  async saveChannelNoticeConfig(input: unknown) {
    const body = object(input, ['enabled', 'intervalMinutes', 'template', 'targetIds']);
    const enabled = boolean(body.enabled), intervalMinutes = integer(body.intervalMinutes, 1, 1440);
    const template = noticeTemplate(body.template);
    await this.prisma.$transaction(async tx => {
      const bot = await tx.telegramBot.update({ where: { id: 'default' }, data: { channelStatusNoticeEnabled: enabled, channelStatusNoticeIntervalMinutes: intervalMinutes, channelStatusNoticeTemplate: template } });
      if (body.targetIds !== undefined) await saveNoticeTargets(tx, bot.botId, parseNoticeTargets(body.targetIds));
    });
    return this.channelNoticeConfig();
  }
  async saveChannelNoticeTemplate(input: unknown) {
    const body = object(input, ['name', 'template']);
    const name = text(body.name, 40), template = noticeTemplate(body.template);
    const bot = await this.bot();
    const saved = this.readChannelNoticeTemplates(bot.channelStatusNoticeSavedTemplates);
    if (!saved.some(item => item.name === name) && saved.length >= 30) throw new BadRequestException('自定义模板最多保存 30 套');
    const next = [...saved.filter(item => item.name !== name), { name, template }];
    await this.writeTemplates(bot.channelStatusNoticeSavedTemplates, next);
    return this.channelNoticeConfig();
  }
  async deleteChannelNoticeTemplate(input: unknown) {
    const body = object(input, ['name']), name = text(body.name, 40), bot = await this.bot();
    const saved = this.readChannelNoticeTemplates(bot.channelStatusNoticeSavedTemplates).filter(item => item.name !== name);
    await this.writeTemplates(bot.channelStatusNoticeSavedTemplates, saved);
    return this.channelNoticeConfig();
  }
  private async writeTemplates(previous: string, templates: { name: string; template: string }[]) {
    const result = await this.prisma.telegramBot.updateMany({ where: { id: 'default', channelStatusNoticeSavedTemplates: previous }, data: { channelStatusNoticeSavedTemplates: JSON.stringify(templates) } });
    if (!result.count) throw new ConflictException('模板库已变更，请刷新后重试');
  }

  private readChannelNoticeTemplates(value: string) {
    try {
      const rows: unknown = JSON.parse(value);
      return Array.isArray(rows) ? rows.filter((row): row is { name: string; template: string } =>
        !!row && typeof row.name === 'string' && typeof row.template === 'string') : [];
    } catch { return []; }
  }
  async saveConfig(input: unknown) {
    const body = object(input, ['version', 'enabled', 'token', 'replaceBot']);
    const version = integer(body.version), enabled = boolean(body.enabled);
    const current = await this.bot();
    if (current.version !== version) throw new ConflictException('配置已变更，请刷新后保存');
    let identity: { id: number; username?: string; first_name: string } | undefined;
    const token = body.token === undefined || body.token === '' ? undefined : text(body.token, 256);
    if (token) {
      try { identity = await this.transport.fromToken(token).getMe(); }
      catch { throw new BadRequestException('Bot Token 无效或 Telegram 网络不可达'); }
    }
    if (enabled && !token && !current.tokenEncrypted) throw new BadRequestException('请先设置 Bot Token');
    const changedBot = !!identity && !!current.botId && current.botId !== String(identity.id);
    if (changedBot && body.replaceBot !== true) throw new ConflictException('机器人身份已变化，请明确确认更换机器人');
    await this.prisma.$transaction(async tx => {
      const fenced = await tx.telegramBot.updateMany({ where: { id: 'default', version }, data: {
        enabled, version: { increment: 1 }, menuVersion: { increment: 1 }, lastError: null,
        ...(token && identity ? { tokenEncrypted: encryptSiteSecret('telegram-default', 'telegram-bot-token', token), botId: String(identity.id), username: identity.username, displayName: identity.first_name, credentialsVersion: { increment: 1 }, lastCheckedAt: new Date() } : {}),
        ...((enabled !== current.enabled || changedBot) ? { dispatchEpoch: { increment: 1 }, enabledAt: enabled ? new Date() : null } : {}),
        ...(changedBot ? { nextUpdateOffset: 0, menuSyncedVersion: -1 } : {}),
      } });
      if (!fenced.count) throw new ConflictException('配置已变更，请刷新后保存');
      if (!enabled || changedBot) {
        await tx.telegramDelivery.updateMany({ where: { status: { in: pending } }, data: { status: 'CANCELLED', error: '配置停用或机器人已更换' } });
        await tx.telegramCommandExecution.updateMany({ where: { status: 'AWAITING_CONFIRMATION' }, data: { status: 'CANCELLED', completedAt: new Date() } });
      }
      if (changedBot) {
        await tx.telegramTarget.updateMany({ data: { enabled: false, verified: false, version: { increment: 1 } } });
        await tx.telegramUserBinding.updateMany({ data: { enabled: false, version: { increment: 1 } } });
      }
      const botId = identity ? String(identity.id) : current.botId;
      if (botId) for (const action of ACTIONS) await tx.telegramCommand.upsert({ where: { botId_name: { botId, name: action.command } }, create: {
        id: randomUUID(), botId, name: action.command, description: action.name, actionKey: action.key,
        enabled: false, allowedTargetIds: [], allowedBindingIds: [], defaults: {}, confirmRequired: action.confirm,
      }, update: {} });
    });
    return this.config();
  }
  async connectionTest() {
    const bot = await this.bot();
    if (!bot.tokenEncrypted) throw new BadRequestException('请先保存 Token');
    try {
      const api = this.transport.fromEncrypted(bot.tokenEncrypted);
      const me = await api.getMe();
      const webhook = await api.getWebhookInfo();
      if (String(me.id) !== bot.botId) throw new BadRequestException('Bot 身份不一致，请重新保存 Token');
      const message = webhook.url ? '检测到已有 webhook，请先处理其他部署的接收配置' : null;
      await this.prisma.telegramBot.updateMany({ where: { id: bot.id, version: bot.version }, data: { lastCheckedAt: new Date(), lastError: message } });
      return { success: !message, message: message ?? 'Bot 连接正常；尚未向群发送消息' };
    } catch (error) { throw new BadRequestException(safeTelegramError(error)); }
  }
  async targets() { const bot = await this.bot(); return this.prisma.telegramTarget.findMany({ where: { botId: bot.botId ?? '', archived: false }, orderBy: { createdAt: 'asc' } }); }
  async saveTarget(id: string, input: unknown) {
    const body = object(input, ['version', 'name', 'enabled', 'scope']);
    const bot = await this.bot();
    const enabled = boolean(body.enabled), scope = readScope(body.scope);
    const result = await this.prisma.telegramTarget.updateMany({ where: { id, botId: bot.botId ?? '', version: integer(body.version), archived: false, verified: true }, data: { name: text(body.name), enabled, scope: json(scope), version: { increment: 1 }, lastError: null } });
    if (!result.count) throw new ConflictException('群已变更或需重新接入');
    await this.prisma.telegramBot.update({ where: { id: bot.id }, data: { menuVersion: { increment: 1 } } });
    if (!enabled) await this.prisma.telegramDelivery.updateMany({ where: { targetId: id, status: { in: pending } }, data: { status: 'CANCELLED' } });
    return { saved: true };
  }
  async target(id: string) {
    const bot = await this.bot();
    const target = await this.prisma.telegramTarget.findFirst({ where: { id, botId: bot.botId ?? '', archived: false } });
    if (!target) throw new NotFoundException('目标群不存在');
    return target;
  }
  async deleteTarget(id: string) {
    await this.target(id);
    await this.prisma.$transaction(async tx => {
      await tx.telegramTarget.update({ where: { id }, data: { archived: true, enabled: false, version: { increment: 1 } } });
      await tx.telegramDelivery.updateMany({ where: { targetId: id, status: { in: pending } }, data: { status: 'CANCELLED' } });
      await tx.telegramBot.update({ where: { id: 'default' }, data: { menuVersion: { increment: 1 } } });
    });
    return { archived: true };
  }
  async testTarget(id: string) {
    const bot = await this.bot(), target = await this.target(id);
    if (!bot.enabled || !target.verified) throw new BadRequestException('请先启用 Bot 并完成群接入');
    const row = await this.prisma.telegramDelivery.create({ data: { id: randomUUID(), botId: bot.botId!, epoch: bot.dispatchEpoch, dedupeKey: hash(randomUUID()), targetId: id,
      chatId: target.chatId, threadKey: target.threadKey, kind: 'TEST', text: '【测试通知】Telegram 群连接测试，请在后台查看投递结果。' } });
    return { id: row.id, status: row.status };
  }
  async subscriptions(id: string) { await this.target(id); return this.prisma.telegramSubscription.findMany({ where: { targetId: id } }); }
  async saveSubscriptions(id: string, input: unknown) {
    const target = await this.target(id);
    const body = object(input, ['version', 'subscriptions']);
    if (!Array.isArray(body.subscriptions) || body.subscriptions.length > Object.keys(EVENT_LABELS).length) throw new BadRequestException('订阅列表无效');
    const seen = new Set<string>();
    const data = body.subscriptions.map(item => {
      const rule = object(item, ['eventType', 'enabled', 'repeatIntervalMinutes', 'sendRecovery']);
      const eventType = text(rule.eventType), minutes = integer(rule.repeatIntervalMinutes, 0, 10080);
      if (!EVENT_LABELS[eventType] || seen.has(eventType)) throw new BadRequestException('事件类型无效或重复');
      seen.add(eventType);
      return { id: randomUUID(), targetId: id, eventType, enabled: boolean(rule.enabled), repeatIntervalMinutes: minutes };
    });
    await this.prisma.$transaction(async tx => {
      if (!(await tx.telegramTarget.updateMany({ where: { id, version: integer(body.version), botId: target.botId }, data: { version: { increment: 1 } } })).count) throw new ConflictException('群配置已变更');
      await tx.telegramSubscription.deleteMany({ where: { targetId: id } });
      if (data.length) await tx.telegramSubscription.createMany({ data });
    });
    return { saved: true };
  }
  async challenge(type: 'BIND' | 'CONNECT', userId: string) {
    const bot = await this.bot();
    if (!bot.enabled || !bot.botId) throw new BadRequestException('请先开启 Bot 连接');
    const user = await this.prisma.sysUser.findUnique({ where: { id: userId } });
    if (user?.status !== 'ENABLED') throw new BadRequestException('用户不可用');
    const binding = await this.prisma.telegramUserBinding.findUnique({ where: { botId_sysUserId: { botId: bot.botId, sysUserId: userId } } });
    if (type === 'CONNECT' && !binding) throw new BadRequestException('请先在私聊中绑定自己的 TG 用户');
    const code = randomBytes(24).toString('base64url'), expiresAt = new Date(Date.now() + 600000);
    await this.prisma.telegramChallenge.create({ data: { id: randomUUID(), botId: bot.botId, type, codeHash: hash(code), sysUserId: userId, expectedTelegramId: type === 'CONNECT' ? binding!.telegramUserId : null, expiresAt } });
    return { command: `/${type === 'BIND' ? 'bind' : 'connect'}@${bot.username} ${code}`, expiresAt };
  }
  async bindings() { const bot = await this.bot(); return this.prisma.telegramUserBinding.findMany({ where: { botId: bot.botId ?? '' }, orderBy: { createdAt: 'asc' } }); }
  async saveBinding(id: string, input: unknown) {
    const body = object(input, ['version', 'enabled', 'allowedTargetIds', 'scope']);
    const bot = await this.bot(), allowedTargetIds = readIds(body.allowedTargetIds);
    await this.validateTargets(allowedTargetIds);
    if (!(await this.prisma.telegramUserBinding.updateMany({ where: { id, botId: bot.botId ?? '', version: integer(body.version) }, data: {
      enabled: boolean(body.enabled), allowedTargetIds, scope: json(readScope(body.scope)), version: { increment: 1 },
    } })).count) throw new ConflictException('绑定已变更，请刷新');
    return { saved: true };
  }
  async deleteBinding(id: string) {
    const bot = await this.bot();
    await this.prisma.$transaction(async tx => {
      await tx.telegramCommandExecution.updateMany({ where: { bindingId: id, status: 'AWAITING_CONFIRMATION' }, data: { status: 'CANCELLED' } });
      await tx.telegramUserBinding.deleteMany({ where: { id, botId: bot.botId ?? '' } });
    });
    return { deleted: true };
  }
  async validateTargets(ids: string[]) {
    const bot = await this.bot();
    if (await this.prisma.telegramTarget.count({ where: { id: { in: ids }, botId: bot.botId ?? '', archived: false } }) !== ids.length) throw new BadRequestException('包含无效目标群');
  }
  async commands() { const bot = await this.bot(); return this.prisma.telegramCommand.findMany({ where: { botId: bot.botId ?? '' }, orderBy: { createdAt: 'asc' } }); }
  async saveCommand(id: string | undefined, input: unknown) {
    const body = object(input, ['version', 'name', 'description', 'actionKey', 'enabled', 'allowedTargetIds', 'allowedBindingIds', 'confirmRequired', 'defaults']);
    const bot = await this.bot();
    if (!bot.botId) throw new BadRequestException('请先配置 Bot');
    const name = text(body.name, 32), actionKey = text(body.actionKey), action = ACTIONS.find(item => item.key === actionKey);
    if (!commandNameValid(name) || !action) throw new BadRequestException('命令名或业务动作无效');
    const allowedTargetIds = readIds(body.allowedTargetIds), allowedBindingIds = readIds(body.allowedBindingIds);
    await this.validateTargets(allowedTargetIds);
    if (await this.prisma.telegramUserBinding.count({ where: { id: { in: allowedBindingIds }, botId: bot.botId } }) !== allowedBindingIds.length) throw new BadRequestException('包含无效操作人');
    const defaults = object(body.defaults ?? {}, actionKey === 'incident.mute' ? ['minutes'] : []);
    if (defaults.minutes !== undefined) integer(defaults.minutes, 1, 1440);
    const data = { name, description: text(body.description, 256), actionKey, enabled: boolean(body.enabled), allowedTargetIds, allowedBindingIds, defaults: json(defaults), confirmRequired: action.confirm || boolean(body.confirmRequired) };
    await this.prisma.$transaction(async tx => {
      if (!id && await tx.telegramCommand.count({ where: { botId: bot.botId! } }) >= 100) throw new BadRequestException('命令数量不能超过 100');
      if (id) {
        if (!(await tx.telegramCommand.updateMany({ where: { id, botId: bot.botId!, version: integer(body.version) }, data: { ...data, version: { increment: 1 } } })).count) throw new ConflictException('命令已变更');
      } else await tx.telegramCommand.create({ data: { id: randomUUID(), botId: bot.botId!, ...data } });
      await tx.telegramBot.update({ where: { id: bot.id }, data: { menuVersion: { increment: 1 } } });
    }).catch(error => { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('命令名称已存在'); throw error; });
    return { saved: true };
  }
  async deleteCommand(id: string) {
    const bot = await this.bot();
    await this.prisma.$transaction(async tx => {
      await tx.telegramCommand.deleteMany({ where: { id, botId: bot.botId ?? '' } });
      await tx.telegramCommandExecution.updateMany({ where: { commandId: id, status: 'AWAITING_CONFIRMATION' }, data: { status: 'CANCELLED' } });
      await tx.telegramBot.update({ where: { id: bot.id }, data: { menuVersion: { increment: 1 } } });
    });
    return { deleted: true };
  }
  async records(kind: 'deliveries' | 'executions', query: Record<string, unknown>, userId: string) {
    const pagination = page(query);
    const where = { ...(query.targetId ? { targetId: text(query.targetId) } : {}), ...(query.status ? { status: text(query.status) } : {}),
      ...(query.from || query.to ? { createdAt: this.dateRange(query) } : {}) };
    if (kind === 'executions') {
      const [records, total] = await Promise.all([this.prisma.telegramCommandExecution.findMany({ where, skip: pagination.skip, take: pagination.take, orderBy: { createdAt: 'desc' } }), this.prisma.telegramCommandExecution.count({ where })]);
      const canRead = await this.auth.allowed(userId, 'account:read') && await this.auth.allowed(userId, 'collector:read') && await this.auth.allowed(userId, 'adjustment:read');
      return { ...pagination, total, records: records.map(({ confirmTokenHash, params, result, objectId, ...row }) => ({ ...row, objectId: canRead ? objectId : undefined, result: canRead ? result : undefined })) };
    }
    const [records, total] = await Promise.all([this.prisma.telegramDelivery.findMany({ where, skip: pagination.skip, take: pagination.take, orderBy: { createdAt: 'desc' }, omit: { image: true } }), this.prisma.telegramDelivery.count({ where })]);
    const canRead = await this.auth.allowed(userId, 'account:read') && await this.auth.allowed(userId, 'collector:read') && await this.auth.allowed(userId, 'adjustment:read');
    return { ...pagination, total, records: records.map(({ buttons, text: content, leaseOwner, leaseUntil, ...row }) => ({ ...row, text: canRead || row.kind === 'TEST' ? (row.kind.startsWith('ENV_SUMMARY') && row.status !== 'SENT' ? '环境巡检摘要' : content) : undefined })) };
  }
  private dateRange(query: Record<string, unknown>) {
    const from = query.from ? new Date(text(query.from)) : undefined, to = query.to ? new Date(text(query.to)) : undefined;
    if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime())) || (from && to && from > to)) throw new BadRequestException('时间范围无效');
    return { gte: from, lte: to };
  }
  async retry(id: string, input: unknown) {
    const body = object(input ?? {}, ['confirmDuplicate']);
    const bot = await this.bot();
    const row = await this.prisma.telegramDelivery.findUnique({ where: { id } });
    if (!row || !bot.enabled || row.botId !== bot.botId || !['FAILED', 'UNKNOWN'].includes(row.status) || row.epoch !== bot.dispatchEpoch) throw new BadRequestException('该消息不可重试');
    // 转账二维码有时效且发送后图片已清空，重试只会发出没有图的残缺消息，禁止重试
    if (row.kind === 'TRANSFER_QR') throw new BadRequestException('转账二维码有时效，不可重试');
    if (row.status === 'UNKNOWN' && body.confirmDuplicate !== true) throw new BadRequestException('消息可能已发送，请先确认重复风险');
    await this.prisma.telegramDelivery.updateMany({ where: { id, status: row.status }, data: { status: 'PENDING', epoch: bot.dispatchEpoch, nextAttemptAt: new Date(), error: null } });
    return { queued: true };
  }
}
