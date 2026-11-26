import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SiteConnectionStatus,
  SiteStructureStatus,
} from '@prisma/client';
import { ulid } from 'ulid';

import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { Password } from '../../lib/bounded-contexts/iam/authentication/domain/password.value-object';

import { CreateSiteDto } from './dto/create-site.dto';
import { PageSitesDto } from './dto/page-sites.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { encryptSiteSecret } from './site-credentials';
import { finishPendingAdjustments } from '../strategy/adjustment-audit';

@Injectable()
export class SiteService {
  constructor(private readonly prisma: PrismaService) {}

  // 中心直连任务定期续约；超过 90 秒没有检测记录时显示离线。
  private readonly heartbeatTimeoutMs = 90_000;

  async page(query: PageSitesDto, includeStatistics = false) {
    const cutoff = new Date(Date.now() - this.heartbeatTimeoutMs);
    const stale = {
      OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: cutoff } }],
    };
    const connectionWhere = (status?: SiteConnectionStatus): Prisma.EpaySiteWhereInput =>
      status === SiteConnectionStatus.OFFLINE
        ? {
            AND: [
              { connectionStatus: { not: SiteConnectionStatus.PENDING } },
              stale,
            ],
          }
        : status === SiteConnectionStatus.ONLINE || status === SiteConnectionStatus.ERROR
          ? { connectionStatus: status, lastHeartbeatAt: { gte: cutoff } }
          : status
            ? { connectionStatus: status }
            : {};
    const where: Prisma.EpaySiteWhereInput = {
      ...connectionWhere(query.status),
      ...(query.keyword
        ? {
            OR: [
              { id: { contains: query.keyword } },
              { name: { contains: query.keyword } },
              { baseUrl: { contains: query.keyword } },
            ],
          }
        : {}),
    };
    const recordsQuery = this.prisma.epaySite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.current - 1) * query.size,
      take: query.size,
      select: this.publicSelect,
    });
    const totalQuery = this.prisma.epaySite.count({ where });
    const countStatus = (status: SiteConnectionStatus) =>
      this.prisma.epaySite.count({ where: { AND: [where, connectionWhere(status)] } });
    const statisticsQueries: Prisma.PrismaPromise<number>[] = includeStatistics
      ? [countStatus('ONLINE'), countStatus('PENDING'), countStatus('ERROR')]
      : [];
    const [items, total, online, pending, error] = await this.prisma.$transaction([
      recordsQuery,
      totalQuery,
      ...statisticsQueries,
    ]);
    return {
      current: query.current,
      size: query.size,
      total,
      ...(online != null && pending != null && error != null
        ? { statistics: { total, online, offline: total - online - pending - error, pending, error } }
        : {}),
      records: items.map((site) => this.withConnectionStatus(site, cutoff)),
    };
  }

  async findOne(id: string) {
    const site = await this.prisma.epaySite.findUnique({
      where: { id },
      select: this.publicSelect,
    });
    if (!site) throw new NotFoundException('站点不存在');
    return this.withConnectionStatus(site);
  }

  async create(dto: CreateSiteDto, createdBy: string) {
    const id =
      new URL(dto.baseUrl).hostname === 'cs.cqgslxs.com'
        ? 'epay-test-cqgslxs'
        : `site-${ulid().toLowerCase()}`;
    try {
      const site = await this.prisma.epaySite.create({
        data: {
          id,
          name: dto.name,
          baseUrl: dto.baseUrl,
          tablePrefix: dto.tablePrefix,
          timezone: dto.timezone ?? 'Asia/Shanghai',
          dbHost: dto.dbHost,
          dbPort: dto.dbPort ?? 3306,
          dbName: dto.dbName,
          dbUser: dto.dbUser,
          // 旧库的 credential_ref 为必填列；直连凭据只使用下方密文。
          credentialRef: '',
          dbPasswordEncrypted: encryptSiteSecret(id, 'db-password', dto.dbPassword),
          createdBy,
        },
        select: this.publicSelect,
      });
      return this.withConnectionStatus(site);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('该测试站点已登记，请编辑现有站点');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateSiteDto, updatedBy: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM epay_site WHERE id = ${id} FOR UPDATE`;
      const lease = await tx.epaySite.findUnique({
        where: { id },
        select: { connectionLeaseOwner: true, connectionLeaseUntil: true },
      });
      if (
        lease?.connectionLeaseOwner?.startsWith('channel:') &&
        lease.connectionLeaseUntil &&
        lease.connectionLeaseUntil > new Date()
      ) {
        throw new ConflictException('通道操作正在进行，请稍后编辑站点');
      }
      const current = await tx.epaySite.findUnique({
        where: { id },
        select: this.publicSelect,
      });
      if (!current) throw new NotFoundException('站点不存在');
      const { dbPassword, ...fields } = dto;
      const connectionChanged =
        dbPassword !== undefined ||
        (
          [
            'baseUrl',
            'dbHost',
            'dbPort',
            'dbName',
            'dbUser',
            'tablePrefix',
            'timezone',
          ] as const
        ).some((key) => dto[key] !== undefined && dto[key] !== current[key]);
      const site = await tx.epaySite.update({
        where: { id },
        data: {
          ...fields,
          ...(dbPassword !== undefined
            ? {
                dbPasswordEncrypted: encryptSiteSecret(
                  id,
                  'db-password',
                  dbPassword,
                ),
              }
            : {}),
          updatedBy,
          ...(connectionChanged
            ? {
                connectionStatus: SiteConnectionStatus.PENDING,
                nextConnectionAt: new Date(),
                structureStatus: SiteStructureStatus.UNKNOWN,
                structureReport: Prisma.DbNull,
                lastHeartbeatAt: null,
                lastSyncAt: null,
                activeSyncId: null,
                syncRevision: { increment: 1 },
                lastError: null,
                adapterVersion: null,
              }
            : {}),
        },
        select: this.publicSelect,
      });
      const visibleFields = [
        'name',
        'baseUrl',
        'tablePrefix',
        'timezone',
      ] as const;
      const changes: { field: string; before: unknown; after: unknown }[] =
        visibleFields.flatMap((field) =>
          dto[field] !== undefined && dto[field] !== current[field]
            ? [{ field, before: current[field], after: site[field] }]
            : [],
        );
      const privateConnectionChanged =
        dbPassword !== undefined ||
        (
          ['dbHost', 'dbPort', 'dbName', 'dbUser'] as const
        ).some(
          (field) => dto[field] !== undefined && dto[field] !== current[field],
        );
      if (privateConnectionChanged)
        changes.push({
          field: 'connectionSettings',
          before: '已隐藏',
          after: '已更新（具体值未记录）',
        });
      return {
        ...this.withConnectionStatus(site),
        audit: {
          siteId: id,
          siteName: site.name,
          objectName: site.name,
          changes,
        },
      };
    });
  }

  async setAutomationPaused(id: string, paused: boolean) {
    const site = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM epay_site WHERE id = ${id} FOR UPDATE`;
      const current = await tx.epaySite.findUnique({
        where: { id },
        select: this.publicSelect,
      });
      if (!current) throw new NotFoundException('站点不存在');
      const updated = await tx.epaySite.update({
        where: { id },
        data: { automationPaused: paused },
        select: this.publicSelect,
      });
      if (paused) {
        await finishPendingAdjustments(tx, this.prisma.applicationAdjustmentAudit, {
          where: { siteId: id, status: 'PENDING' },
          data: { status: 'SKIPPED', failureReason: '站点已暂停自动调整，取消待执行指令', completedAt: new Date() },
        });
      }
      return {
        ...updated,
        audit: {
          siteId: id,
          siteName: updated.name,
          objectName: updated.name,
          changes:
            current.automationPaused === paused
              ? []
              : [
                  {
                    field: 'automationPaused',
                    before: current.automationPaused,
                    after: updated.automationPaused,
                  },
                ],
        },
      };
    });
    return this.withConnectionStatus(site);
  }

  async remove(
    id: string,
    password: string,
    actor?: { uid: string; domain: string },
  ) {
    await this.verifyCurrentPassword(password, actor);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM epay_site WHERE id = ${id} FOR UPDATE`;
      const site = await tx.epaySite.findUnique({
        where: { id },
        select: { name: true, connectionLeaseUntil: true },
      });
      if (!site) throw new NotFoundException('站点不存在');
      if (site.connectionLeaseUntil && site.connectionLeaseUntil > new Date()) {
        throw new ConflictException(
          '站点正在同步或执行自动调整，请等待当前任务结束后再删除',
        );
      }
      await tx.epaySite.delete({ where: { id } });
      return {
        id,
        audit: {
          siteId: id,
          siteName: site.name,
          objectName: site.name,
          changes: [{ field: 'site', before: site.name, after: '已删除' }],
        },
      };
    });
  }

  async verifyCurrentPassword(
    password: string,
    actor?: { uid: string; domain: string },
  ) {
    if (!actor?.uid || !actor.domain)
      throw new ForbiddenException('请使用当前登录账号验证');
    const user = await this.prisma.sysUser.findUnique({
      where: { id: actor.uid },
      select: { password: true, status: true, domain: true },
    });
    if (!user || user.status !== 'ENABLED' || user.domain !== actor.domain) {
      throw new ForbiddenException('当前登录账号不可用');
    }
    if (!(await Password.fromHashed(user.password).compare(password))) {
      throw new BadRequestException('当前登录密码错误');
    }
  }

  async retryConnection(id: string) {
    await this.findOne(id);
    const now = new Date();
    await this.prisma.epaySite.updateMany({
      where: {
        id,
        OR: [
          { connectionLeaseUntil: null },
          { connectionLeaseUntil: { lt: now } },
        ],
      },
      data: {
        connectionStatus: SiteConnectionStatus.PENDING,
        structureStatus: SiteStructureStatus.UNKNOWN,
        lastError: null,
        lastHeartbeatAt: now,
        nextConnectionAt: now,
      },
    });
    return this.findOne(id);
  }

  private withConnectionStatus<
    T extends {
      connectionStatus: SiteConnectionStatus;
      lastHeartbeatAt: Date | null;
      dbPasswordEncrypted?: string | null;
    },
  >(site: T, cutoff = new Date(Date.now() - this.heartbeatTimeoutMs)) {
    const { dbPasswordEncrypted, ...fields } = site;
    const result = { ...fields, hasDbPassword: Boolean(dbPasswordEncrypted) };
    if (
      site.connectionStatus !== SiteConnectionStatus.PENDING &&
      (!site.lastHeartbeatAt || site.lastHeartbeatAt < cutoff)
    ) {
      return { ...result, connectionStatus: SiteConnectionStatus.OFFLINE };
    }
    return result;
  }

  private readonly publicSelect = {
    id: true,
    name: true,
    baseUrl: true,
    tablePrefix: true,
    timezone: true,
    dbHost: true,
    dbPort: true,
    dbName: true,
    dbUser: true,
    dbPasswordEncrypted: true,
    connectionStatus: true,
    structureStatus: true,
    structureReport: true,
    adapterVersion: true,
    lastHeartbeatAt: true,
    lastSyncAt: true,
    automationPaused: true,
    lastError: true,
    createdAt: true,
    updatedAt: true,
  } satisfies Prisma.EpaySiteSelect;
}
