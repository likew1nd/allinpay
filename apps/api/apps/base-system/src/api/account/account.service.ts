import { randomBytes, timingSafeEqual } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AccountStatus, CollectorStatus, Prisma } from '@prisma/client';
import { ulid } from 'ulid';

import { PrismaService } from '@lib/shared/prisma/prisma.service';

import { decryptSiteSecret, encryptSiteSecret } from '../site/site-credentials';
import { normalizeAppIds, readAppIds } from './app-ids';

import { AgentRuntimeService } from './agent-runtime.service';
import { NotificationService } from '../notification/notification.service';
import type { ScriptMonitorHeartbeatDto, ScriptAccountHeartbeatDto } from './dto/script-runtime.dto';
import {
  CollectorHeartbeatDto,
  AccountMode,
  CreateBindingDto,
  CreateCollectorDto,
  UpdateCollectorDto,
  UpdateAccountCredentialsDto,
  CreateFundAccountDto,
  UpdateFundAccountDto,
  PageAccountDto,
  PageCollectorDto,
  PageFundAccountDto,
  CreateSettlementDto,
  PageSettlementDto,
  UpdateBindingDto,
  UpdateScriptSettingsDto,
  NotifyScriptUpdateDto,
} from './dto/account.dto';
import { readMonitoringLogs } from './monitoring-log';
import { compareAccountOrder } from './account-order';
import { publicScriptSettings } from './captcha-credentials';
import { publicSettingsFields } from './script-settings.fields';
import { RestrictionChannelService } from './restriction-channel.service';

const FUND_ACCOUNT_INCLUDE = {
  account: { select: { id: true, name: true, externalId: true, status: true, balance: true, balanceAt: true } },
} as const;

const HEARTBEAT_TIMEOUT_MS = 30_000;

