import { randomUUID } from 'node:crypto';

import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EpaySite, Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { PrismaService } from '@lib/shared/prisma/prisma.service';

import { PollingMemberError } from '../../../../../libs/shared/site-connector/src/business-mapping';
import { MysqlEpayAdapter } from '../../../../../libs/shared/site-connector/src/mysql-adapter';
import type { SiteControlCommand } from '../../../../../libs/shared/site-connector/src/control';
import { StrategyService } from '../strategy/strategy.service';
import { SyncPageDto, SyncStartDto } from './dto/site-data.dto';
import { decryptSiteSecret } from './site-credentials';
import { SiteDataService } from './site-data.service';
import type { OrderPublication } from './order-snapshot';

class ConnectionFailure extends Error {}
class ConnectionSuperseded extends Error {}

/** Only fixed, actionable messages reach the UI; driver messages can contain credentials or SQL. */
export function connectionError(error: unknown, syncing: boolean): string {
  if (error instanceof ConnectionFailure || error instanceof PollingMemberError) return error.message;
  if (error instanceof Error && error.message === 'Consistent reads require InnoDB') {
    return '业务数据表需要使用 InnoDB 引擎才能一致性同步，请检查数据库表引擎';
  }
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  switch (code) {
    case 'ER_ACCESS_DENIED_ERROR': return '数据库账号或密码错误，请修改连接信息后重试';
    case 'ER_DBACCESS_DENIED_ERROR':
    case 'ER_TABLEACCESS_DENIED_ERROR':
    case 'ER_COLUMNACCESS_DENIED_ERROR': return '数据库访问权限不足，请检查账号对该数据库的读取权限';
    case 'ER_BAD_DB_ERROR': return '数据库不存在，请检查数据库名称';
    case 'ENOTFOUND':
    case 'EAI_AGAIN': return '数据库地址解析失败，请检查数据库地址';
    case 'ECONNREFUSED': return '数据库拒绝连接，请检查地址、端口和数据库是否允许访问';
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
    case 'PROTOCOL_SEQUENCE_TIMEOUT': return '数据库连接或查询超时，请检查网络、端口和访问白名单';
    case 'ECONNRESET':
    case 'PROTOCOL_CONNECTION_LOST': return '数据库连接中断，系统将自动重试';
    default: return syncing
      ? '首次接入或业务数据同步失败，请检查数据库读取权限及业务数据格式，系统将自动重试'
      : '数据库连接或结构检测失败，请检查连接信息和读取权限，系统将自动重试';
  }
}

