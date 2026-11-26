import { randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, TelegramBot, TelegramCommandExecution } from '@prisma/client';
import type { Update, Message, CallbackQuery } from 'grammy/types';
import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { AccountService } from '../account/account.service';
import { hash } from '../notification/notification.types';
import { ACTIONS, accountWhere, collectorWhere, EMPTY_SCOPE, parseCommand, readIds, readScope } from './telegram-policy';
import { TelegramAuthService } from './telegram-auth.service';

type CommandContext = Awaited<ReturnType<TelegramCommandService['context']>>;
const json = (value: unknown) => value as Prisma.InputJsonValue;

@Injectable()
export class TelegramCommandService {
  constructor(private readonly prisma: PrismaService, private readonly auth: TelegramAuthService, private readonly accounts: AccountService) {}

  async reply(tx: Prisma.TransactionClient, bot: TelegramBot, chatId: string, threadKey: number, text: string, key: string, targetId?: string, commandExecutionId?: string, buttons?: Prisma.InputJsonValue) {
    await tx.telegramDelivery.upsert({ where: { dedupeKey: hash(key) }, create: { id: randomUUID(), botId: bot.botId!, epoch: bot.dispatchEpoch,
      chatId, threadKey, text: text.slice(0, 3800), kind: commandExecutionId ? 'COMMAND' : 'ONBOARDING', targetId, commandExecutionId, buttons,
      dedupeKey: hash(key) }, update: {} });
  }

  async handle(bot: TelegramBot, update: Update) {
    if (update.callback_query) return this.callback(bot, update.callback_query);
    const message = update.message;
    if (!message?.text || !message.from || message.from.is_bot || message.sender_chat) return;
    const parsed = parseCommand(message.text, bot.username ?? '');
    if (!parsed) return;
    const chatId = String(message.chat.id), threadKey = message.message_thread_id ?? 0;
    try {
      if (Date.now() - message.date * 1000 > 120000) throw new BadRequestException('命令已过期，请重新发送');
      if (['bind', 'connect'].includes(parsed.name)) return await this.onboarding(bot, update.update_id, message, parsed.name, parsed.args);
      if (!['group', 'supergroup'].includes(message.chat.type)) return;
      const context = await this.context(bot, String(message.from.id), chatId, threadKey, parsed.name);
      const existing = await this.prisma.telegramCommandExecution.findUnique({ where: { botId_updateId: { botId: bot.botId!, updateId: update.update_id } } });
      if (existing) { if (existing.status === 'PENDING') await this.execute(bot, existing); return; }
      const resolved = await this.resolve(context, parsed.args);
      const confirm = context.action.confirm || context.command.confirmRequired;
      const token = confirm ? randomBytes(24).toString('base64url') : undefined;
      const execution = await this.prisma.$transaction(async tx => {
      const created = await tx.telegramCommandExecution.create({ data: {
        id: randomUUID(), botId: bot.botId!, updateId: update.update_id, commandId: context.command.id, commandVersion: context.command.version,
        bindingId: context.binding.id, bindingVersion: context.binding.version, targetId: context.target.id, targetVersion: context.target.version,
        actorUserId: context.binding.sysUserId, telegramUserId: context.binding.telegramUserId, actionKey: context.action.key,
        objectId: resolved.objectId, params: json(resolved), epoch: bot.dispatchEpoch,
        status: confirm ? 'AWAITING_CONFIRMATION' : 'PENDING', confirmTokenHash: token ? hash(token) : null,
        expiresAt: confirm ? new Date(Date.now() + 120000) : null,
      } });
      if (token) {
        await this.reply(tx, bot, chatId, threadKey, `请确认：${context.action.name}\n对象：${resolved.objectId}\n操作仅对本次参数有效，2 分钟后过期。`, `confirm:${created.id}`, context.target.id, created.id,
          { inline_keyboard: [[{ text: '确认执行', callback_data: `confirm:${token}` }]] });
      }
      return created;
      });
      if (!token) await this.execute(bot, execution);
    } catch (error) {
      const messageText = error instanceof BadRequestException || error instanceof ForbiddenException ? error.message : '操作未完成，请在后台查看执行记录';
      // 未授权群只返回通用拒绝，不回显用户提供的业务编号或任何查询结果。
      await this.reply(this.prisma, bot, chatId, threadKey, messageText, `error:${bot.botId}:${update.update_id}`);
    }
  }

