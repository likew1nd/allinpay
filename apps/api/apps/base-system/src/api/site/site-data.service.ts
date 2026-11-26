import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SiteChannelStatus, SiteOrderStatus } from '@prisma/client';
import { ulid } from 'ulid';

import { PrismaService } from '@lib/shared/prisma/prisma.service';

import { channelOrderMetrics, summarizeOrders } from './channel-order-metrics';
import {
  PageSiteDataDto,
  SyncPageDto,
  SyncStartDto,
} from './dto/site-data.dto';
import {
  mapOrderStatus,
  ORDER_MAPPING,
  summarizeOrderCounts,
} from './order-mapping';

@Injectable()
export class SiteDataService {
  constructor(private readonly prisma: PrismaService) {}

  private async lock(tx: Prisma.TransactionClient, siteId: string) {
    await tx.$queryRaw`SELECT id FROM epay_site WHERE id = ${siteId} FOR UPDATE`;
    const site = await tx.epaySite.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException('站点不存在');
    return site;
  }

  async start(siteId: string, dto: SyncStartDto) {
    const start = new Date(dto.windowStart),
      end = new Date(dto.windowEnd);
    if (
      !(start < end) ||
      end.getTime() > Date.now() + 60_000 ||
      end.getTime() < Date.now() - 15 * 60_000
    ) {
      throw new BadRequestException(
        '同步开始时间必须早于结束时间，结束时间必须接近当前时间',
      );
    }
    const unique = (values: string[]) => new Set(values).size === values.length;
    if (
      !unique(dto.channels.map((row) => row.code)) ||
      !unique(dto.pollingGroups.map((row) => row.code)) ||
      dto.pollingGroups.some(
        (row) => !unique(row.members.map((member) => member.channelCode)),
      )
    ) {
      throw new BadRequestException('通道、轮询组及成员编号不可重复');
    }
    // 全量快照以公元 1000 年标记起点；写入 TIMESTAMP 时避开纪元边界。
    const windowStart =
      start.getTime() === Date.parse('1000-01-01T00:00:00.000Z')
        ? new Date('1970-01-02T00:00:00.000Z')
        : start;
    return this.prisma.$transaction(async (tx) => {
      const site = await this.lock(tx, siteId);
      if (site.syncRevision !== dto.revision)
        throw new ConflictException('连接配置已变化，请重新获取配置');
      await tx.epaySyncRun.updateMany({
        where: {
          siteId,
          status: 'RUNNING',
          OR: [
            { createdAt: { lt: new Date(Date.now() - 15 * 60_000) } },
            { revision: { not: site.syncRevision } },
          ],
        },
        data: {
          status: 'FAILED',
          error: '同步超时或连接配置已变化',
          completedAt: new Date(),
        },
      });
      const running = await tx.epaySyncRun.findFirst({
        where: { siteId, status: 'RUNNING' },
      });
      if (running) throw new ConflictException('该站点已有同步正在进行');
      await this.cleanup(tx, siteId, site.activeSyncId);
      const run = await tx.epaySyncRun.create({
        data: {
          id: ulid(),
          siteId,
          revision: dto.revision,
          windowStart,
          windowEnd: end,
          mappingVersion: ORDER_MAPPING,
          expectedCount: dto.expectedCount,
          metadata: JSON.parse(
            JSON.stringify({
              channels: dto.channels,
              pollingGroups: dto.pollingGroups,
            }),
          ),
        },
      });
      return { id: run.id };
    });
  }