@Injectable()
export class SiteConnectionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SiteConnectionService.name);
  private readonly active = new Map<string, Promise<void>>();
  private scanning = false;
  private stopping = false;
  private readonly leaseMs = 90_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly data: SiteDataService,
    private readonly strategies: StrategyService,
  ) {}

  onApplicationBootstrap() {
    void this.scan();
  }

  async onModuleDestroy() {
    this.stopping = true;
    await Promise.allSettled(this.active.values());
  }

  @Interval(2000)
  async scan() {
    // 隔离测试可暂停扫描，避免测试实例连接已登记的站点。
    if (this.stopping || this.scanning || process.env.SITE_AUTO_CONNECT_DISABLED === 'Y') return;
    this.scanning = true;
    try {
      const capacity = 4 - this.active.size;
      if (capacity <= 0) return;
      const now = new Date();
      const sites = await this.prisma.epaySite.findMany({
        where: {
          nextConnectionAt: { lte: now },
          OR: [{ connectionLeaseUntil: null }, { connectionLeaseUntil: { lt: now } }],
          id: { notIn: [...this.active.keys()] },
        },
        orderBy: { nextConnectionAt: 'asc' },
        take: capacity,
        select: { id: true },
      });
      for (const site of sites) {
        const task = this.connect(site.id).catch(() => {
          this.logger.error('站点自动连接任务失败，将自动重试');
        }).finally(() => this.active.delete(site.id));
        this.active.set(site.id, task);
      }
    } catch {
      this.logger.error('无法读取待连接站点，将自动重试');
    } finally {
      this.scanning = false;
    }
  }

  private async connect(id: string) {
    const owner = randomUUID();
    const now = new Date();
    const claimed = await this.prisma.epaySite.updateMany({
      where: { id, nextConnectionAt: { lte: now }, OR: [{ connectionLeaseUntil: null }, { connectionLeaseUntil: { lt: now } }] },
      data: { connectionLeaseOwner: owner, connectionLeaseUntil: new Date(Date.now() + this.leaseMs) },
    });
    if (!claimed.count) return;

    let site: EpaySite | null = null;
    let adapter: MysqlEpayAdapter | undefined;
    let runId: string | undefined;
    let published = false;
    let syncing = false;
    let renewing = false;
    let leaseLost = false;
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    const record = async (fields: Prisma.EpaySiteUpdateManyMutationInput = {}) => {
      if (!site || leaseLost || this.stopping) throw new ConnectionSuperseded();
      const updated = await this.prisma.epaySite.updateMany({
        where: { id, syncRevision: site.syncRevision, connectionLeaseOwner: owner, connectionLeaseUntil: { gt: new Date() } },
        data: { ...fields, lastHeartbeatAt: new Date(), connectionLeaseUntil: new Date(Date.now() + this.leaseMs) },
      });
      if (!updated.count) throw new ConnectionSuperseded();
    };
    try {
      site = await this.prisma.epaySite.findUnique({ where: { id } });
      if (!site || site.connectionLeaseOwner !== owner) throw new ConnectionSuperseded();
      await record();
      keepAlive = setInterval(() => {
        if (renewing) return;
        renewing = true;
        void record().catch(() => { leaseLost = true; }).finally(() => { renewing = false; });
      }, 20_000);
      keepAlive.unref();

      if (!site.dbPasswordEncrypted) throw new ConnectionFailure('尚未配置数据库密码，请编辑站点并保存密码');
      let password: string;
      try { password = decryptSiteSecret(id, 'db-password', site.dbPasswordEncrypted); }
      catch { throw new ConnectionFailure('数据库密码无法解密，请检查系统密钥配置或重新保存密码'); }
      adapter = new MysqlEpayAdapter({
        host: site.dbHost, port: site.dbPort, database: site.dbName,
        user: site.dbUser, password, tablePrefix: site.tablePrefix ?? '',
      });
      const report = await adapter.probe().catch(async error => {
        // 本轮探测失败时，人工通道操作也不能沿用旧的兼容结论。
        await record({ structureStatus: 'UNKNOWN', structureReport: Prisma.DbNull });
        throw error;
      });
      const validation = report.validation;
      const prefix = validation?.tablePrefix;
      // 空字符串是合法的无前缀站点；缺少前缀时没有已确认的目标表。
      const compatible = validation?.reason === 'MATCHED' && typeof prefix === 'string' && /^[a-zA-Z0-9_]{0,64}$/.test(prefix);
      await record({
        structureReport: report as unknown as Prisma.InputJsonValue,
        structureStatus: compatible ? 'COMPATIBLE' : 'INCOMPATIBLE',
        adapterVersion: 'epay-pro-2070-v1',
      });
      if (!compatible) {
        throw new ConnectionFailure(validation?.reason === 'AMBIGUOUS_PREFIX'
          ? '检测到多组易支付数据表，请编辑站点并指定表前缀'
          : validation?.reason === 'MISSING_TABLES_OR_COLUMNS'
            ? '数据库结构不兼容，请检查表前缀及结构报告中缺少的表或字段'
            : '未找到匹配的易支付数据表，请检查数据库名称、表前缀和读取权限');
      }
      adapter.setTablePrefix(prefix);
      await record({ tablePrefix: prefix });
      syncing = true;

      // A previous process may have exited halfway through a batch. The site lease is exclusive.
      await this.prisma.epaySyncRun.updateMany({
        where: { siteId: id, status: 'RUNNING' },
        data: { status: 'FAILED', error: '连接任务已重新启动，将重新同步', completedAt: new Date() },
      });
      let page = 0;
      let publication: OrderPublication | undefined;
      const previous = await this.data.orderManifest(site);
      for await (const batch of adapter.snapshot(prefix, site.timezone, site.syncRevision, previous)) {
        await record();
        if ('start' in batch) {
          const dto = plainToInstance(SyncStartDto, batch.start);
          if ((await validate(dto)).length) throw new ConnectionFailure('站点业务数据格式不兼容，无法完成数据同步');
          runId = (await this.data.start(id, dto)).id;
          if (batch.manifest) publication = {
            manifest: batch.manifest,
            ...(site.activeSyncId && batch.changedBuckets ? {
              delta: { baselineId: site.activeSyncId, buckets: batch.changedBuckets, orders: [] },
            } : {}),
          };
        } else {
          if (!runId) throw new ConnectionFailure('站点同步未正确开始，系统将自动重试');
          const dto = plainToInstance(SyncPageDto, { page: page++, orders: batch.orders });
          if ((await validate(dto)).length) throw new ConnectionFailure('站点订单数据格式不兼容，无法完成数据同步');
          if (publication?.delta) publication.delta.orders.push(...dto.orders);
          else await this.data.upload(id, runId, dto);
        }
      }
      await record();
      if (!runId) throw new ConnectionFailure('未获取到完整的站点数据，系统将自动重试');
      if (publication) await this.data.complete(id, runId, publication);
      else await this.data.complete(id, runId);
      published = true;
      await record({ connectionStatus: 'ONLINE', lastError: null });

      // 同一站点的策略写入沿用本轮直连和租约。
      const current = await this.prisma.epaySite.findUnique({ where: { id } });
      if (!current || current.automationPaused || current.structureStatus !== 'COMPATIBLE') return;
      const commands = await this.strategies.pendingCommands(id);
      for (const command of commands) {
        await record();
        const typed = command as unknown as SiteControlCommand;
        // 列表取出后仍可能暂停、恢复或修改配置。每条指令在交给源库前复核。
        const pending = await this.prisma.adjustmentRecord.findFirst({
          where: { id: typed.id, siteId: id, status: 'PENDING',
            site: { automationPaused: false, structureStatus: 'COMPATIBLE', tablePrefix: prefix,
              syncRevision: site.syncRevision, connectionLeaseOwner: owner, connectionLeaseUntil: { gt: new Date() } } },
          select: { id: true },
        });
        if (!pending) continue;
        if (Date.parse(typed.expiresAt) > Date.now() && typed.action === 'SET_CHANNEL_STATUS' &&
          typed.desiredState.status === 0 && typed.target.channelCode) {
          await this.prisma.restrictionChannelHold.updateMany({
            where: { channelId: `${id}:channel:${typed.target.channelCode}`, state: { in: ['CLOSED', 'CLOSING', 'RESTORING'] } },
            data: { state: 'BLOCKED' },
          });
        }
        const result = Date.parse(typed.expiresAt) <= Date.now()
          ? { status: 'EXPIRED' as const, failureReason: 'COMMAND_EXPIRED' }
          : await adapter.control(typed);
        await this.strategies.completeCommand(id, typed.id, result);
      }
    } catch (error) {
      if (runId && !published) await this.data.fail(id, runId, 'READ_FAILED').catch(() => {});
      if (published && !(error instanceof ConnectionSuperseded)) {
        // Control has its own command status; it must not invalidate published site data.
        this.logger.warn('站点自动调整任务未完成，将在下轮重试');
      } else if (!(error instanceof ConnectionSuperseded) && site) {
        await record({ connectionStatus: 'ERROR', lastError: connectionError(error, syncing) }).catch((recordError: unknown) => {
          this.logger.warn(`站点 ${id} 连接状态写入失败：${recordError instanceof Error ? recordError.name : '未知错误'}`);
        });
      }
    } finally {
      if (keepAlive) clearInterval(keepAlive);
      await adapter?.close().catch(() => {});
      if (site) {
        await this.prisma.epaySite.updateMany({
          where: { id, syncRevision: site.syncRevision, connectionLeaseOwner: owner },
          data: { nextConnectionAt: new Date(Date.now() + 30_000), connectionLeaseUntil: null, connectionLeaseOwner: null },
        });
      }
      // If settings changed during the task, keep the immediate retry scheduled by the edit.
      await this.prisma.epaySite.updateMany({
        where: { id, connectionLeaseOwner: owner },
        data: { connectionLeaseUntil: null, connectionLeaseOwner: null },
      });
    }
  }
}
