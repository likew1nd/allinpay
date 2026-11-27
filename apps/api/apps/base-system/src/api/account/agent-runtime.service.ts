import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { decryptSiteSecret } from '../site/site-credentials';
import { withCaptchaCredentials } from './captcha-credentials';
import { agentSettingsFields, captchaSettingsFields, taskSettingsFields } from './script-settings.fields';
import { readMonitoringLogs, MONITORING_LOG_LIMIT } from './monitoring-log';
import { readMonitoringTabBindings } from './monitoring-tabs';
import { buildInspectionUpdate } from './account-inspection';
import { NotificationService } from '../notification/notification.service';
import { readAppIds } from './app-ids';
import type { AgentCommandReceiptDto, AgentLogsDto, AgentTaskResultDto, EnvironmentPageDto } from './dto/agent-runtime.dto';
import type { ScriptMonitorHeartbeatDto } from './dto/script-runtime.dto';
import type { AgentTask, EnvironmentProfile } from '../../../../../../../contracts/collector-agent';
import { EXECUTING_TRANSFER_STATUSES } from '../transfer/transfer-calc';
import { RestrictionChannelService } from './restriction-channel.service';

const LEASE_MS = 90_000;
const ACTIVE = ['CLAIMED', 'RUNNING'];
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const safeError = (value?: string) => value ? '采集端执行失败，请查看本机运行日志' : null;
// 巡检截图体积大，内部查询不需要时一律排除
const INSPECTION_IMAGES_OMIT = { restrictionImage: true, judicialImage: true } as const;
// 自动转账独立使用环境采集；仅缺少 APPID 不会启动已关闭的环境。
const APP_ID_TASK_ACCOUNTS: Prisma.AccountWhereInput = {
  profilePresent: true,
  OR: [
    { monitoringEnabled: true }, { transferEnabled: true }, { transferRefreshRequired: true },
    { appIdsRefreshRequestedAt: { not: null } },

  ],
};
const eligibleAccounts = (monitoringEnabled: boolean): Prisma.AccountWhereInput => monitoringEnabled
  ? APP_ID_TASK_ACCOUNTS
  : { profilePresent: true, OR: [{ transferEnabled: true }, { transferRefreshRequired: true }, { appIdsRefreshRequestedAt: { not: null } }] };
type Tx = Prisma.TransactionClient;

/** 比较 "windows-agent-X.Y.Z" 与目标 "X.Y.Z"，已安装版本不低于目标时返回 true。 */
export function scriptVersionAtLeast(installed: string, target: string): boolean {
  const parse = (value: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
    return match ? match.slice(1).map(Number) : null;
  };
  const current = parse(installed.replace(/^windows-agent-/, ''));
  const wanted = parse(target);
  if (!current || !wanted) return installed === `windows-agent-${target}`;
  for (let i = 0; i < 3; i += 1) if (current[i] !== wanted[i]) return current[i] > wanted[i];
  return true;
}

@Injectable()
export class AgentRuntimeService {
  constructor(private readonly prisma: PrismaService, private readonly notifications?: NotificationService,
    private readonly restrictionChannels?: RestrictionChannelService) {}