  async upload(siteId: string, runId: string, dto: SyncPageDto) {
    return this.prisma.$transaction(async (tx) => {
      const site = await this.lock(tx, siteId);
      const run = await tx.epaySyncRun.findFirst({
        where: { id: runId, siteId },
      });
      if (
        !run ||
        run.status !== 'RUNNING' ||
        run.revision !== site.syncRevision
      ) {
        throw new ConflictException('同步已失效，请重新开始');
      }
      const pages = run.pages as { page: number; digest: string }[];
      const digest = createHash('sha256')
        .update(JSON.stringify(dto.orders))
        .digest('hex');
      const previous = pages.find((row) => row.page === dto.page);
      if (previous) {
        if (previous.digest !== digest)
          throw new ConflictException('重复批次内容不一致');
        return { accepted: true };
      }
      if (
        dto.page !== pages.length ||
        run.orderCount + dto.orders.length > run.expectedCount
      ) {
        throw new BadRequestException('同步批次不连续或订单数量超出声明范围');
      }
      if (
        dto.orders.some(
          (row) =>
            new Date(row.occurredAt) < run.windowStart ||
            new Date(row.occurredAt) >= run.windowEnd,
        )
      ) {
        throw new BadRequestException('订单时间超出本次同步窗口');
      }
      try {
        await tx.epayOrder.createMany({
          data: dto.orders.map((row) => ({
            ...row,
            id: ulid(),
            siteId,
            syncRunId: runId,
            occurredAt: new Date(row.occurredAt),
            paidAt: row.paidAt ? new Date(row.paidAt) : null,
            status: mapOrderStatus(row.sourceStatus),
            sourceVersion: ORDER_MAPPING,
          })),
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('订单编号重复');
        }
        throw error;
      }
      await tx.epaySyncRun.update({
        where: { id: runId },
        data: {
          orderCount: { increment: dto.orders.length },
          pages: [...pages, { page: dto.page, digest }],
        },
      });
      return { accepted: true };
    });
  }

  async complete(siteId: string, runId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const site = await this.lock(tx, siteId);
        const run = await tx.epaySyncRun.findFirst({
          where: { id: runId, siteId },
        });
        if (run?.status === 'SUCCESS' && site.activeSyncId === runId)
          return { accepted: true };
        if (
          !run ||
          run.status !== 'RUNNING' ||
          run.revision !== site.syncRevision
        ) {
          throw new ConflictException('同步已失效，请重新开始');
        }
        if (run.orderCount !== run.expectedCount)
          throw new BadRequestException('订单尚未全部上传');
        const metadata = run.metadata as unknown as Pick<
          SyncStartDto,
          'channels' | 'pollingGroups'
        >;
        await tx.epayPollingGroup.deleteMany({ where: { siteId } });
        await tx.epayChannel.deleteMany({ where: { siteId } });
        const channelId = (code: string) => `${siteId}:channel:${code}`;
        const channels: Prisma.EpayChannelCreateManyInput[] =
          metadata.channels.map((row) => ({
            id: channelId(row.code),
            siteId,
            code: row.code,
            name: row.name,
            paymentTypeId: row.paymentTypeId,
            channelType: row.paymentTypeName,
            plugin: row.plugin,
            ...(row.details
              ? { details: row.details as Prisma.InputJsonValue }
              : {}),
            sourceStatus: row.sourceStatus,
            dayStatus: row.dayStatus,
            status:
              ![0, 1].includes(row.sourceStatus) ||
              ![0, 1].includes(row.dayStatus)
                ? SiteChannelStatus.UNKNOWN
                : row.sourceStatus === 1 && row.dayStatus === 0
                  ? SiteChannelStatus.ENABLED
                  : SiteChannelStatus.DISABLED,
            sourceVersion: run.mappingVersion,
            updatedAt: run.windowEnd,
          }));
        const codes = new Set(channels.map((row) => row.code));
        for (const group of metadata.pollingGroups)
          for (const member of group.members) {
            if (!codes.has(member.channelCode)) {
              codes.add(member.channelCode);
              channels.push({
                id: channelId(member.channelCode),
                siteId,
                code: member.channelCode,
                name: `#${member.channelCode}`,
                status: SiteChannelStatus.UNKNOWN,
                updatedAt: run.windowEnd,
              });
            }
          }
        await tx.epayChannel.createMany({ data: channels });
        for (const row of metadata.pollingGroups) {
          const id = `${siteId}:roll:${row.code}`;
          await tx.epayPollingGroup.create({
            data: {
              id,
              siteId,
              code: row.code,
              name: row.name,
              kind: row.kind,
              position: row.position,
              paymentTypeId: row.paymentTypeId,
              paymentTypeName: row.paymentTypeName,
              status:
                row.sourceStatus === 1
                  ? SiteChannelStatus.ENABLED
                  : row.sourceStatus === 0
                    ? SiteChannelStatus.DISABLED
                    : SiteChannelStatus.UNKNOWN,
              sourceVersion: run.mappingVersion,
              updatedAt: run.windowEnd,
              members: {
                create: row.members.map((member) => ({
                  channelId: channelId(member.channelCode),
                  weight: member.weight,
                  position: member.position,
                  enabled:
                    channels.find(
                      (channel) => channel.code === member.channelCode,
                    )?.status === SiteChannelStatus.ENABLED,
                })),
              },
            },
          });
        }
        const now = new Date();
        await tx.epaySyncRun.update({
          where: { id: runId },
          data: { status: 'SUCCESS', completedAt: now },
        });
        await tx.epaySite.update({
          where: { id: siteId },
          data: { activeSyncId: runId, lastSyncAt: now },
        });
        await this.cleanup(tx, siteId, runId);
        return { accepted: true };
      },
      { timeout: 30_000 },
    );
  }

  // 与发布共用站点行锁，重试旧批次不能清除新发布的数据。
  private async cleanup(
    tx: Prisma.TransactionClient,
    siteId: string,
    activeId: string | null,
  ) {
    await tx.epayOrder.deleteMany({
      where: {
        siteId,
        OR: [
          { syncRunId: null },
          {
            syncRunId: { not: activeId ?? '__none__' },
            syncRun: { status: { not: 'RUNNING' } },
          },
        ],
      },
    });
    const old = await tx.epaySyncRun.findMany({
      where: {
        siteId,
        status: { not: 'RUNNING' },
        id: { not: activeId ?? '__none__' },
      },
      orderBy: { createdAt: 'desc' },
      skip: activeId ? 19 : 20,
      select: { id: true },
    });
    await tx.epaySyncRun.deleteMany({
      where: { id: { in: old.map((row) => row.id) }, siteId },
    });
  }

  async fail(siteId: string, runId: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const site = await this.lock(tx, siteId);
      await tx.epaySyncRun.updateMany({
        where: { id: runId, siteId, status: 'RUNNING' },
        data: {
          status: 'FAILED',
          error:
            reason === 'READ_FAILED' ? '站点业务数据读取失败' : '同步上传失败',
          completedAt: new Date(),
        },
      });
      await this.cleanup(tx, siteId, site.activeSyncId);
    });
    return { accepted: true };
  }

  private async site(tx: Prisma.TransactionClient, id: string) {
    const site = await tx.epaySite.findUnique({ where: { id } });
    if (!site) throw new NotFoundException('站点不存在');
    return site;
  }

  async pageChannels(query: PageSiteDataDto, siteId?: string) {
    const { current, size, keyword, status } = query;
    if (status && !['ENABLED', 'DISABLED', 'UNKNOWN'].includes(status))
      throw new BadRequestException('通道状态无效');

    return this.prisma.$transaction(
      async (tx) => {
        if (siteId) await this.site(tx, siteId);
        const text = keyword ? { contains: keyword } : undefined;
        const where: Prisma.EpayChannelWhereInput = {
          ...(siteId ? { siteId } : {}),
          sourceVersion: { not: null },
          site: { activeSyncId: { not: null } },
          ...(status ? { status: status as SiteChannelStatus } : {}),
          ...(text ? { OR: [{ name: text }, { code: text }] } : {}),
        };
        const [channels, matched] = await Promise.all([
          tx.epayChannel.findMany({
            where,
            skip: (current - 1) * size,
            take: size,
            orderBy: [{ site: { name: 'asc' } }, { siteId: 'asc' }, { code: 'asc' }],
            include: {
              site: { select: { id: true, name: true, baseUrl: true, activeSyncId: true, timezone: true } },
              pollingMembers: {
                include: {
                  pollingGroup: { select: { code: true, name: true, kind: true } },
                },
              },
            },
          }),
          tx.epayChannel.findMany({
            where,
            select: { code: true, site: { select: { id: true, activeSyncId: true, timezone: true } } },
          }),
        ]);
        function groupBySite(rows: typeof matched) {
          const bySite = new Map<string, { site: (typeof matched)[number]['site']; codes: string[] }>();
          for (const { site, code } of rows) {
            const entry = bySite.get(site.id) ?? { site, codes: [] };
            entry.codes.push(code);
            bySite.set(site.id, entry);
          }
          return Array.from(bySite.values());
        }
        const total = matched.length;
        const now = new Date();
        const statistics = await summarizeOrders(tx, groupBySite(matched), now);
        if (!channels.length) return { current, size, total, statistics, records: [] };

        const scopes = groupBySite(channels);
        const targets: Prisma.StrategyTargetWhereInput = {
          OR: scopes.map(({ site, codes }) => ({ siteId: site.id, channelCode: { in: codes } })),
        };
        const [groups, siteMetrics] = await Promise.all([
          tx.strategyGroup.findMany({
            where: { targets: { some: targets } },
            orderBy: { name: 'asc' },
            select: {
              id: true,
              name: true,
              status: true,
              targets: { where: targets, select: { siteId: true, channelCode: true } },
            },
          }),
          Promise.all(scopes.map(async ({ site, codes }) => [
            site.id,
            await channelOrderMetrics(tx, site, codes, now),
          ] as const)),
        ]);
        const metrics = new Map(siteMetrics);
        const records = channels.map(({ site, ...channel }) => ({
          ...channel,
          siteName: site.name,
          siteBaseUrl: site.baseUrl,
          orderMetrics: metrics.get(site.id)?.get(channel.code) ?? null,
          strategyGroups: groups
            .filter((group) => group.targets.some((target) =>
              target.siteId === site.id && target.channelCode === channel.code,
            ))
            .map(({ id, name, status }) => ({ id, name, status })),
        }));
        return { current, size, total, statistics, records };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async pageOrders(query: PageSiteDataDto, siteId?: string) {
    const { current, size, keyword, status, sourceStatus, channelCode, start, end } = query;
    if (status && !Object.values(SiteOrderStatus).includes(status as SiteOrderStatus))
      throw new BadRequestException('订单状态无效');
    if (start && end && new Date(start) >= new Date(end))
      throw new BadRequestException('开始时间必须早于结束时间');

    // 分页和汇总共用筛选值，汇总作用于分页之前的完整结果集。
    const filters: [Prisma.EpayOrderWhereInput, Prisma.Sql][] = [];
    if (keyword) {
      const text = { contains: keyword };
      const pattern = `%${keyword}%`;
      filters.push([{ OR: [{ externalId: text }, { merchantId: text }] }, Prisma.sql`(external_id LIKE ${pattern} OR merchant_id LIKE ${pattern})`]);
    }
    if (status) filters.push([{ status: status as SiteOrderStatus }, Prisma.sql`status = ${status}`]);
    if (sourceStatus !== undefined) {
      const code = String(Number(sourceStatus));
      const codes = Array.from({ length: 4 - code.length }, (_, i) => code.padStart(code.length + i, '0'));
      filters.push([{ sourceStatus: { in: codes } }, Prisma.sql`source_status IN (${Prisma.join(codes)})`]);
    }
    if (channelCode) filters.push([{ channelCode }, Prisma.sql`channel_code = ${channelCode}`]);
    if (start || end) {
      const gte = start ? new Date(start) : undefined;
      const lt = end ? new Date(end) : undefined;
      filters.push([
        { occurredAt: { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } },
        Prisma.sql`(${gte ? Prisma.sql`occurred_at >= ${gte}` : Prisma.sql`TRUE`} AND ${lt ? Prisma.sql`occurred_at < ${lt}` : Prisma.sql`TRUE`})`,
      ]);
    }

    return this.prisma.$transaction(
      async (tx) => {
        const sites = siteId
          ? [await this.site(tx, siteId)]
          : await tx.epaySite.findMany({
              where: { activeSyncId: { not: null } },
              select: { id: true, activeSyncId: true, timezone: true },
            });
        const activeSites = sites.filter((site) => site.activeSyncId !== null);
        const syncRunIds = activeSites.map((site) => site.activeSyncId!);
        const statistics = { total: 0, unpaid: 0, paid: 0, refunded: 0, frozen: 0, preauthorized: 0, unknown: 0 };
        const collections = summarizeOrders(tx, activeSites.map((site) => ({ site })), new Date(),
          filters.length ? Prisma.join(filters.map(([, sql]) => sql), ' AND ') : undefined);
        if (!syncRunIds.length) return { current, size, records: [], total: 0, statistics: { ...statistics, collections: await collections } };

        const where: Prisma.EpayOrderWhereInput = {
          ...(siteId ? { siteId } : {}),
          syncRunId: { in: syncRunIds },
          ...Object.assign({}, ...filters.map(([where]) => where)),
        };
        const [orders, statuses, collectionStats] = await Promise.all([
          tx.epayOrder.findMany({
            where,
            skip: (current - 1) * size,
            take: size,
            orderBy: [{ occurredAt: 'desc' }, { externalId: 'desc' }, { id: 'desc' }],
            include: { site: { select: { name: true, baseUrl: true } } },
          }),
          tx.epayOrder.groupBy({ by: ['sourceStatus'], where, _count: { _all: true } }),
          collections,
        ]);
        const statusKeys = ['unpaid', 'paid', 'refunded', 'frozen', 'preauthorized'] as const;
        for (const { sourceStatus, _count } of statuses) {
          const key = /^\d+$/.test(sourceStatus) ? statusKeys[Number(sourceStatus)] : undefined;
          statistics[key ?? 'unknown'] += _count._all;
          statistics.total += _count._all;
        }
        const records = orders.map(({ site, ...order }) => ({
          ...order,
          siteName: site.name,
          siteBaseUrl: site.baseUrl,
        }));
        return { current, size, records, total: statistics.total, statistics: { ...statistics, collections: collectionStats } };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async page(
    siteId: string,
    kind: 'polling-groups' | 'sync-history',
    query: PageSiteDataDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const site = await this.site(tx, siteId);
        const paging = {
          skip: (query.current - 1) * query.size,
          take: query.size,
        };
        const text = query.keyword ? { contains: query.keyword } : undefined;
        let records: unknown[], total: number;
        if (kind === 'polling-groups') {
          if (
            query.status &&
            !['ENABLED', 'DISABLED', 'UNKNOWN'].includes(query.status)
          )
            throw new BadRequestException('通道状态无效');
          const where = {
            siteId,
            ...(!site.activeSyncId ? { id: '__no_active_data__' } : {}),
            ...(text ? { OR: [{ name: text }, { code: text }] } : {}),
            ...(query.status
              ? { status: query.status as SiteChannelStatus }
              : {}),
          };
          const [records, total, channels] = await Promise.all([
            tx.epayPollingGroup.findMany({
              where,
              ...paging,
              orderBy: { code: 'asc' },
              include: {
                members: {
                  orderBy: { position: 'asc' },
                  include: { channel: true },
                },
              },
            }),
            tx.epayPollingGroup.count({ where }),
            site.activeSyncId ? tx.epayChannel.findMany({
              where: { siteId, pollingMembers: { some: { pollingGroup: where } } },
              select: { code: true },
            }) : [],
          ]);
          // 订单没有轮询组编号，按当前成员通道汇总；共享通道只选一次。
          const scopes = channels.length ? [{ site, codes: channels.map(({ code }) => code) }] : [];
          const statistics = await summarizeOrders(tx, scopes, new Date());
          return { current: query.current, size: query.size, records, total, statistics };
        } else {
          [records, total] = await Promise.all([
            tx.epaySyncRun.findMany({
              where: { siteId },
              ...paging,
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                status: true,
                windowStart: true,
                windowEnd: true,
                orderCount: true,
                expectedCount: true,
                mappingVersion: true,
                error: true,
                createdAt: true,
                completedAt: true,
              },
            }),
            tx.epaySyncRun.count({ where: { siteId } }),
          ]);
        }
        return { current: query.current, size: query.size, records, total };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  // 一页站点共用一次批量聚合，避免每行单独请求统计或读到尚未发布的订单。
  async overviews(siteIds: string[]) {
    if (!siteIds.length) return [];
    return this.prisma.$transaction(
      async (tx) => {
        const sites = await tx.epaySite.findMany({
          where: { id: { in: siteIds } },
          select: {
            id: true,
            activeSyncId: true,
            lastSyncAt: true,
            syncRuns: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { status: true, error: true },
            },
          },
        });
        const activeIds = sites.flatMap((site) =>
          site.activeSyncId ? [site.activeSyncId] : [],
        );
        const [orders, channels, pollingGroups] = await Promise.all([
          tx.epayOrder.groupBy({
            by: ['siteId', 'sourceStatus'],
            where: { syncRunId: { in: activeIds } },
            _count: { _all: true },
            _sum: { amount: true },
          }),
          tx.epayChannel.groupBy({
            by: ['siteId'],
            where: { siteId: { in: siteIds }, sourceVersion: { not: null } },
            _count: { _all: true },
          }),
          tx.epayPollingGroup.groupBy({
            by: ['siteId'],
            where: { siteId: { in: siteIds } },
            _count: { _all: true },
          }),
        ]);
        return sites.map((site) => {
          const groups = orders.filter((row) => row.siteId === site.id);
          const metrics = summarizeOrderCounts(groups);
          const successAmount = groups.reduce(
            (total, row) =>
              mapOrderStatus(row.sourceStatus) === SiteOrderStatus.SUCCESS
                ? total.plus(row._sum.amount ?? 0)
                : total,
            new Prisma.Decimal(0),
          );
          return {
            siteId: site.id,
            channelCount: site.activeSyncId
              ? (channels.find((row) => row.siteId === site.id)?._count._all ??
                0)
              : 0,
            pollingGroupCount: site.activeSyncId
              ? (pollingGroups.find((row) => row.siteId === site.id)?._count
                  ._all ?? 0)
              : 0,
            orderCount: metrics.orderCount,
            successRate: metrics.successRate,
            successAmount: successAmount.toFixed(2),
            lastSyncAt: site.lastSyncAt,
            stale:
              !site.lastSyncAt ||
              Date.now() - site.lastSyncAt.getTime() > 90_000,
            latest: site.syncRuns[0] ?? null,
          };
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async summary(siteId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const site = await this.site(tx, siteId);
        const active = site.activeSyncId
          ? await tx.epaySyncRun.findUnique({
              where: { id: site.activeSyncId },
            })
          : null;
        const latest = await tx.epaySyncRun.findFirst({
          where: { siteId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            error: true,
            createdAt: true,
            completedAt: true,
          },
        });
        const groups = await tx.epayOrder.groupBy({
          by: ['sourceStatus'],
          orderBy: { sourceStatus: 'asc' },
          where: { siteId, syncRunId: site.activeSyncId ?? '__none__' },
          _count: { _all: true },
          _sum: { amount: true },
        });
        const [channelCount, pollingGroupCount] = await Promise.all([
          tx.epayChannel.count({
            where: { siteId, sourceVersion: { not: null } },
          }),
          tx.epayPollingGroup.count({ where: { siteId } }),
        ]);
        const metrics = summarizeOrderCounts(groups);
        const successAmount = groups.reduce(
          (total, row) =>
            mapOrderStatus(row.sourceStatus) === SiteOrderStatus.SUCCESS
              ? total.plus(row._sum.amount ?? 0)
              : total,
          new Prisma.Decimal(0),
        );
        return {
          channelCount: active ? channelCount : 0,
          pollingGroupCount: active ? pollingGroupCount : 0,
          ...metrics,
          successAmount: successAmount.toFixed(2),
          windowStart: active?.windowStart ?? null,
          windowEnd: active?.windowEnd ?? null,
          mappingVersion: active?.mappingVersion ?? ORDER_MAPPING,
          lastSyncAt: site.lastSyncAt,
          stale:
            !site.lastSyncAt || Date.now() - site.lastSyncAt.getTime() > 90_000,
          latest,
          timezone: site.timezone,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