const SCRIPT_SETTING_ID = 'default';
const DEFAULT_SCRIPT_SETTINGS = {
  enabled: false,
  tab1Url: 'https://b.alipay.com/page/home',
  tab2Url: 'https://b.alipay.com/page/self-relieving-web/riskManage/list',
  tab3Url: 'https://open.alipay.com/develop/manage',
  minRefreshSeconds: 45,
  maxRefreshSeconds: 90,
  navigationTimeoutSeconds: 30,
  maxConcurrentAccounts: 1,
  retryCount: 2,
  actionTimeoutSeconds: 15,
  loginCooldownMinutes: 10,
  loginMaxAttempts: 3,
  loginTimeoutMinutes: 3,
  environmentSyncMinutes: 30,
  balanceFreshMinutes: 10,
  qrWaitMinutes: 8,
  sliderOffsetPx: 10,
  captchaProvider: 'NONE',
} as const;

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService, private readonly runtime: AgentRuntimeService, private readonly notifications?: NotificationService,
    private readonly restrictionChannels?: RestrictionChannelService) {}

  async getScriptSettings() {
    const settings = await this.prisma.scriptSetting.upsert({
      where: { id: SCRIPT_SETTING_ID },
      create: { id: SCRIPT_SETTING_ID, ...DEFAULT_SCRIPT_SETTINGS },
      update: {}, select: publicSettingsFields,
    });
    return publicScriptSettings(settings);
  }

  /** 更新范围只能是非空 ID 列表或显式全部，不允许空选择退化为广播。 */
  async notifyScriptUpdate(version: string, target: NotifyScriptUpdateDto): Promise<number> {
    if (target?.all === true) {
      if (target.ids !== undefined) throw new BadRequestException('不能同时指定采集端和全部更新');
    } else if (target?.all !== undefined || !Array.isArray(target?.ids) || !target.ids.length) {
      throw new BadRequestException('请选择要更新的采集端，或明确指定全部更新');
    }
    if (version === '0.0.0') throw new BadRequestException('请先发布脚本包');
    const collectors = await this.prisma.collector.findMany({
      where: target.all === true ? {} : { id: { in: target.ids } },
      select: { id: true },
    });
    for (const collector of collectors) await this.runtime.enqueue(collector.id, 'UPDATE_SCRIPT', { version });
    return collectors.length;
  }

  async updateScriptSettings(dto: UpdateScriptSettingsDto, updatedBy = 'system') {
    if (dto.minRefreshSeconds > dto.maxRefreshSeconds) {
      throw new BadRequestException('最小刷新间隔不能大于最大刷新间隔');
    }
    const existing = await this.prisma.scriptSetting.findUnique({ where: { id: SCRIPT_SETTING_ID }, select: publicSettingsFields });
    const provider = dto.captchaProvider ?? existing?.captchaProvider ?? 'NONE';
    const ttshituUsername = dto.ttshituUsername?.trim() ?? existing?.ttshituUsername ?? '';
    const bingtopUsername = dto.bingtopUsername?.trim() ?? existing?.bingtopUsername ?? '';
    if (!['NONE', 'TTSHITU', 'BINGTOP'].includes(provider)) throw new BadRequestException('不支持的打码平台');
    // 当前选择的平台必须已有账号和密码（本次填写或此前已保存）
    if (provider === 'TTSHITU' && (!ttshituUsername || (!dto.ttshituPassword && !existing?.ttshituPasswordEncrypted))) {
      throw new BadRequestException('请填写图鉴打码平台账号和密码');
    }
    if (provider === 'BINGTOP' && (!bingtopUsername || (!dto.bingtopPassword && !existing?.bingtopPasswordEncrypted))) {
      throw new BadRequestException('请填写滨图打码平台账号和密码');
    }

    const data = {
      loginCooldownMinutes: dto.loginCooldownMinutes ?? existing?.loginCooldownMinutes ?? 10,
      loginMaxAttempts: dto.loginMaxAttempts ?? existing?.loginMaxAttempts ?? 3,
      loginTimeoutMinutes: dto.loginTimeoutMinutes ?? existing?.loginTimeoutMinutes ?? 3,
      environmentSyncMinutes: dto.environmentSyncMinutes ?? existing?.environmentSyncMinutes ?? 30,
      balanceFreshMinutes: dto.balanceFreshMinutes ?? existing?.balanceFreshMinutes ?? 10,
      qrWaitMinutes: dto.qrWaitMinutes ?? existing?.qrWaitMinutes ?? 8,
      ...(dto.closeRestrictedChannels !== undefined && { closeRestrictedChannels: dto.closeRestrictedChannels }),
      ...(dto.restoreRecoveredChannels !== undefined && { restoreRecoveredChannels: dto.restoreRecoveredChannels }),
      sliderOffsetPx: dto.sliderOffsetPx ?? existing?.sliderOffsetPx ?? 10,
      captchaProvider: provider,
      ttshituUsername,
      bingtopUsername,
      // 密码留空表示保持原密文，只有本次填写了才重新加密保存
      ...(dto.ttshituPassword ? { ttshituPasswordEncrypted: encryptSiteSecret(SCRIPT_SETTING_ID, 'ttshitu-password', dto.ttshituPassword) } : {}),
      ...(dto.bingtopPassword ? { bingtopPasswordEncrypted: encryptSiteSecret(SCRIPT_SETTING_ID, 'bingtop-password', dto.bingtopPassword) } : {}),
      enabled: dto.enabled,
      tab1Url: this.normalizeScriptUrl(dto.tab1Url),
      tab2Url: this.normalizeScriptUrl(dto.tab2Url),
      tab3Url: this.normalizeScriptUrl(dto.tab3Url ?? existing?.tab3Url ?? DEFAULT_SCRIPT_SETTINGS.tab3Url, 'open.alipay.com'),
      minRefreshSeconds: dto.minRefreshSeconds,
      maxRefreshSeconds: dto.maxRefreshSeconds,
      navigationTimeoutSeconds: dto.navigationTimeoutSeconds,
      maxConcurrentAccounts: dto.maxConcurrentAccounts ?? existing?.maxConcurrentAccounts ?? 1,
      retryCount: dto.retryCount,
      actionTimeoutSeconds: dto.actionTimeoutSeconds,
      updatedBy: updatedBy.slice(0, 191),
    };
    const settings = await this.prisma.$transaction(async tx => {
      await tx.collector.updateMany({ data: { configRevision: { increment: 1 } } });
      const automationChanged = dto.closeRestrictedChannels !== undefined || dto.restoreRecoveredChannels !== undefined;
      const previous = automationChanged ? (await tx.$queryRaw<{ closeRestrictedChannels: boolean; restoreRecoveredChannels: boolean }[]>`
        SELECT close_restricted_channels AS closeRestrictedChannels, restore_recovered_channels AS restoreRecoveredChannels
        FROM script_setting WHERE id = 'default' FOR UPDATE`)[0] : undefined;
      const saved = await tx.scriptSetting.upsert({
        where: { id: SCRIPT_SETTING_ID }, create: { id: SCRIPT_SETTING_ID, ...data }, update: data, select: publicSettingsFields,
      });
      if (automationChanged && this.restrictionChannels) {
        await this.restrictionChannels.enqueueExisting(tx,
          saved.closeRestrictedChannels && !previous?.closeRestrictedChannels,
          saved.restoreRecoveredChannels && !previous?.restoreRecoveredChannels);
      }
      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    return publicScriptSettings(settings);
  }

  private normalizeScriptUrl(value: string, expectedHost = 'b.alipay.com') {
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'https:' || url.hostname !== expectedHost || url.username || url.password || url.search || url.hash) throw new Error();
      return url.href.replace(/\/$/, '') || url.href;
    } catch {
      throw new BadRequestException(`脚本页面必须使用 ${expectedHost} 的 HTTPS 地址`);
    }
  }

  async pageFundAccounts(query: PageFundAccountDto) {
    const where: Prisma.FundAccountWhereInput = {
      ...(query.keyword ? { OR: [{ name: { contains: query.keyword } }, { owner: { contains: query.keyword } }] } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.fundAccount.findMany({ where, include: FUND_ACCOUNT_INCLUDE, orderBy: { createdAt: 'desc' }, skip: (query.current - 1) * query.size, take: query.size }),
      this.prisma.fundAccount.count({ where }),
    ]);
    return { current: query.current, size: query.size, total, records };
  }

  async createFundAccount(dto: CreateFundAccountDto) {
    const name = dto.name.trim();
    const owner = dto.owner.trim();
    if (!name || !owner) throw new BadRequestException('账户名称和归属主体不能为空');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.checkFundBinding(tx, dto.accountId);
        return tx.fundAccount.create({
          data: { id: `fund-account-${ulid().toLowerCase()}`, name, owner, accountId: dto.accountId ?? null },
          include: FUND_ACCOUNT_INCLUDE,
        });
      });
    } catch (error) {
      this.rethrowFundBindingError(error);
    }
  }

  async updateFundAccount(id: string, dto: UpdateFundAccountDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 与转账生成共用资金账户锁，防止检查历史记录时产生新的转账。
        await tx.$queryRaw(Prisma.sql`SELECT id FROM fund_account WHERE id = ${id} FOR UPDATE`);
        const fund = await tx.fundAccount.findUnique({ where: { id } });
        if (!fund) throw new NotFoundException('资金账户不存在');
        if (dto.accountId !== undefined && dto.accountId !== fund.accountId) {
          const [request, rule] = await Promise.all([
            tx.transferRequest.findFirst({ where: { fundAccountId: id }, select: { id: true } }),
            tx.transferRule.findFirst({ where: { fundAccountId: id, enabled: true }, select: { id: true } }),
          ]);
          if (request || rule) throw new ConflictException('已有转账记录或启用中的规则，不能改绑采集账号');
          await this.checkFundBinding(tx, dto.accountId);
        }
        return tx.fundAccount.update({
          where: { id }, data: { accountId: dto.accountId }, include: FUND_ACCOUNT_INCLUDE,
        });
      });
    } catch (error) {
      this.rethrowFundBindingError(error);
    }
  }

  private async checkFundBinding(tx: Prisma.TransactionClient, accountId: string | null | undefined) {
    if (!accountId) return;
    const account = await tx.account.findUnique({ where: { id: accountId }, select: { id: true } });
    if (!account) throw new NotFoundException('采集账号不存在');
    const existing = await tx.fundAccount.findFirst({ where: { accountId }, select: { id: true } });
    if (existing) throw new ConflictException('该采集账号已关联资金账户');
  }

  private rethrowFundBindingError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ConflictException('该采集账号已关联资金账户');
    throw error;
  }
  async pageSettlements(query: PageSettlementDto) {
    const where: Prisma.SettlementRecordWhereInput = query.status ? { status: query.status } : {};
    const [records, total] = await this.prisma.$transaction([
      this.prisma.settlementRecord.findMany({ where, include: { fundAccount: { select: { id: true, name: true } } }, orderBy: { periodEnd: 'desc' }, skip: (query.current - 1) * query.size, take: query.size }),
      this.prisma.settlementRecord.count({ where }),
    ]);
    return { current: query.current, size: query.size, total, records };
  }

  async createSettlement(dto: CreateSettlementDto) {
    const account = await this.prisma.fundAccount.findUnique({ where: { id: dto.fundAccountId } });
    if (!account) throw new NotFoundException('资金账户不存在');
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException('结算金额无效');
    return this.prisma.settlementRecord.create({
      data: { id: `settlement-${ulid().toLowerCase()}`, fundAccountId: account.id, periodStart: new Date(dto.periodStart), periodEnd: new Date(dto.periodEnd), amount: dto.amount, fee: dto.fee || '0', note: dto.note?.trim() },
      include: { fundAccount: { select: { id: true, name: true } } },
    });
  }

  async getCollectorStatistics(collectorId?: string) {
    const collectors = await this.prisma.collector.findMany({
      where: collectorId ? { id: collectorId } : {},
      select: { id: true, status: true, lastHeartbeatAt: true, monitoringEnabled: true },
    });
    if (collectorId && !collectors.length) throw new NotFoundException('采集端不存在');
    const accounts = collectors.length ? await this.prisma.account.findMany({
      where: { collectorId: { in: collectors.map(collector => collector.id) }, profilePresent: true },
      select: {
        collectorId: true, monitoringEnabled: true, status: true, scriptLeaseUntil: true,
        businessStatus: true, restrictionActive: true, judicialActive: true,
        balance: true, unavailableBalance: true, pendingBalance: true,
        credentials: { select: { appId: true, appIds: true } },
      },
    }) : [];
    const appIds = [...new Set(accounts.flatMap(account => readAppIds(account.credentials?.appIds, account.credentials?.appId)))];
    const channels = appIds.length ? await this.prisma.epayChannel.findMany({
      where: { OR: appIds.map(appId => ({ details: { path: '$.appId', equals: appId } })) },
      select: { details: true },
    }) : [];
    const linkedAppIds = new Set(channels.flatMap(channel => {
      const appId = (channel.details as { appId?: string } | null)?.appId;
      return appId ? [appId] : [];
    }));
    const enabledCollectors = new Set(collectors.filter(collector => collector.monitoringEnabled).map(collector => collector.id));
    const monitoring = accounts.filter(account => account.monitoringEnabled && enabledCollectors.has(account.collectorId!));
    const statuses = collectors.map(collector => this.publicCollector(collector).status);
    const restricted = accounts.filter(account => account.restrictionActive || account.businessStatus === 'RESTRICTED');
    const judicial = accounts.filter(account => account.judicialActive || account.businessStatus === 'JUDICIAL');
    const now = new Date();
    // 金额用 Decimal 汇总，全部未上报时保持未知，不能展示为零。
    const sum = (field: 'balance' | 'unavailableBalance' | 'pendingBalance') => {
      const amounts = accounts.flatMap(account => account[field] === null ? [] : [account[field]!]);
      return accounts.length && !amounts.length ? null : amounts.reduce((total, amount) => total.add(amount), new Prisma.Decimal(0)).toFixed(2);
    };
    return {
      collectors: {
        total: collectors.length,
        online: statuses.filter(status => status === 'ONLINE').length,
        offline: statuses.filter(status => status === 'OFFLINE').length,
        error: statuses.filter(status => status === 'ERROR').length,
      },
      environments: {
        total: accounts.length,
        linked: accounts.filter(account => readAppIds(account.credentials?.appIds, account.credentials?.appId).some(appId => linkedAppIds.has(appId))).length,
        monitoring: monitoring.length,
        running: monitoring.filter(account => computeRuntimeState(account.scriptLeaseUntil, account.status, now) === 'RUNNING').length,
        abnormal: accounts.filter(account => account.restrictionActive || account.judicialActive || ['RESTRICTED', 'JUDICIAL'].includes(account.businessStatus)).length,
        restricted: restricted.length,
        judicial: judicial.length,
        unknown: accounts.filter(account => !account.restrictionActive && !account.judicialActive && account.businessStatus === 'UNKNOWN').length,
      },
      balances: {
        available: sum('balance'), unavailable: sum('unavailableBalance'), pending: sum('pendingBalance'),
        unreportedEnvironmentCount: accounts.filter(account => account.balance === null || account.unavailableBalance === null || account.pendingBalance === null).length,
      },
    };
  }

  async pageCollectors(query: PageCollectorDto) {
    const offlineAt = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
    const connectionWhere: Prisma.CollectorWhereInput = query.status === 'OFFLINE'
      ? { status: { not: 'ERROR' }, OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: offlineAt } }] }
      : query.status === 'ONLINE' ? { status: 'ONLINE', lastHeartbeatAt: { gte: offlineAt } }
      : query.status === 'ERROR' ? { status: 'ERROR' } : {};
    const where: Prisma.CollectorWhereInput = {
      ...(query.keyword ? { name: { contains: query.keyword } } : {}),
      ...connectionWhere,
    };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.collector.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (query.current - 1) * query.size, take: query.size,
        include: { _count: { select: { accounts: { where: { profilePresent: true } } } },
          commands: { where: { kind: { not: 'MONITOR_ACCOUNT' } }, orderBy: { createdAt: 'desc' }, take: 3,
            select: { id: true, kind: true, status: true, createdAt: true, completedAt: true, error: true } } },
      }),
      this.prisma.collector.count({ where }),
    ]);
    const collectorId = { in: records.map(record => record.id) };
    const [statuses, balances, accounts] = records.length ? await Promise.all([
      this.prisma.account.groupBy({
        by: ['collectorId', 'businessStatus'], orderBy: { collectorId: 'asc' }, where: { collectorId, profilePresent: true }, _count: true,
      }),
      this.prisma.account.groupBy({
        by: ['collectorId'], orderBy: { collectorId: 'asc' }, where: { collectorId, profilePresent: true },
        _sum: { balance: true, unavailableBalance: true, pendingBalance: true },
        _count: { _all: true, balance: true, unavailableBalance: true, pendingBalance: true },
      }),
      this.prisma.account.findMany({
        where: { collectorId, profilePresent: true },
        select: { collectorId: true, balance: true, unavailableBalance: true, pendingBalance: true, credentials: { select: { appId: true, appIds: true } } },
      }),
    ]) : [[], [], []];
    const appIds = [...new Set(accounts.flatMap(account => readAppIds(account.credentials?.appIds, account.credentials?.appId)))];
    const channels = appIds.length ? await this.prisma.epayChannel.findMany({
      where: { OR: appIds.map(appId => ({ details: { path: '$.appId', equals: appId } })) },
      select: { details: true },
    }) : [];
    const linkedAppIds = new Set(channels.flatMap(channel => {
      const appId = (channel.details as { appId?: string } | null)?.appId;
      return appId ? [appId] : [];
    }));
    return {
      current: query.current, size: query.size, total,
      records: records.map(record => ({
        ...this.publicCollector(record),
        environmentCount: record._count.accounts,
        linkedEnvironmentCount: accounts.filter(account => account.collectorId === record.id &&
          readAppIds(account.credentials?.appIds, account.credentials?.appId).some(appId => linkedAppIds.has(appId))).length,
        accountSummary: Object.fromEntries(['NORMAL', 'RESTRICTED', 'JUDICIAL', 'UNKNOWN'].map(status => [
          status, statuses.find(item => item.collectorId === record.id && item.businessStatus === status)?._count ?? 0,
        ])),
        balances: balances.filter(item => item.collectorId === record.id).map(item => ({
          available: item._sum.balance?.toFixed(2) ?? null,
          unavailable: item._sum.unavailableBalance?.toFixed(2) ?? null,
          pending: item._sum.pendingBalance?.toFixed(2) ?? null,
          unreportedEnvironmentCount: accounts.filter(account => account.collectorId === record.id &&
            (account.balance === null || account.unavailableBalance === null || account.pendingBalance === null)).length,
          partial: item._count.balance !== item._count._all || item._count.unavailableBalance !== item._count._all ||
            item._count.pendingBalance !== item._count._all,
        })),
      })),
    };
  }

  async getCollector(id: string) {
    const collector = await this.prisma.collector.findUnique({
      where: { id }, include: { _count: { select: { accounts: { where: { profilePresent: true } } } },
        commands: { where: { kind: { not: 'MONITOR_ACCOUNT' } }, orderBy: { createdAt: 'desc' }, take: 3,
          select: { id: true, kind: true, status: true, createdAt: true, completedAt: true, error: true } } },
    });
    if (!collector) throw new NotFoundException('采集端不存在');
    return this.publicCollector(collector);
  }

  async createCollector(dto: CreateCollectorDto) {
    // 自定义 ID 或自动生成
    const id = dto.customId?.trim() || `collector-${ulid().toLowerCase()}`;
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('采集端名称不能为空');
    // 自定义 ID 不能与已有采集端重复
    const existing = await this.prisma.collector.findUnique({ where: { id }, select: { id: true } });
    if (existing) throw new ConflictException(`采集端 ID "${id}" 已存在，请换一个`);
    // 自定义 Token 或自动生成
    const token = dto.customToken?.trim() || randomBytes(32).toString('base64url');
    const collector = await this.prisma.collector.create({
      data: {
        id, name,
        tokenEncrypted: encryptSiteSecret(id, 'collector-token', token),
      },
      include: { _count: { select: { accounts: true } } },
    });
    // 创建响应附带明文，普通详情与列表不返回。
    return { ...this.publicCollector(collector), token };
  }

  async updateCollector(id: string, dto: UpdateCollectorDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('采集端名称不能为空');
    const collector = await this.prisma.collector.update({
      where: { id },
      data: { name },
      include: { _count: { select: { accounts: true } } },
    }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException('采集端不存在');
      throw error;
    });
    return this.publicCollector(collector);
  }

  async syncCollector(id: string) {
    const command = await this.runtime.enqueue(id, 'SYNC_ENVIRONMENTS');
    return { id, commandId: command.id, status: command.status };
  }

  async queueAccountAppIdRefresh(collectorId: string, ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) throw new BadRequestException('请先选择环境');
    const now = new Date();
    return this.prisma.$transaction(async tx => {
      await tx.collector.update({ where: { id: collectorId }, data: { configRevision: { increment: 1 } } });
      const accounts = await tx.account.findMany({ where: { collectorId, id: { in: uniqueIds }, profilePresent: true }, select: { id: true, appIdsRefreshRequestedAt: true } });
      if (accounts.length !== uniqueIds.length) throw new NotFoundException('所选环境不存在或已移除');
      for (const account of accounts) {
        const requestedAt = account.appIdsRefreshRequestedAt && account.appIdsRefreshRequestedAt >= now
          ? new Date(account.appIdsRefreshRequestedAt.getTime() + 1)
          : now;
        await tx.account.update({ where: { id: account.id }, data: { appIdsRefreshRequestedAt: requestedAt, scriptNextAt: now } });
      }
      return { queued: uniqueIds.length };
    });
  }

  /** 切换采集端监控开关；递增配置版本，让 Agent 重新拉取配置并停止/恢复任务 */
  async updateCollectorMonitoring(id: string, monitoringEnabled: boolean) {
    const collector = await this.prisma.collector.update({
      where: { id },
      data: { monitoringEnabled, configRevision: { increment: 1 } },
      include: { _count: { select: { accounts: true } } },
    }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException('采集端不存在');
      throw error;
    });
    return this.publicCollector(collector);
  }

  async pageCollectorAccounts(id: string, query: PageAccountDto) {
    await this.getCollector(id);
    return this.pageAccounts({ ...query, collectorId: id });
  }
  // 管理员按需查看当前凭据，不轮换或改写数据库。
  async getCollectorToken(id: string) {
    const collector = await this.prisma.collector.findUnique({
      where: { id }, select: { tokenEncrypted: true },
    });
    if (!collector) throw new NotFoundException('采集端不存在');
    if (!collector.tokenEncrypted) throw new ServiceUnavailableException('采集端尚无 Token，请先重置');
    return { token: decryptSiteSecret(id, 'collector-token', collector.tokenEncrypted) };
  }

  // 重置采集端凭据：旧凭据立即失效，新明文只在本次返回
  async resetCollectorToken(id: string) {
    const token = randomBytes(32).toString('base64url');
    const collector = await this.prisma.collector
      .update({
        where: { id },
        data: { tokenEncrypted: encryptSiteSecret(id, 'collector-token', token) },
        include: { _count: { select: { accounts: true } } },
      })
      .catch(error => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException('采集端不存在');
        throw error;
      });
    return { ...this.publicCollector(collector), token };
  }

  async removeCollector(id: string) {
    await this.prisma.$transaction(async tx => {
      // 与环境同步共用采集端行锁，清理和删除必须一起成功，避免遗留无归属环境。
      await tx.$queryRaw(Prisma.sql`SELECT id FROM collector WHERE id = ${id} FOR UPDATE`);
      await tx.account.deleteMany({ where: { collectorId: id } });
      await tx.collector.delete({ where: { id } });
    }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException('采集端不存在');
      throw error;
    });
    return { id };
  }

  async getAccountCredentials(collectorId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, collectorId },
      select: { credentials: { select: { loginAccount: true, appId: true, appIds: true, passwordEncrypted: true, paymentPasswordEncrypted: true } } },
    });
    if (!account) throw new NotFoundException('账号不存在');
    const appIds = readAppIds(account.credentials?.appIds, account.credentials?.appId);
    return {
      loginAccount: account.credentials?.loginAccount ?? '',
      appId: appIds[0] ?? '',
      appIds,
      hasPassword: Boolean(account.credentials?.passwordEncrypted),
      hasPaymentPassword: Boolean(account.credentials?.paymentPasswordEncrypted),
    };
  }

  async updateAccountCredentials(collectorId: string, id: string, dto: UpdateAccountCredentialsDto) {
    const appIds = normalizeAppIds(dto.appIds ?? [dto.appId]);
    const fields = {
      loginAccount: dto.loginAccount.trim(),
      loginAttemptAfter: null, loginBlocked: false,
      appId: appIds[0] ?? '',
      appIds: appIds as Prisma.InputJsonValue,
      ...(dto.password ? { passwordEncrypted: encryptSiteSecret(id, 'account-password', dto.password) } : {}),
      ...(dto.paymentPassword ? { paymentPasswordEncrypted: encryptSiteSecret(id, 'account-payment-password', dto.paymentPassword) } : {}),
    };
    return this.prisma.$transaction(async tx => {
      await tx.collector.update({ where: { id: collectorId }, data: { configRevision: { increment: 1 } } });
      return tx.account.update({
        where: { id, collectorId },
        data: { credentials: { upsert: { create: fields, update: fields } } }, select: { id: true },
      });
    }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException('账号不存在');
      throw error;
    });
  }

  async getAccountMonitoringLogs(collectorId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, collectorId },
      select: { monitoringLogs: true },
    });
    if (!account) throw new NotFoundException('账号不存在');
    return { records: readMonitoringLogs(account.monitoringLogs) };
  }

  /** 读取单张巡检截图。列表接口不带图片，查看或展示缩略图时按需读取。 */
  async getAccountEvidence(collectorId: string, id: string, kind: 'restriction' | 'judicial') {
    const account = await this.prisma.account.findFirst({
      where: { id, collectorId },
      select: kind === 'restriction'
        ? { restrictionImage: true, restrictionImageAt: true }
        : { judicialImage: true, judicialImageAt: true },
    });
    if (!account) throw new NotFoundException('账号不存在');
    const record = account as { restrictionImage?: string | null; restrictionImageAt?: Date | null; judicialImage?: string | null; judicialImageAt?: Date | null };
    return kind === 'restriction'
      ? { image: record.restrictionImage ?? null, capturedAt: record.restrictionImageAt?.toISOString() ?? null }
      : { image: record.judicialImage ?? null, capturedAt: record.judicialImageAt?.toISOString() ?? null };
  }
  private async lockAccountConfiguration(tx: Prisma.TransactionClient, id: string) {
    const owner = await tx.account.findUnique({ where: { id }, select: { collectorId: true } });
    if (!owner) throw new NotFoundException('账号不存在');
    // 与任务领取、Telegram 操作保持同一锁序，防止模式切换互相等待。
    if (owner.collectorId) await tx.$queryRaw(Prisma.sql`SELECT id FROM collector WHERE id = ${owner.collectorId} FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM account WHERE id = ${id} FOR UPDATE`);
    const account = await tx.account.findUnique({ where: { id }, select: {
      id: true, collectorId: true, profilePresent: true, monitoringEnabled: true,
      transferListed: true, transferEnabled: true, transferRuleId: true,
      credentials: { select: { paymentPasswordEncrypted: true } },
    } });
    if (!account) throw new NotFoundException('账号不存在');
    if (account.collectorId !== owner.collectorId) throw new ConflictException('环境归属已变化，请刷新后重试');
    return account;
  }

  async updateAccountMode(id: string, mode: AccountMode) {
    return this.prisma.$transaction(async tx => {
      const account = await this.lockAccountConfiguration(tx, id);
      if (!account.collectorId || !account.profilePresent) throw new NotFoundException('环境不存在或未关联采集端');
      const monitoringEnabled = mode !== 'OFF';
      const transferEnabled = mode === 'TRANSFER';
      if (transferEnabled && !account.credentials?.paymentPasswordEncrypted) {
        throw new ConflictException('请先为该环境设置支付密码，再开启自动转账');
      }
      const monitoringChanged = account.monitoringEnabled !== monitoringEnabled;
      if (monitoringChanged) {
        await tx.collector.update({ where: { id: account.collectorId }, data: { configRevision: { increment: 1 } } });
      }
      const updated = await tx.account.update({ where: { id }, data: {
        monitoringEnabled, transferListed: transferEnabled, transferEnabled,
        ...(monitoringChanged ? { scriptNextAt: new Date(), scriptLeaseUntil: null, scriptLeaseOwner: null } : {}),
        ...(!monitoringChanged && transferEnabled && !account.transferEnabled ? { scriptNextAt: new Date() } : {}),
      }, select: { id: true, monitoringEnabled: true, transferListed: true, transferEnabled: true, transferRuleId: true } });
      if (!transferEnabled) {
        await tx.transferRequest.updateMany({ where: { accountId: id, status: 'READY' },
          data: { status: 'CANCELLED', completedAt: new Date(), resultNote: '环境已切换为非转账模式' } });
      }
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async updateAccountMonitoring(id: string, monitoringEnabled: boolean, transaction?: Prisma.TransactionClient) {
    const apply = async (tx: Prisma.TransactionClient) => {
      const existing = await this.lockAccountConfiguration(tx, id);
      if (!monitoringEnabled && existing.transferEnabled) throw new ConflictException('转账模式必须开启监控，请通过模式开关关闭转账');
      if (existing.collectorId) await tx.collector.update({ where: { id: existing.collectorId }, data: { configRevision: { increment: 1 } } });
      return tx.account.update({ where: { id }, data: { monitoringEnabled, scriptNextAt: new Date(), scriptLeaseUntil: null, scriptLeaseOwner: null } });
    };
    const account = await (transaction ? apply(transaction) : this.prisma.$transaction(apply, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException('账号不存在');
      throw error;
    });
    return { id: account.id, monitoringEnabled: account.monitoringEnabled };
  }

  async batchUpdateAccountMonitoring(ids: string[], monitoringEnabled: boolean) {
    if (!ids.length) return { updated: 0, monitoringEnabled };
    const result = await this.prisma.$transaction(async tx => {
      const owners = await tx.account.findMany({ where: { id: { in: ids } }, select: { collectorId: true } });
      const collectors = [...new Set(owners.flatMap(account => account.collectorId ? [account.collectorId] : []))].sort();
      for (const collectorId of collectors) {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM collector WHERE id = ${collectorId} FOR UPDATE`);
      }
      await tx.$queryRaw(Prisma.sql`SELECT id FROM account WHERE id IN (${Prisma.join([...new Set(ids)].sort())}) ORDER BY id FOR UPDATE`);
      const accounts = await tx.account.findMany({ where: { id: { in: ids } }, select: { collectorId: true, transferEnabled: true } });
      if (accounts.some(account => account.collectorId && !collectors.includes(account.collectorId))) {
        throw new ConflictException('环境归属已变化，请刷新后重试');
      }
      if (!monitoringEnabled && accounts.some(account => account.transferEnabled)) {
        throw new ConflictException('所选环境包含转账模式，请通过模式开关关闭转账');
      }
      for (const collectorId of collectors) await tx.collector.update({ where: { id: collectorId }, data: { configRevision: { increment: 1 } } });
      return tx.account.updateMany({ where: { id: { in: ids } }, data: { monitoringEnabled, scriptNextAt: new Date(), scriptLeaseUntil: null, scriptLeaseOwner: null } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    return { updated: result.count, monitoringEnabled };
  }

  async pageAccounts(query: PageAccountDto) {
    const where: Prisma.AccountWhereInput = {
      ...(query.transferOnly ? { transferListed: true } : {}),
      profilePresent: true,
      ...(query.keyword
        ? {
            OR: [
              { externalId: { contains: query.keyword } },
              { name: { contains: query.keyword } },
              { profileNo: { contains: query.keyword } },
              { credentials: { is: { loginAccount: { contains: query.keyword } } } },
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      // 删除采集端后归属置空的历史记录不属于当前环境清单。
      collectorId: query.collectorId || { not: null },
    };
    // 按编号数字升序排列。MySQL 无法对字符串编号按数字排序，所以先取轻量的排序键，在内存里排好再分页，
    // 完整记录只为当前页读取。顺序只由编号决定，状态、最近采集时间变化不会让行跳位。
    const keys = await this.prisma.account.findMany({ where, select: { id: true, profileNo: true, externalId: true } });
    keys.sort(compareAccountOrder);
    const total = keys.length;
    const ids = keys.slice((query.current - 1) * query.size, query.current * query.size).map(item => item.id);
    const found = await this.prisma.account.findMany({
      omit: { monitoringLogs: true, monitoringTabBindings: true, restrictionImage: true, judicialImage: true },
      where: { id: { in: ids } },
      include: {
        collector: { select: { id: true, name: true, status: true, lastHeartbeatAt: true } },
        credentials: { select: { loginAccount: true, appId: true, appIds: true } },
        bindings: { include: { site: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
      },
    });
    const byId = new Map(found.map(record => [record.id, record]));
    const records = ids.flatMap(id => (byId.has(id) ? [byId.get(id)!] : []));
    const appIds = [...new Set(records.flatMap(record => readAppIds(record.credentials?.appIds, record.credentials?.appId)))];
    const channels = appIds.length ? await this.prisma.epayChannel.findMany({
      where: { OR: appIds.map(appId => ({ details: { path: '$.appId', equals: appId } })) },
      select: { code: true, name: true, details: true, site: { select: { id: true, name: true } } },
      orderBy: [{ siteId: 'asc' }, { code: 'asc' }],
    }) : [];
    const now = new Date();
    return {
      current: query.current, size: query.size, total,
      records: records.map(({ credentials, ...record }) => {
        const accountAppIds = new Set(readAppIds(credentials?.appIds, credentials?.appId));
        const sites = new Map<string, { id: string; name: string; channels: { code: string; name: string; appId: string }[] }>();
        for (const channel of channels) {
          const appId = (channel.details as { appId?: string } | null)?.appId;
          if (!appId || !accountAppIds.has(appId)) continue;
          let site = sites.get(channel.site.id);
          if (!site) {
            site = { ...channel.site, channels: [] };
            sites.set(site.id, site);
          }
          site.channels.push({ code: channel.code, name: channel.name, appId });
        }
        return {
          ...record,
          loginAccount: credentials?.loginAccount ?? '',
          linkedSites: [...sites.values()],
          // 运行状态：租约有效视为正在运行，否则为空闲
          runtimeState: computeRuntimeState(record.scriptLeaseUntil, record.status, now),
        };
      }),
    };
  }

  async pageBindings(query: PageAccountDto) {
    const where: Prisma.AccountBindingWhereInput = {
      ...(query.collectorId ? { account: { collectorId: query.collectorId } } : {}),
      ...(query.keyword
        ? {
            OR: [
              { channelCode: { contains: query.keyword } },
              { account: { externalId: { contains: query.keyword } } },
              { site: { name: { contains: query.keyword } } },
            ],
          }
        : {}),
    };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.accountBinding.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.current - 1) * query.size,
        take: query.size,
        include: {
          account: { select: { id: true, externalId: true, name: true, status: true } },
          site: { select: { id: true, name: true } },
        },
      }),
      this.prisma.accountBinding.count({ where }),
    ]);
    return { current: query.current, size: query.size, total, records };
  }

  async createBinding(dto: CreateBindingDto) {
    const [account, channel] = await Promise.all([
      this.prisma.account.findUnique({ where: { id: dto.accountId }, select: { id: true } }),
      this.prisma.epayChannel.findFirst({ where: { siteId: dto.siteId, code: dto.channelCode }, select: { code: true } }),
    ]);
    if (!account) throw new NotFoundException('账号不存在');
    if (!channel) throw new BadRequestException('站点通道不存在，请先完成站点同步');
    try {
      return await this.prisma.accountBinding.create({
        data: { id: `account-binding-${ulid().toLowerCase()}`, accountId: dto.accountId, siteId: dto.siteId, channelCode: dto.channelCode },
        include: { account: { select: { id: true, externalId: true, name: true, status: true } }, site: { select: { id: true, name: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('该账号与通道绑定已存在');
      throw error;
    }
  }

  async findEnabledBinding(siteId: string, accountId?: string) {
    if (!accountId) return null;
    const binding = await this.prisma.accountBinding.findFirst({
      where: { siteId, accountId, enabled: true },
      include: { account: { select: { id: true, externalId: true, name: true, status: true } } },
    });
    return binding ? { binding, account: binding.account } : null;
  }

  async updateBinding(id: string, dto: UpdateBindingDto) {
    const binding = await this.prisma.accountBinding.findUnique({ where: { id } });
    if (!binding) throw new NotFoundException('账号绑定不存在');
    return this.prisma.accountBinding.update({
      where: { id },
      data: { ...(dto.enabled === undefined ? {} : { enabled: dto.enabled }) },
      include: { account: { select: { id: true, externalId: true, name: true, status: true } }, site: { select: { id: true, name: true } } },
    });
  }

  async removeBinding(id: string) {
    await this.prisma.accountBinding.delete({ where: { id } }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException('账号绑定不存在');
      throw error;
    });
    return { id };
  }

  async getScriptRuntimeSettings(id: string, token?: string) {
    await this.authenticateCollector(id, token);
    const settings = await this.getScriptSettings();
    // 运行端只读取巡检参数，不下发管理字段或其他凭据。
    const { enabled, tab1Url, tab2Url, tab3Url, minRefreshSeconds, maxRefreshSeconds, navigationTimeoutSeconds,
      maxConcurrentAccounts, retryCount, actionTimeoutSeconds, updatedAt } = settings;
    return { enabled, tab1Url, tab2Url, tab3Url, minRefreshSeconds, maxRefreshSeconds, navigationTimeoutSeconds,
      maxConcurrentAccounts, retryCount, actionTimeoutSeconds, updatedAt };
  }

  async getScriptRuntimeAccounts(id: string, token?: string) {
    await this.authenticateCollector(id, token);
    return this.prisma.account.findMany({
      where: { collectorId: id, monitoringEnabled: true, profilePresent: true },
      select: { externalId: true, name: true, profileNo: true },
      orderBy: { id: 'asc' },
    });
  }

  async receiveScriptHeartbeat(id: string, token: string | undefined, dto: ScriptMonitorHeartbeatDto) {
    await this.authenticateCollector(id, token);
    if (dto.collectorId !== id) throw new BadRequestException('心跳采集端与请求路径不一致');
    const now = new Date();
    const statuses: Record<ScriptAccountHeartbeatDto['status'], AccountStatus> = {
      LOGGED_IN: AccountStatus.HEALTHY,
      LOGIN_REQUIRED: AccountStatus.AUTH_EXPIRED,
      PASSWORD_REJECTED: AccountStatus.PASSWORD_REJECTED,
      QR_LOGIN_REQUIRED: AccountStatus.AUTH_EXPIRED,
      CAPTCHA_REQUIRED: AccountStatus.CAPTCHA_REQUIRED,
      PAGE_ERROR: AccountStatus.DEGRADED,
      ENV_UNAVAILABLE: AccountStatus.ENV_UNAVAILABLE,
      UNKNOWN: AccountStatus.UNKNOWN,
    };
    const accepted = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM collector WHERE id = ${id} FOR UPDATE`);
      let count = 0;
      for (const item of dto.accounts) {
        // 不创建陌生账号，也不修改其他采集端或已关闭监控的账号。
        const targetStatus = statuses[item.status];

        // 密码错误时暂停监控与转账，保留列表归属和策略以便修复后恢复。
        const shouldDisableMonitoring = item.status === 'PASSWORD_REJECTED';

        const result = await tx.account.updateMany({
          where: { collectorId: id, externalId: item.externalId, monitoringEnabled: true, profilePresent: true },
          data: {
            status: targetStatus,
            browserState: item.status,
            lastSeenAt: now,
            lastError: item.error ?? null,
            ...(shouldDisableMonitoring ? { monitoringEnabled: false, transferEnabled: false } : {}),
            metadata: { source: 'WINDOWS_AGENT', scriptVersion: dto.scriptVersion,
              observedAt: now.toISOString(), tabs: item.tabs, lastAction: item.lastAction ?? null } as unknown as Prisma.InputJsonValue,
          },
        });
        if (result.count && shouldDisableMonitoring) {
          await tx.transferRequest.updateMany({
            where: { status: 'READY', account: { collectorId: id, externalId: item.externalId } },
            data: { status: 'CANCELLED', completedAt: now, resultNote: '登录密码错误，已自动暂停转账' },
          });
        }
        if (result.count && this.notifications) {
          const account = await tx.account.findFirst({ where: { collectorId: id, externalId: item.externalId }, select: { id: true } });
          if (account) await this.notifications.account(tx, account.id, `heartbeat:${now.toISOString()}`, item.status);
        }
        count += result.count;
      }
      await tx.collector.update({
        where: { id },
        data: { status: CollectorStatus.ONLINE, version: dto.scriptVersion, lastHeartbeatAt: now, lastError: null },
      });
      return count;
    });
    return { accepted, rejected: dto.accounts.length - accepted,
      nextHeartbeatAt: new Date(now.getTime() + DEFAULT_SCRIPT_SETTINGS.minRefreshSeconds * 1000).toISOString() };
  }

  async authenticateCollector(id: string, token?: string) {
    const collector = await this.prisma.collector.findUnique({ where: { id }, select: { tokenEncrypted: true } });
    if (!collector?.tokenEncrypted || !token) throw new UnauthorizedException('采集端凭据无效');
    const expected = decryptSiteSecret(id, 'collector-token', collector.tokenEncrypted);
    if (Buffer.byteLength(token) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) throw new UnauthorizedException('采集端凭据无效');
  }

  async receiveHeartbeat(id: string, token: string | undefined, dto: CollectorHeartbeatDto) {
    await this.authenticateCollector(id, token);
    const now = new Date();
    const status = dto.error ? CollectorStatus.ERROR : dto.status === CollectorStatus.ERROR ? CollectorStatus.ERROR : CollectorStatus.ONLINE;
    const result = await this.prisma.$transaction(async tx => {
      const collector = await tx.collector.update({
        where: { id },
        data: { status, version: dto.version, metadata: dto.metadata as Prisma.InputJsonValue | undefined, lastError: dto.error ?? null, lastHeartbeatAt: now },
      });
      let accepted = 0;
      for (const item of dto.accounts ?? []) {
        const existing = await tx.account.findFirst({ where: { collectorId: id, externalId: item.externalId }, select: { id: true } });
        const data = {
          name: item.name,
          status: item.status,
          browserState: item.browserState,
          businessStatus: item.businessStatus,
          receiptLimit: item.receiptLimit,
          paymentLimit: item.paymentLimit,
          unavailableBalance: item.unavailableBalance,
          pendingBalance: item.pendingBalance,
          lastSeenAt: now,
          lastError: item.error ?? null,
          metadata: item.metadata as Prisma.InputJsonValue | undefined,
          // 页面采集到的余额：上报了才更新，没上报不覆盖旧值
          ...(item.balance !== undefined
            ? {
                balance: item.balance,
                balanceAt: now,
              }
            : {}),
        };
        if (existing) await tx.account.update({ where: { id: existing.id }, data });
        else await tx.account.create({ data: { id: `account-${ulid().toLowerCase()}`, collectorId: id, externalId: item.externalId, ...data } });
        if (this.notifications) {
          const account = await tx.account.findFirst({ where: { collectorId: id, externalId: item.externalId }, select: { id: true } });
          if (account) await this.notifications.account(tx, account.id, `heartbeat:${now.toISOString()}`, item.browserState ?? item.status, item.businessStatus === 'RESTRICTED' ? { restriction: { limited: true } } : item.businessStatus === 'JUDICIAL' ? { judicial: { limited: true } } : undefined);
        }
        accepted += 1;
      }
      return { collector, accepted };
    });
    return { collector: this.publicCollector(result.collector), accepted: result.accepted };
  }

  private publicCollector(collector: { lastHeartbeatAt: Date | null; status: CollectorStatus; [key: string]: any }) {
    const { tokenEncrypted, apiKeyEncrypted, apiEndpoint, syncLeaseOwner, syncLeaseUntil, nextSyncAt,
      scriptLeaseOwner, scriptLeaseUntil, scriptNextAt, agentSessionId, inventorySyncId, inventoryLastCompletedId, ...rest } = collector;
    if (rest.status !== CollectorStatus.ERROR && (!rest.lastHeartbeatAt || Date.now() - rest.lastHeartbeatAt.getTime() > HEARTBEAT_TIMEOUT_MS)) return { ...rest, status: CollectorStatus.OFFLINE };
    return rest;
  }
}

// 运行状态：根据脚本租约和账号状态推导当前环境在干什么
// - 租约有效 → RUNNING（正在监控）
// - 启动失败/环境不可用 → ERROR
// - 待登录/验证码 → PENDING_LOGIN（需人工处理）
// - 其他 → IDLE（空闲，等待下一轮调度）
export function computeRuntimeState(
  scriptLeaseUntil: Date | null,
  status: import('@prisma/client').AccountStatus,
  now: Date = new Date(),
): 'RUNNING' | 'ERROR' | 'PENDING_LOGIN' | 'IDLE' {
  if (scriptLeaseUntil && scriptLeaseUntil.getTime() > now.getTime()) return 'RUNNING';
  if (status === 'ENV_UNAVAILABLE') return 'ERROR';
  if (status === 'AUTH_EXPIRED' || status === 'CAPTCHA_REQUIRED') return 'PENDING_LOGIN';
  return 'IDLE';
}