  private async fence(tx: Tx, id: string, sessionId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM collector WHERE id = ${id} FOR UPDATE`);
    const collector = await tx.collector.findUnique({ where: { id } });
    if (!collector || collector.agentSessionId !== sessionId) throw new ConflictException('采集端会话已被替换，请关闭重复运行的 Agent');
    return collector;
  }

  async openSession(id: string, scriptVersion: string) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM collector WHERE id = ${id} FOR UPDATE`);
      await tx.scriptSetting.upsert({ where: { id: 'default' }, create: { id: 'default', maxConcurrentAccounts: 1,
        tab1Url: 'https://b.alipay.com/page/home', tab2Url: 'https://b.alipay.com/page/self-relieving-web/riskManage/list',
        tab3Url: 'https://open.alipay.com/develop/manage' }, update: {} });
      const sessionId = randomUUID();
      const collector = await tx.collector.update({ where: { id }, data: {
        agentSessionId: sessionId, agentSessionStartedAt: new Date(), appliedRevision: 0,
        adsPowerStatus: 'UNKNOWN', inventorySyncId: null, version: scriptVersion,
      } });
      await tx.collectorInventoryPage.deleteMany({ where: { collectorId: id } });
      await tx.collectorCommand.updateMany({ where: { collectorId: id, kind: 'MONITOR_ACCOUNT', status: { in: ACTIVE } },
        data: { status: 'CANCELLED', completedAt: new Date() } });
      await tx.account.updateMany({ where: { collectorId: id }, data: { scriptLeaseOwner: null, scriptLeaseUntil: null } });
      const controls = await tx.collectorCommand.findMany({ where: { collectorId: id, kind: { not: 'MONITOR_ACCOUNT' }, status: { in: [...ACTIVE, 'PENDING'] } } });
      for (const command of controls) {
        const target = (command.payload as { version?: string } | null)?.version;
        // 已安装版本不低于目标版本即视为完成，避免旧命令目标被后续发布超过后反复触发更新
        const installed = command.kind === 'UPDATE_SCRIPT' && target && scriptVersionAtLeast(scriptVersion, target);
        await tx.collectorCommand.update({ where: { id: command.id }, data: installed
          ? { status: 'SUCCEEDED', completedAt: new Date(), leaseUntil: null }
          : { status: 'PENDING', sessionId: null, leaseUntil: null } });
      }
      return { sessionId, configRevision: collector.configRevision };
    });
  }

  async configuration(id: string, sessionId: string) {
    return this.prisma.$transaction(async tx => {
      const collector = await this.fence(tx, id, sessionId);
      const stored = await tx.scriptSetting.findUnique({ where: { id: 'default' }, select: { ...agentSettingsFields, ...captchaSettingsFields } });
      // 打码平台账号密码由中心解密后随配置下发，采集端只在内存中使用
      const settings = stored ? withCaptchaCredentials(stored) : null;
      const accounts = settings?.enabled ? await tx.account.findMany({ where: { collectorId: id, ...eligibleAccounts(collector.monitoringEnabled) }, select: { externalId: true } }) : [];
      if (!settings) throw new ConflictException('请先保存脚本设置');
      return { revision: collector.configRevision, settings, accounts };
    });
  }

  async heartbeat(id: string, dto: ScriptMonitorHeartbeatDto, publishedVersion?: string) {
    return this.prisma.$transaction(async tx => {
      const collector = await this.fence(tx, id, dto.sessionId!);
      const now = new Date();
      const settings = await tx.scriptSetting.findUnique({ where: { id: 'default' } });
      const validAccounts = settings?.enabled ? await tx.account.findMany({
        where: { collectorId: id, ...eligibleAccounts(collector.monitoringEnabled) }, select: { id: true },
      }) : [];
      await tx.collectorCommand.updateMany({ where: { collectorId: id, kind: 'MONITOR_ACCOUNT', status: { in: ACTIVE }, OR: [
        { configRevision: { not: collector.configRevision } }, ...(validAccounts.length ? [{ accountId: { notIn: validAccounts.map(item => item.id) } }] : [{ kind: 'MONITOR_ACCOUNT' }]), { leaseUntil: { lt: now } },
      ] }, data: { status: 'CANCELLED', completedAt: now } });
      const activeTaskIds = (await tx.collectorCommand.findMany({ where: {
        collectorId: id, kind: 'MONITOR_ACCOUNT', sessionId: dto.sessionId, status: { in: ACTIVE }, leaseUntil: { gt: now },
      }, select: { id: true } })).map(item => item.id);
      await tx.account.updateMany({ where: { collectorId: id, scriptLeaseOwner: { not: null, notIn: activeTaskIds } }, data: { scriptLeaseOwner: null, scriptLeaseUntil: null } });
      const renew = (dto.activeTaskIds ?? []).filter(taskId => activeTaskIds.includes(taskId));
      // 只通知正在轮询且有待领转账的环境。余额刷新仍须做完，浏览器交还前继续续租。
      const waitingAccounts = renew.length ? await tx.account.findMany({
        where: { collectorId: id, scriptLeaseOwner: { in: renew }, transferRefreshRequired: false, transfers: { some: { status: 'READY' } } },
        select: { scriptLeaseOwner: true },
      }) : [];
      const yieldPollingTaskIds = waitingAccounts.flatMap(account => account.scriptLeaseOwner ? [account.scriptLeaseOwner] : []);
      await tx.collectorCommand.updateMany({ where: { id: { in: renew }, sessionId: dto.sessionId }, data: { leaseUntil: new Date(Date.now() + LEASE_MS) } });
      await tx.account.updateMany({ where: { collectorId: id, scriptLeaseOwner: { in: renew } }, data: { scriptLeaseUntil: new Date(Date.now() + LEASE_MS) } });
      await tx.collectorCommand.updateMany({ where: { collectorId: id, kind: { not: 'MONITOR_ACCOUNT' }, status: { in: ACTIVE }, leaseUntil: { lt: now } },
        data: { status: 'PENDING', sessionId: null, leaseUntil: null } });
      if (publishedVersion && /^windows-agent-\d+\.\d+\.\d+$/.test(dto.scriptVersion) &&
          !scriptVersionAtLeast(dto.scriptVersion, publishedVersion)) {
        await this.enqueueControl(tx, id, 'UPDATE_SCRIPT', { version: publishedVersion });
      }
      const controls = await tx.collectorCommand.findMany({ where: { collectorId: id, kind: { not: 'MONITOR_ACCOUNT' }, status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 10 });
      for (const control of controls) await tx.collectorCommand.update({ where: { id: control.id }, data: { status: 'CLAIMED', sessionId: dto.sessionId, leaseUntil: new Date(Date.now() + LEASE_MS) } });
      const commands = await tx.collectorCommand.findMany({ where: { collectorId: id, kind: { not: 'MONITOR_ACCOUNT' }, sessionId: dto.sessionId, status: { in: ACTIVE } }, select: { id: true, kind: true, payload: true } });
      await tx.collectorCommand.updateMany({ where: { id: { in: commands.map(item => item.id) } }, data: { leaseUntil: new Date(Date.now() + LEASE_MS) } });
      await tx.collector.update({ where: { id }, data: { status: 'ONLINE', version: dto.scriptVersion, lastHeartbeatAt: now, lastError: null,
        appliedRevision: Math.min(dto.appliedRevision ?? 0, collector.configRevision), adsPowerStatus: dto.adsPowerStatus ?? 'UNKNOWN',
        adsPowerCheckedAt: now, environmentSyncError: safeError(dto.environmentSyncError ?? undefined) } });
      await tx.collectorCommand.deleteMany({ where: { collectorId: id, completedAt: { lt: new Date(Date.now() - 7 * 86400_000) } } });
      // 采集端仍在执行、但中心已不再是“执行中”的转账单（强制结束、取消、超时兜底、重新排队）：回给脚本，让它立即停止
      const reportedTransfers = (dto.activeTaskIds ?? []).filter(taskId => taskId.startsWith('transfer-'));
      const stoppedTransferIds = reportedTransfers.length
        ? (await tx.transferRequest.findMany({ where: { id: { in: reportedTransfers }, status: { notIn: EXECUTING_TRANSFER_STATUSES } }, select: { id: true } })).map(item => item.id)
        : [];
      return { accepted: 0, rejected: 0, nextHeartbeatAt: new Date(Date.now() + 10_000).toISOString(), configRevision: collector.configRevision, commands, activeTaskIds, stoppedTransferIds, yieldPollingTaskIds };
    });
  }

  async enqueue(id: string, kind: 'SYNC_ENVIRONMENTS' | 'UPDATE_SCRIPT', payload?: { version: string }) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM collector WHERE id = ${id} FOR UPDATE`);
      if (!await tx.collector.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException('采集端不存在');
      return this.enqueueControl(tx, id, kind, payload);
    });
  }

  private async enqueueControl(tx: Tx, id: string, kind: 'SYNC_ENVIRONMENTS' | 'UPDATE_SCRIPT', payload?: { version: string }) {
    const existing = await tx.collectorCommand.findFirst({ where: { collectorId: id, kind, status: { in: ['PENDING', ...ACTIVE] } }, orderBy: { createdAt: 'asc' } });
    if (existing) {
      if (!payload || (existing.payload as { version?: string } | null)?.version === payload.version) return existing;
      await tx.collectorCommand.update({ where: { id: existing.id }, data: { status: 'CANCELLED', completedAt: new Date() } });
    }
    return tx.collectorCommand.create({ data: { id: randomUUID(), collectorId: id, kind, ...(payload ? { payload } : {}) } });
  }

  async receipt(id: string, commandId: string, dto: AgentCommandReceiptDto) {
    return this.prisma.$transaction(async tx => {
      await this.fence(tx, id, dto.sessionId);
      const command = await tx.collectorCommand.findFirst({ where: { id: commandId, collectorId: id, sessionId: dto.sessionId, kind: { not: 'MONITOR_ACCOUNT' } } });
      if (!command) throw new NotFoundException('指令不存在');
      if (['SUCCEEDED', 'FAILED'].includes(command.status)) return { accepted: true, status: command.status };
      if (!ACTIVE.includes(command.status) || !command.leaseUntil || command.leaseUntil < new Date()) throw new ConflictException('指令租约已失效');
      await tx.collectorCommand.update({ where: { id: commandId }, data: { status: dto.status, error: safeError(dto.error),
        ...(dto.status !== 'RUNNING' ? { completedAt: new Date(), leaseUntil: null } : {}) } });
      return { accepted: true, status: dto.status };
    });
  }

  async startInventory(id: string, sessionId: string) {
    return this.prisma.$transaction(async tx => {
      await this.fence(tx, id, sessionId);
      const syncId = randomUUID();
      await tx.collector.update({ where: { id }, data: { inventorySyncId: syncId } });
      await tx.collectorInventoryPage.deleteMany({ where: { collectorId: id } });
      return { syncId };
    });
  }

  async inventoryPage(id: string, dto: EnvironmentPageDto) {
    if (dto.page >= dto.totalPages) throw new BadRequestException('环境分页编号无效');
    return this.prisma.$transaction(async tx => {
      const collector = await this.fence(tx, id, dto.sessionId);
      if (collector.inventoryLastCompletedId === dto.syncId) return { committed: true, duplicate: true };
      if (collector.inventorySyncId !== dto.syncId) throw new ConflictException('环境同步批次已失效');
      const where = { collectorId_syncId_page: { collectorId: id, syncId: dto.syncId, page: dto.page } };
      const previous = await tx.collectorInventoryPage.findUnique({ where });
      const hash = digest(dto.profiles);
      if (previous && (previous.digest !== hash || previous.totalPages !== dto.totalPages)) throw new ConflictException('重复分页内容不一致');
      if (!previous) await tx.collectorInventoryPage.create({ data: { collectorId: id, syncId: dto.syncId, page: dto.page,
        totalPages: dto.totalPages, digest: hash, profiles: dto.profiles as unknown as Prisma.InputJsonValue } });
      const pages = await tx.collectorInventoryPage.findMany({ where: { collectorId: id, syncId: dto.syncId }, orderBy: { page: 'asc' } });
      if (pages.some(page => page.totalPages !== dto.totalPages)) throw new ConflictException('环境分页总数不一致');
      if (pages.length !== dto.totalPages) return { committed: false, received: pages.length };
      const profiles = pages.flatMap(page => page.profiles as unknown as EnvironmentProfile[]);
      if (new Set(profiles.map(profile => profile.externalId)).size !== profiles.length) throw new BadRequestException('环境清单包含重复 ID');
      const previousProfiles = await tx.account.findMany({ where: { collectorId: id, profilePresent: true }, select: { externalId: true } });
      const members = new Set(profiles.map(profile => profile.externalId));
      const changed = members.size !== previousProfiles.length || previousProfiles.some(profile => !members.has(profile.externalId));
      await tx.account.updateMany({ where: { collectorId: id }, data: { profilePresent: false } });
      for (const profile of profiles) {
        const { externalId, ...fields } = profile;
        await tx.account.upsert({ where: { collectorId_externalId: { collectorId: id, externalId } },
          create: { id: `account-${randomUUID()}`, collectorId: id, externalId, ...fields }, update: { ...fields, profilePresent: true } });
      }
      await tx.account.updateMany({ where: { collectorId: id, profilePresent: false }, data: { status: 'ENV_UNAVAILABLE', lastError: 'AdsPower 环境已不在当前列表中' } });
      if (this.notifications) {
        const observed = await tx.account.findMany({ where: { collectorId: id }, select: { id: true, profilePresent: true } });
        for (const item of observed) await this.notifications.observe(tx, 'ACCOUNT', item.id, dto.syncId, [{ eventType: 'ACCOUNT_ENV_UNAVAILABLE', cause: 'MISSING_PROFILE', active: !item.profilePresent }]);
      }
      await tx.collector.update({ where: { id }, data: { inventorySyncId: null, inventoryLastCompletedId: dto.syncId,
        ...(changed ? { configRevision: { increment: 1 } } : {}),
        environmentSyncedAt: new Date(), environmentSyncError: null, adsPowerStatus: 'AVAILABLE', adsPowerCheckedAt: new Date() } });
      await tx.collectorInventoryPage.deleteMany({ where: { collectorId: id, syncId: dto.syncId } });
      return { committed: true, count: profiles.length };
    }, { timeout: 60_000 });
  }

  async claimTasks(id: string, sessionId: string, capacity: number): Promise<AgentTask[]> {
    return this.prisma.$transaction(async tx => {
      const collector = await this.fence(tx, id, sessionId);
      const stored = await tx.scriptSetting.findUnique({ where: { id: 'default' }, select: { ...taskSettingsFields, ...captchaSettingsFields } });
      // 巡检任务同样带上解密后的打码平台凭据，登录遇到验证码时由采集端自动识别
      const settings = stored ? withCaptchaCredentials(stored) : null;
      if (!settings?.enabled || collector.appliedRevision !== collector.configRevision) return [];
      const active = await tx.collectorCommand.count({ where: { collectorId: id, kind: 'MONITOR_ACCOUNT', status: { in: ACTIVE }, leaseUntil: { gt: new Date() } } });
      const slots = Math.max(0, Math.min(capacity, settings.maxConcurrentAccounts - active));
      if (!slots) return [];
      // 准备付款和提交中都占用环境；待领取单仅让余额刷新通过。
      const accounts = await tx.account.findMany({ where: { collectorId: id, transfers: { none: { status: { in: EXECUTING_TRANSFER_STATUSES } } }, scriptNextAt: { lte: new Date() },
        AND: [eligibleAccounts(collector.monitoringEnabled), { OR: [{ transferRefreshRequired: true }, { transfers: { none: { status: 'READY' } } }] }],
        OR: [{ scriptLeaseUntil: null }, { scriptLeaseUntil: { lt: new Date() } }] },
        orderBy: [{ transferRefreshRequired: 'desc' }, { scriptNextAt: 'asc' }, { id: 'asc' }], take: slots, omit: INSPECTION_IMAGES_OMIT,
        include: { credentials: { select: { appId: true, appIds: true } } } });
      // 监控和转账共用同一个 AdsPower 环境，监控结束会关闭整个环境，会把正在转账的浏览器一起关掉。
      // 上面的查询和转账领单各在自己的事务里，并发时两边都能通过检查，所以这里必须对账号行加锁后再核对一次。
      const lockedAccounts: typeof accounts = [];
      for (const candidate of accounts) {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM account WHERE id = ${candidate.id} FOR UPDATE`);
        const busy = await tx.transferRequest.count({ where: { accountId: candidate.id, status: { in: EXECUTING_TRANSFER_STATUSES } } });
        const reserved = await tx.account.count({ where: { id: candidate.id, OR: [
          { scriptLeaseUntil: { gt: new Date() } }, { transferRefreshRequired: false, transfers: { some: { status: 'READY' } } },
        ] } });
        if (!busy && !reserved) lockedAccounts.push(candidate);
      }
      accounts.splice(0, accounts.length, ...lockedAccounts);
      const tasks: AgentTask[] = [];
      for (const account of accounts) {
        const taskId = randomUUID();
        const requestAt = account.appIdsRefreshRequestedAt?.toISOString() ?? null;
        const appIds = readAppIds(account.credentials?.appIds, account.credentials?.appId);
        const monitorAccount = account.monitoringEnabled || account.transferEnabled || account.transferRefreshRequired;
        await tx.account.update({ where: { id: account.id }, data: { scriptLeaseOwner: taskId, scriptLeaseUntil: new Date(Date.now() + LEASE_MS) } });
        await tx.collectorCommand.create({ data: { id: taskId, collectorId: id, accountId: account.id, kind: 'MONITOR_ACCOUNT', status: 'RUNNING', sessionId,
          configRevision: collector.configRevision, leaseUntil: new Date(Date.now() + LEASE_MS),
          payload: { monitorAccount, fetchAppIds: appIds.length === 0 || requestAt !== null, appIdsRefreshRequestedAt: requestAt } } });
        tasks.push({ taskId, profileId: account.externalId, revision: collector.configRevision,
          settings,
          bindings: readMonitoringTabBindings(account.monitoringTabBindings), monitorAccount,
          fetchAppIds: appIds.length === 0 || requestAt !== null });
      }
      return tasks;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  private async ownedTask(tx: Tx, id: string, sessionId: string, taskId: string) {
    const collector = await this.fence(tx, id, sessionId);
    const settings = await tx.scriptSetting.findUnique({ where: { id: 'default' } });
    const task = await tx.collectorCommand.findFirst({ where: { id: taskId, collectorId: id, kind: 'MONITOR_ACCOUNT', sessionId, configRevision: collector.configRevision,
      status: { in: ACTIVE }, leaseUntil: { gt: new Date() } } });
    const account = task?.accountId ? await tx.account.findFirst({ where: { id: task.accountId, collectorId: id, profilePresent: true, scriptLeaseOwner: taskId }, omit: INSPECTION_IMAGES_OMIT,
      include: { credentials: { select: { appId: true, appIds: true } } } }) : null;
    const taskMode = task?.payload as { monitorAccount?: boolean } | null;
    const appIdOnlyTask = taskMode?.monitorAccount === false;
    if (!settings?.enabled || !task || !account ||
      (appIdOnlyTask ? !account.appIdsRefreshRequestedAt : (!(collector.monitoringEnabled && account.monitoringEnabled) && !account.transferEnabled && !account.transferRefreshRequired))) {
      throw new ConflictException('巡检任务已停止或租约已失效');
    }
    return { task, account, settings };
  }

  async active(id: string, sessionId: string, taskId: string) {
    try { await this.prisma.$transaction(tx => this.ownedTask(tx, id, sessionId, taskId)); return { active: true }; }
    catch (error) { if (error instanceof ConflictException) return { active: false }; throw error; }
  }

  async completeTask(id: string, dto: AgentTaskResultDto) {
    return this.prisma.$transaction(async tx => {
      await this.fence(tx, id, dto.sessionId);
      const completed = await tx.collectorCommand.findFirst({ where: { id: dto.taskId, collectorId: id, sessionId: dto.sessionId, kind: 'MONITOR_ACCOUNT' } });
      if (completed?.result) {
        if ((completed.result as { digest?: string }).digest !== digest(dto)) throw new ConflictException('重复任务结果不一致');
        return { accepted: true, duplicate: true };
      }
      const { account, settings, task } = await this.ownedTask(tx, id, dto.sessionId, dto.taskId);
      if (account.externalId !== dto.externalId) throw new BadRequestException('任务环境不匹配');
      const taskMode = task.payload as { monitorAccount?: boolean; fetchAppIds?: boolean; appIdsRefreshRequestedAt?: string | null } | null;
      // 尚未开始检查便交还环境时，只归还租约，保留上次巡检的状态和余额。
      const monitorAccount = taskMode?.monitorAccount !== false && !(dto.yieldedForTransfer && dto.status === 'UNKNOWN' && !dto.tabs.length);
      const acceptedAppIdsAttempt = taskMode?.fetchAppIds === true && dto.appIdsAttempted === true;
      const capturedRequestAt = taskMode?.appIdsRefreshRequestedAt ?? null;
      const currentRequestAt = account.appIdsRefreshRequestedAt?.toISOString() ?? null;
      const consumedRequest = acceptedAppIdsAttempt && capturedRequestAt !== null && currentRequestAt === capturedRequestAt;
      const newerRequest = currentRequestAt !== null && currentRequestAt !== capturedRequestAt;
      if (acceptedAppIdsAttempt && !dto.appIdsError && dto.appIds?.length) {
        const appIds = readAppIds(dto.appIds);
        const credentialData = { appId: appIds[0] ?? '', appIds: appIds as Prisma.InputJsonValue };
        await tx.accountCredentials.upsert({
          where: { accountId: account.id },
          create: { accountId: account.id, loginAccount: '', ...credentialData },
          update: credentialData,
        });
      }
      const statuses = { LOGGED_IN: 'HEALTHY', LOGIN_REQUIRED: 'AUTH_EXPIRED', PASSWORD_REJECTED: 'PASSWORD_REJECTED', QR_LOGIN_REQUIRED: 'AUTH_EXPIRED', CAPTCHA_REQUIRED: 'CAPTCHA_REQUIRED', PAGE_ERROR: 'DEGRADED', ENV_UNAVAILABLE: 'ENV_UNAVAILABLE', UNKNOWN: 'UNKNOWN' } as const;
      // 密码错误时暂停监控与转账，修正密码后需手动重新选择模式。
      const passwordRejected = monitorAccount && dto.status === 'PASSWORD_REJECTED';
      const seconds = settings.minRefreshSeconds + Math.floor(Math.random() * (settings.maxRefreshSeconds - settings.minRefreshSeconds + 1));
      const now = new Date();
      const restriction = monitorAccount && this.restrictionChannels
        ? await this.restrictionChannels.observe(tx, account, dto, now)
        : null;
      const inspection = restriction ? restriction.inspection : dto.inspection;
      // 只有本轮成功读取余额才推进快照时间；失败时保留刷新屏障，不能用旧余额继续付款。
      const freshBalance = monitorAccount && dto.status === 'LOGGED_IN' && dto.inspection?.funds?.availableBalance != null;
      const observedAt = new Date(dto.completedAt);
      const balanceFresh = freshBalance && observedAt <= new Date(now.getTime() + 60000) &&
        observedAt >= new Date(now.getTime() - 5 * 60000) && (!account.balanceAt || observedAt > account.balanceAt);
      await tx.account.update({ where: { id: account.id }, data: {
        ...(monitorAccount ? {
          status: statuses[dto.status], browserState: dto.status, lastSeenAt: now,
          lastError: passwordRejected ? '登录密码错误，已自动暂停监控和转账' : safeError(dto.error),
          ...(passwordRejected ? { monitoringEnabled: false, transferEnabled: false } : {}),
          metadata: { source: 'WINDOWS_AGENT', taskId: dto.taskId, tabs: dto.tabs as unknown as Prisma.InputJsonValue,
            observedAt: dto.completedAt, ...(restriction && { restrictionKinds: restriction.restrictionKinds }) },
          ...buildInspectionUpdate(inspection, now, { restrictionActive: account.restrictionActive, judicialActive: account.judicialActive }),
          ...restriction?.observed,
        } : {}),
        ...(balanceFresh ? { balanceAt: observedAt, transferRefreshRequired: false } : dto.inspection?.funds?.availableBalance != null ? { balanceAt: null } : {}),
        scriptNextAt: newerRequest || dto.yieldedForTransfer ? now : new Date(Date.now() + seconds * 1000),
        scriptLeaseOwner: null, scriptLeaseUntil: null,
        monitoringTabBindings: readMonitoringTabBindings(dto.bindings) as Prisma.InputJsonValue,
        ...(consumedRequest ? { appIdsRefreshRequestedAt: null } : {}),
      } });
      if (passwordRejected) {
        await tx.transferRequest.updateMany({
          where: { accountId: account.id, status: 'READY' },
          data: { status: 'CANCELLED', completedAt: now, resultNote: '登录密码错误，已自动暂停转账' },
        });
      }
      if (monitorAccount && this.notifications) {
        await this.notifications.account(tx, account.id, dto.taskId, dto.status, inspection, restriction?.defer);
      }
      await tx.collectorCommand.update({ where: { id: dto.taskId }, data: { status: dto.status === 'ENV_UNAVAILABLE' ? 'FAILED' : 'SUCCEEDED', completedAt: new Date(), leaseUntil: null,
        result: { digest: digest(dto), status: dto.status, completedAt: dto.completedAt } } });
      // 本轮确认已登录：清掉冷却和计数。登录成功不应遗留冷却，否则下一轮要白等到冷却过期
      if (dto.status === 'LOGGED_IN') {
        await tx.accountCredentials.updateMany({ where: { accountId: account.id }, data: { loginAttempts: 0, loginAttemptAfter: null } });
      }
      return { accepted: true };
    });
  }

  async logs(id: string, dto: AgentLogsDto) {
    return this.prisma.$transaction(async tx => {
      await this.fence(tx, id, dto.sessionId);
      const task = await tx.collectorCommand.findFirst({ where: { id: dto.taskId, collectorId: id, sessionId: dto.sessionId, kind: 'MONITOR_ACCOUNT' } });
      const account = task?.accountId ? await tx.account.findFirst({ where: { id: task.accountId, collectorId: id }, omit: INSPECTION_IMAGES_OMIT }) : null;
      if (!account) throw new NotFoundException('任务不存在');
      const logs = readMonitoringLogs(account.monitoringLogs);
      const incoming = readMonitoringLogs(dto.logs);
      for (const entry of incoming) if (!logs.some(item => item.at === entry.at && item.message === entry.message && item.url === entry.url)) logs.push(entry);
      await tx.account.update({ where: { id: account.id }, data: { monitoringLogs: logs.slice(-MONITORING_LOG_LIMIT) as unknown as Prisma.InputJsonValue } });
      return { accepted: incoming.length };
    });
  }

  /**
   * 下发登录凭据。只检查“缺凭据 / 被拒绝 / 冷却中”，不再按提交次数计数，也不在这里写入冷却：
   * 冷却只在 Agent 报告“所有重试轮次都用尽仍未登录”时才触发（见 loginFailed）。
   */
  async login(id: string, sessionId: string, taskId: string) {
    return this.prisma.$transaction(async tx => {
      const { account } = await this.ownedTask(tx, id, sessionId, taskId);
      const credentials = await tx.accountCredentials.findUnique({ where: { accountId: account.id } });
      if (!credentials?.loginAccount || !credentials.passwordEncrypted) return { status: 'missing' };
      if (credentials.loginBlocked) return { status: 'blocked' };
      if (credentials.loginAttemptAfter && credentials.loginAttemptAfter > new Date()) return { status: 'cooldown' };
      // 记下本次使用的凭据指纹，供“密码被拒绝 / 触发冷却”时核对凭据在此期间没有被修改过
      await tx.collectorCommand.update({ where: { id: taskId }, data: { loginAttemptAt: new Date(), loginCredentialHash: digest([credentials.loginAccount, credentials.passwordEncrypted]) } });
      return { status: 'ready', loginAccount: credentials.loginAccount, password: decryptSiteSecret(account.id, 'account-password', credentials.passwordEncrypted) };
    });
  }

  async loginRejected(id: string, sessionId: string, taskId: string) {
    return this.prisma.$transaction(async tx => {
      const { task, account } = await this.ownedTask(tx, id, sessionId, taskId);
      const credentials = await tx.accountCredentials.findUnique({ where: { accountId: account.id } });
      if (credentials && task.loginAttemptAt && digest([credentials.loginAccount, credentials.passwordEncrypted]) === task.loginCredentialHash) {
        await tx.accountCredentials.update({ where: { accountId: account.id }, data: { loginBlocked: true } });
      }
      return { accepted: true };
    });
  }

  /** Agent 报告“登录重试轮次已全部用尽仍未成功”：此时才触发冷却，冷却时长取脚本设置的 loginCooldownMinutes。 */
  async loginFailed(id: string, sessionId: string, taskId: string) {
    return this.prisma.$transaction(async tx => {
      const { task, account, settings } = await this.ownedTask(tx, id, sessionId, taskId);
      const credentials = await tx.accountCredentials.findUnique({ where: { accountId: account.id } });
      // 凭据在本次登录期间被改过则不触发，避免用旧凭据的失败惩罚新凭据
      if (credentials && task.loginAttemptAt && digest([credentials.loginAccount, credentials.passwordEncrypted]) === task.loginCredentialHash) {
        await tx.accountCredentials.update({ where: { accountId: account.id }, data: { loginAttemptAfter: new Date(Date.now() + settings.loginCooldownMinutes * 60_000) } });
      }
      return { accepted: true };
    });
  }
}