  async context(bot: TelegramBot, telegramUserId: string, chatId: string, threadKey: number, commandName?: string, commandId?: string) {
    const current = await this.prisma.telegramBot.findUnique({ where: { id: 'default' } });
    if (!current?.enabled || current.botId !== bot.botId || current.dispatchEpoch !== bot.dispatchEpoch) throw new ForbiddenException('Bot 已停用或配置已变化');
    const target = await this.prisma.telegramTarget.findUnique({ where: { botId_chatId_threadKey: { botId: bot.botId!, chatId, threadKey } } });
    const binding = await this.prisma.telegramUserBinding.findUnique({ where: { botId_telegramUserId: { botId: bot.botId!, telegramUserId } } });
    const command = await this.prisma.telegramCommand.findFirst({ where: { botId: bot.botId!, ...(commandId ? { id: commandId } : { name: commandName }) } });
    if (!target?.enabled || !target.verified || target.archived || !binding?.enabled || !command?.enabled ||
      !readIds(binding.allowedTargetIds).includes(target.id) || !readIds(command.allowedTargetIds).includes(target.id) || !readIds(command.allowedBindingIds).includes(binding.id)) throw new ForbiddenException('当前用户或群无权使用此命令');
    const action = ACTIONS.find(item => item.key === command.actionKey);
    if (!action) throw new BadRequestException('命令动作不可用');
    const user = await this.prisma.sysUser.findUnique({ where: { id: binding.sysUserId } });
    if (user?.status !== 'ENABLED') throw new ForbiddenException('后台用户不可用');
    if (action.permission) await this.auth.require(binding.sysUserId, action.permission);
    if (action.key.startsWith('account.') && action.permission !== 'account:read') await this.auth.require(binding.sysUserId, 'account:read');
    return { target, binding, command, action, scopes: [readScope(target.scope), readScope(binding.scope)], user };
  }

  async resolve(context: CommandContext, args: string[]) {
    const { action, scopes, binding } = context;
    if (['help', 'status.read', 'incident.read'].includes(action.key)) {
      if (args.length) throw new BadRequestException('该命令不需要参数');
      return { objectId: undefined, minutes: undefined, expectedMonitoring: undefined };
    }
    if (!args.length || args.length > (action.key === 'incident.mute' ? 2 : 1)) throw new BadRequestException(`参数格式：${action.parameter}`);
    if (action.key.startsWith('account.')) {
      await this.auth.require(binding.sysUserId, 'account:read');
      const accounts = await this.prisma.account.findMany({ where: { AND: [accountWhere(scopes), { OR: [{ id: args[0] }, { profileNo: args[0] }] }] }, select: { id: true, monitoringEnabled: true }, take: 2 });
      if (!accounts.length) throw new BadRequestException('对象不存在或不在允许范围内');
      if (accounts.length > 1) throw new BadRequestException('环境编号匹配多个账号，请使用完整账号 ID');
      return { objectId: accounts[0].id, expectedMonitoring: accounts[0].monitoringEnabled, minutes: undefined };
    }
    const incident = await this.prisma.notificationIncident.findUnique({ where: { id: args[0] } });
    if (!incident || !await this.auth.entityAllowed(incident.entityType, incident.entityId, scopes, binding.sysUserId)) throw new BadRequestException('事件不存在或不在允许范围内');
    const defaults = context.command.defaults as { minutes?: number };
    const minutes = action.key === 'incident.mute' ? Number(args[1] ?? defaults.minutes ?? 30) : undefined;
    if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) throw new BadRequestException('静默时长须为 1–1440 分钟');
    return { objectId: incident.id, minutes, expectedMonitoring: undefined };
  }

  private async callback(bot: TelegramBot, callback: CallbackQuery) {
    if (callback.from.is_bot || !callback.data?.startsWith('confirm:') || !callback.message) return;
    const execution = await this.prisma.telegramCommandExecution.findUnique({ where: { confirmTokenHash: hash(callback.data.slice(8)) } });
    if (!execution || execution.botId !== bot.botId || execution.telegramUserId !== String(callback.from.id)) return;
    const target = await this.prisma.telegramTarget.findUnique({ where: { id: execution.targetId } });
    if (!target || target.chatId !== String(callback.message.chat.id) || target.threadKey !== ('message_thread_id' in callback.message ? callback.message.message_thread_id ?? 0 : 0)) return;
    await this.execute(bot, execution);
  }

  private async execute(bot: TelegramBot, execution: TelegramCommandExecution) {
    const target = await this.prisma.telegramTarget.findUnique({ where: { id: execution.targetId } });
    if (!target) return;
    let result: string;
    try {
      const context = await this.context(bot, execution.telegramUserId, target.chatId, target.threadKey, undefined, execution.commandId);
      if (execution.epoch !== bot.dispatchEpoch || context.command.version !== execution.commandVersion || context.binding.version !== execution.bindingVersion || target.version !== execution.targetVersion) throw new BadRequestException('授权或配置已改变，请重新发送命令');
      if (execution.expiresAt && execution.expiresAt < new Date()) throw new BadRequestException('确认已过期，请重新发送命令');
      const params = execution.params as { objectId?: string; minutes?: number; expectedMonitoring?: boolean };
      const claimed = await this.prisma.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM telegram_bot WHERE id = 'default' FOR UPDATE`);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM telegram_target WHERE id = ${execution.targetId} FOR UPDATE`);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM telegram_user_binding WHERE id = ${execution.bindingId} FOR UPDATE`);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM telegram_command WHERE id = ${execution.commandId} FOR UPDATE`);
        const fresh = await this.context(bot, execution.telegramUserId, target.chatId, target.threadKey, undefined, execution.commandId);
        if (fresh.command.version !== execution.commandVersion || fresh.binding.version !== execution.bindingVersion || fresh.target.version !== execution.targetVersion) throw new BadRequestException('授权已变化，请重新发送命令');
        const claim = await tx.telegramCommandExecution.updateMany({ where: { id: execution.id, status: { in: ['PENDING', 'AWAITING_CONFIRMATION'] } }, data: { status: 'RUNNING' } });
        if (!claim.count) return null;
        const value = await this.runAction(tx, fresh, params);
        await tx.telegramCommandExecution.update({ where: { id: execution.id }, data: { status: 'SUCCEEDED', result: value, completedAt: new Date() } });
        await tx.sysOperationLog.create({ data: { id: randomUUID(), userId: context.user.id, username: context.user.username, domain: context.user.domain,
          moduleName: 'Telegram', description: context.action.name, requestId: execution.id, method: 'BOT', url: context.action.key, ip: 'telegram',
          body: { entry: 'TELEGRAM', telegramUserId: execution.telegramUserId, targetId: target.id, objectId: params.objectId ?? null },
          startTime: execution.createdAt, endTime: new Date(), duration: Date.now() - execution.createdAt.getTime(), source: 'USER', status: 'SUCCESS', relatedId: execution.id } });
        await this.reply(tx, bot, target.chatId, target.threadKey, value, `result:${execution.id}`, target.id, execution.id);
        return value;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      if (claimed === null) return;
      result = claimed;
    } catch (error) {
      result = error instanceof BadRequestException || error instanceof ForbiddenException ? error.message : '执行失败，请在后台查看记录';
      const changed = await this.prisma.telegramCommandExecution.updateMany({ where: { id: execution.id, status: { in: ['PENDING', 'AWAITING_CONFIRMATION'] } }, data: { status: 'FAILED', result, completedAt: new Date() } });
      if (changed.count) await this.reply(this.prisma, bot, target.chatId, target.threadKey, result, `result:${execution.id}`, target.id, execution.id);
    }
  }

  private async runAction(tx: Prisma.TransactionClient, context: CommandContext, params: { objectId?: string; minutes?: number; expectedMonitoring?: boolean }) {
    const { action, binding, scopes, target } = context;
    if (action.key === 'help') {
      const commands = await tx.telegramCommand.findMany({ where: { botId: target.botId, enabled: true } });
      const permitted: string[] = [];
      for (const command of commands) {
        const item = ACTIONS.find(row => row.key === command.actionKey);
        if (item && readIds(command.allowedTargetIds).includes(target.id) && readIds(command.allowedBindingIds).includes(binding.id) && (!item.permission || await this.auth.allowed(binding.sysUserId, item.permission))) permitted.push(`/${command.name} ${item.parameter} — ${command.description}`);
      }
      return permitted.join('\n') || '当前没有可用命令';
    }
    if (action.key === 'status.read') {
      const count = await tx.account.count({ where: accountWhere(scopes) });
      const monitoring = await tx.account.count({ where: { AND: [accountWhere(scopes), { monitoringEnabled: true }] } });
      const collectors = await this.auth.allowed(binding.sysUserId, 'collector:read') ? await tx.collector.count({ where: collectorWhere(scopes) }) : undefined;
      return `允许范围内账号：${count}\n已开启巡检：${monitoring}${collectors === undefined ? '' : `\n采集端：${collectors}`}`;
    }
    if (action.key === 'incident.read') {
      const incidents = await tx.notificationIncident.findMany({ where: { recoveredAt: null }, orderBy: { occurredAt: 'desc' }, take: 200 });
      const allowed = [];
      for (const incident of incidents) if (await this.auth.entityAllowed(incident.entityType, incident.entityId, scopes, binding.sysUserId, tx)) allowed.push(`${incident.id}\n${incident.title} · ${incident.entityId}`);
      return allowed.slice(0, 15).join('\n\n') || '最近 200 条异常中没有允许范围内的记录，请在后台查看更多';
    }
    if (action.key.startsWith('account.')) {
      if (action.key !== 'account.read') {
        const owner = await tx.account.findUnique({ where: { id: params.objectId! }, select: { collectorId: true } });
        if (owner?.collectorId) await tx.$queryRaw(Prisma.sql`SELECT id FROM collector WHERE id = ${owner.collectorId} FOR UPDATE`);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM account WHERE id = ${params.objectId!} FOR UPDATE`);
      }
      const account = await tx.account.findFirst({ where: { AND: [{ id: params.objectId }, accountWhere(scopes)] }, select: { id: true, profileNo: true, status: true, restrictionActive: true, judicialActive: true, monitoringEnabled: true, collectorId: true } });
      if (!account) throw new BadRequestException('账号不在允许范围内');
      if (action.key === 'account.read') return `账号：${account.id}\n环境编号：${account.profileNo || '未设置'}\n登录状态：${account.status}\n商家限制：${account.restrictionActive ? '异常' : '未记录异常'}\n司法限制：${account.judicialActive ? '异常' : '未记录异常'}\n巡检：${account.monitoringEnabled ? '开启' : '关闭'}`;
      if (account.monitoringEnabled !== params.expectedMonitoring) throw new BadRequestException('巡检状态已改变，请重新发送命令');
      const enabled = action.key === 'account.monitoring.resume';
      await this.accounts.updateAccountMonitoring(account.id, enabled, tx);
      const collector = account.collectorId ? await tx.collector.findUnique({ where: { id: account.collectorId }, select: { monitoringEnabled: true } }) : null;
      const settings = enabled ? await tx.scriptSetting.findUnique({ where: { id: 'default' }, select: { enabled: true } }) : null;
      return `账号 ${account.profileNo || account.id} 巡检已${enabled ? '开启' : '暂停'}。${enabled && (!collector?.monitoringEnabled || !settings?.enabled) ? '脚本或采集端总开关未开启，当前不会执行巡检。' : ''}此操作不修改支付通道状态。`;
    }
    const incident = await tx.notificationIncident.findUnique({ where: { id: params.objectId! } });
    if (!incident || !await this.auth.entityAllowed(incident.entityType, incident.entityId, scopes, binding.sysUserId, tx)) throw new BadRequestException('事件不在允许范围内');
    if (action.key === 'incident.ack') {
      await tx.notificationIncident.update({ where: { id: incident.id }, data: { acknowledgedAt: new Date(), acknowledgedBy: binding.sysUserId } });
      return `已确认告警 ${incident.id}，账号实际异常状态保持不变。`;
    }
    await tx.telegramIncidentPreference.upsert({ where: { incidentId_targetId: { incidentId: incident.id, targetId: target.id } },
      create: { id: randomUUID(), incidentId: incident.id, targetId: target.id, mutedUntil: new Date(Date.now() + params.minutes! * 60000), updatedBy: binding.sysUserId },
      update: { mutedUntil: new Date(Date.now() + params.minutes! * 60000), updatedBy: binding.sysUserId } });
    return `本群对事件 ${incident.id} 静默 ${params.minutes} 分钟。`;
  }

  private async onboarding(bot: TelegramBot, updateId: number, message: Message, name: string, args: string[]) {
    if (args.length !== 1 || !message.from || message.sender_chat || (name === 'bind' ? message.chat.type !== 'private' : !['group', 'supergroup'].includes(message.chat.type))) throw new BadRequestException('请在正确会话中使用后台生成的接入命令');
    const challenge = await this.prisma.telegramChallenge.findUnique({ where: { codeHash: args[0] } });
    if (!challenge || challenge.botId !== bot.botId || challenge.type !== name.toUpperCase() || challenge.consumedAt || challenge.expiresAt < new Date()) throw new BadRequestException('接入码无效或已过期');
    const telegramUserId = String(message.from.id);
    const user = await this.prisma.sysUser.findUnique({ where: { id: challenge.sysUserId } });
    if (user?.status !== 'ENABLED') throw new ForbiddenException('后台用户不可用');
    if (name === 'connect') {
      await this.auth.require(user.id, 'telegram:create');
      const binding = await this.prisma.telegramUserBinding.findUnique({ where: { botId_sysUserId: { botId: bot.botId!, sysUserId: user.id } } });
      if (challenge.expectedTelegramId !== telegramUserId || binding?.telegramUserId !== telegramUserId) throw new ForbiddenException('必须由生成接入码的本人操作');
    }
    await this.prisma.$transaction(async tx => {
      const used = await tx.telegramChallenge.updateMany({ where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
      if (!used.count) throw new BadRequestException('接入码已使用或过期');
      if (name === 'bind') {
        const existing = await tx.telegramUserBinding.findFirst({ where: { botId: bot.botId!, OR: [{ sysUserId: user.id }, { telegramUserId }] } });
        if (existing && (existing.sysUserId !== user.id || existing.telegramUserId !== telegramUserId)) throw new BadRequestException('已有其他绑定，请先解除');
        if (!existing) await tx.telegramUserBinding.create({ data: { id: randomUUID(), botId: bot.botId!, telegramUserId, sysUserId: user.id, displayName: message.from!.first_name, scope: json(EMPTY_SCOPE), allowedTargetIds: [], enabled: false } });
      } else {
        const chatId = String(message.chat.id), threadKey = message.message_thread_id ?? 0;
        await tx.telegramTarget.upsert({ where: { botId_chatId_threadKey: { botId: bot.botId!, chatId, threadKey } },
          create: { id: randomUUID(), botId: bot.botId!, chatId, threadKey, name: ('title' in message.chat ? message.chat.title : undefined) ?? chatId, scope: json(EMPTY_SCOPE) },
          update: { verified: true, archived: false, enabled: false, version: { increment: 1 } } });
      }
      await this.reply(tx, bot, String(message.chat.id), message.message_thread_id ?? 0, name === 'bind' ? '用户身份已绑定，请在后台配置允许群和操作范围。' : '群接入成功，请在后台配置业务范围和订阅后启用。', `onboard:${bot.botId}:${updateId}`);
    });
  }
}
