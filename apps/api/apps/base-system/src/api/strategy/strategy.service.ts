import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AccountStatus,
  Prisma,
  SiteChannelStatus,
  SiteConnectionStatus,
  SiteStructureStatus,
  StrategyStatus,
} from '@prisma/client';
import { ulid } from 'ulid';

import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { EVENT_OPERATION_LOG_CREATED } from '@lib/constants/event-emitter-token.constant';
import { OperationLogProperties } from '@app/base-system/lib/bounded-contexts/log-audit/operation-log/domain/operation-log.read.model';

import { SiteDataService } from '../site/site-data.service';
import { AccountService } from '../account/account.service';
import { finishPendingAdjustments, updateAdjustment } from './adjustment-audit';

import {
  CreateStrategyGroupDto,
  CreateStrategyGroupBindingDto,
  PageStrategyDto,
  UpdateStrategyGroupDto,
} from './dto/strategy.dto';

type SimpleCondition = {
  metric:
    | 'SUCCESS_RATE'
    | 'FAILURE_RATE'
    | 'ORDER_COUNT'
    | 'STALE'
    | 'ACCOUNT_STATUS';
  operator: 'LT' | 'LTE' | 'GT' | 'GTE' | 'EQ';
  value: number | AccountStatus;
  minSamples?: number;
};
type Condition =
  | SimpleCondition
  | { logic: 'AND' | 'OR'; conditions: Condition[] };
type Scope = {
  type: 'SITE' | 'CHANNEL' | 'POLLING_GROUP' | 'ACCOUNT';
  channelCode?: string;
  groupCode?: string;
  accountId?: string;
};
type Action =
  | { type: 'SET_MEMBER_WEIGHT'; channelCode: string; weight: number }
  | { type: 'ADJUST_MEMBER_WEIGHT'; channelCode: string; delta: number }
  | { type: 'SET_CHANNEL_STATUS'; status: 0 | 1 }
  | { type: 'SET_POLLING_GROUP_STATUS'; status: 0 | 1 };

@Injectable()
export class StrategyService {
  private readonly logger = new Logger(StrategyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly siteData: SiteDataService,
    private readonly accounts: AccountService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async pageGroups(query: PageStrategyDto) {
    const where: Prisma.StrategyGroupWhereInput = {
      ...(query.siteId ? { siteId: query.siteId } : {}),
      ...(query.keyword ? { name: { contains: query.keyword } } : {}),
    };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.strategyGroup.findMany({
        where,
        orderBy: [{ executionOrder: 'asc' }, { id: 'asc' }],
        skip: (query.current - 1) * query.size,
        take: query.size,
        include: {
          _count: { select: { strategies: true, bindings: true } },
          site: { select: { id: true, name: true } },
        },
      }),
      this.prisma.strategyGroup.count({ where }),
    ]);
    return { current: query.current, size: query.size, total, records };
  }

  async createGroup(dto: CreateStrategyGroupDto) {
    if (dto.siteId) await this.requireSite(dto.siteId);
    return this.prisma.strategyGroup.create({
      data: {
        id: `strategy-group-${ulid().toLowerCase()}`,
        siteId: dto.siteId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        executionOrder: dto.executionOrder ?? 0,
      },
    });
  }

  async updateGroup(id: string, dto: UpdateStrategyGroupDto) {
    const group = await this.prisma.strategyGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('策略组不存在');
    return this.prisma.strategyGroup.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() }
          : {}),
        ...(dto.executionOrder !== undefined
          ? { executionOrder: dto.executionOrder }
          : {}),
        ...(dto.status ? { status: dto.status as StrategyStatus } : {}),
        currentVersion:
          dto.status && dto.status !== group.status
            ? { increment: 1 }
            : undefined,
      },
    });
  }

  async pageGroupBindings(groupId: string) {
    const group = await this.prisma.strategyGroup.findUnique({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('策略组不存在');
    return this.prisma.strategyGroupBinding.findMany({
      where: { groupId },
      include: { site: { select: { id: true, name: true } } },
      orderBy: [{ siteId: 'asc' }, { pollingGroupCode: 'asc' }],
    });
  }

  async addGroupBinding(groupId: string, dto: CreateStrategyGroupBindingDto) {
    const group = await this.prisma.strategyGroup.findUnique({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('策略组不存在');
    const pollingGroup = await this.prisma.epayPollingGroup.findFirst({
      where: { siteId: dto.siteId, code: dto.pollingGroupCode },
    });
    if (!pollingGroup) throw new BadRequestException('目标站点轮询组不存在');
    return this.prisma.strategyGroupBinding.create({
      data: {
        id: `strategy-binding-${ulid().toLowerCase()}`,
        groupId,
        siteId: dto.siteId,
        pollingGroupCode: dto.pollingGroupCode,
      },
      include: { site: { select: { id: true, name: true } } },
    });
  }

  async removeGroupBinding(groupId: string, bindingId: string) {
    const binding = await this.prisma.strategyGroupBinding.findFirst({
      where: { id: bindingId, groupId },
    });
    if (!binding) throw new NotFoundException('策略组绑定不存在');
    await this.prisma.strategyGroupBinding.delete({ where: { id: bindingId } });
    return { id: bindingId };
  }

  async pageStrategies(query: PageStrategyDto) {
    const where: Prisma.StrategyWhereInput = {
      ...(query.groupId ? { groupId: query.groupId } : {}),
      ...(query.siteId ? { group: { siteId: query.siteId } } : {}),
      ...(query.keyword ? { name: { contains: query.keyword } } : {}),
    };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.strategy.findMany({
        where,
        orderBy: [{ priority: 'asc' }, { id: 'asc' }],
        skip: (query.current - 1) * query.size,
        take: query.size,
        include: {
          group: {
            select: { id: true, name: true, siteId: true, status: true },
          },
        },
      }),
      this.prisma.strategy.count({ where }),
    ]);
    return { current: query.current, size: query.size, total, records };
  }

  async pageVersions(strategyId: string) {
    const strategy = await this.prisma.strategy.findUnique({
      where: { id: strategyId },
      select: { id: true },
    });
    if (!strategy) throw new NotFoundException('策略不存在');
    return this.prisma.strategyVersion.findMany({
      where: { strategyId },
      orderBy: { version: 'desc' },
    });
  }

  async simulate(id: string) {
    const strategy = await this.prisma.strategy.findUnique({
      where: { id },
      include: { group: { include: { site: true } } },
    });
    if (!strategy) throw new NotFoundException('策略不存在');
    const site = strategy.group.site;
    if (!site) throw new ConflictException('策略组未绑定站点，暂时无法模拟');
    const summary = await this.siteData.summary(site.id);
    const condition = this.parseCondition(strategy.condition);
    const scope = this.parseScope(strategy.scope);
    const account =
      scope.type === 'ACCOUNT'
        ? await this.accounts.findEnabledBinding(site.id, scope.accountId)
        : null;
    const blockers: string[] = [];
    const now = Date.now();
    if (
      (strategy.effectiveFrom && now < strategy.effectiveFrom.getTime()) ||
      (strategy.effectiveTo && now >= strategy.effectiveTo.getTime())
    )
      blockers.push('OUTSIDE_EFFECTIVE_WINDOW');
    if (site.connectionStatus !== SiteConnectionStatus.ONLINE)
      blockers.push('SITE_OFFLINE');
    if (site.structureStatus !== SiteStructureStatus.COMPATIBLE)
      blockers.push('STRUCTURE_INCOMPATIBLE');
    if (site.automationPaused) blockers.push('AUTOMATION_PAUSED');
    if (this.needsAccountStatus(condition) && !account)
      blockers.push('ACCOUNT_BINDING_MISSING');
    const matched =
      blockers.length === 0 &&
      this.matches(condition, summary, account?.account.status);
    if (!matched) {
      return {
        simulation: true,
        strategyId: strategy.id,
        siteId: site.id,
        matched: false,
        executable: blockers.length === 0,
        blockers,
        summary,
      };
    }
    const action = this.parseAction(strategy.action);
    const preview = await this.buildCommand(strategy, scope, action);
    return {
      simulation: true,
      strategyId: strategy.id,
      siteId: site.id,
      matched: true,
      executable: true,
      blockers: [],
      summary,
      preview,
    };
  }

  async replayVersion(id: string, version: number) {
    const strategy = await this.prisma.strategy.findUnique({
      where: { id },
      include: { group: { include: { site: true } } },
    });
    const snapshot = await this.prisma.strategyVersion.findUnique({
      where: { strategyId_version: { strategyId: id, version } },
    });
    if (!strategy || !snapshot) throw new NotFoundException('策略版本不存在');
    const site = strategy.group.site;
    if (!site) throw new ConflictException('策略组未绑定站点，暂时无法回放');
    const summary = await this.siteData.summary(site.id);
    const condition = this.parseCondition(snapshot.condition);
    const scope = this.parseScope(snapshot.scope);
    const account =
      scope.type === 'ACCOUNT'
        ? await this.accounts.findEnabledBinding(site.id, scope.accountId)
        : null;
    const blockers: string[] = [];
    if (site.connectionStatus !== SiteConnectionStatus.ONLINE)
      blockers.push('SITE_OFFLINE');
    if (site.structureStatus !== SiteStructureStatus.COMPATIBLE)
      blockers.push('STRUCTURE_INCOMPATIBLE');
    if (this.needsAccountStatus(condition) && !account)
      blockers.push('ACCOUNT_BINDING_MISSING');
    const matched =
      blockers.length === 0 &&
      this.matches(condition, summary, account?.account.status);
    if (!matched)
      return {
        simulation: true,
        replay: true,
        version,
        strategyId: id,
        siteId: site.id,
        matched: false,
        executable: false,
        blockers,
        summary,
      };
    const preview = await this.buildCommand(
      { ...strategy, group: strategy.group },
      scope,
      this.parseAction(snapshot.action),
    );
    return {
      simulation: true,
      replay: true,
      version,
      strategyId: id,
      siteId: site.id,
      matched: true,
      executable: true,
      blockers: [],
      summary,
      preview,
    };
  }

  async pageAdjustments(query: PageStrategyDto) {
    const where: Prisma.AdjustmentRecordWhereInput = {
      ...(query.siteId ? { siteId: query.siteId } : {}),
      ...(query.keyword ? { action: { contains: query.keyword } } : {}),
    };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.adjustmentRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.current - 1) * query.size,
        take: query.size,
      }),
      this.prisma.adjustmentRecord.count({ where }),
    ]);
    return { current: query.current, size: query.size, total, records };
  }

  async pendingCommands(siteId: string) {
    const now = new Date();
    const queued = await this.prisma.adjustmentRecord.findMany({
      where: { siteId, status: 'PENDING' },
      select: {
        id: true,
        strategyGroupId: true,
        bindingId: true,
        groupVersion: true,
        strategyVersion: true,
      },
    });
    for (const record of queued) {
      const binding = record.bindingId
        ? await this.prisma.strategyTarget.findUnique({
            where: { id: record.bindingId },
            include: { group: { include: { template: true } } },
          })
        : null;
      if (
        !binding ||
        binding.siteId !== siteId ||
        binding.groupId !== record.strategyGroupId ||
        binding.group.status !== 'RUNNING' ||
        binding.group.currentVersion !== record.groupVersion ||
        !binding.group.configuration
      ) {
        await finishPendingAdjustments(this.prisma, this.prisma.applicationAdjustmentAudit, {
          where: { id: record.id, status: 'PENDING' },
          data: {
            status: 'SKIPPED',
            failureReason: '策略或绑定已变更，取消旧指令',
            completedAt: now,
          },
        });
      }
    }
    await finishPendingAdjustments(this.prisma, this.prisma.applicationAdjustmentAudit, {
      where: { siteId, status: 'PENDING', expiresAt: { lt: now } },
      data: {
        status: 'EXPIRED',
        failureReason: 'COMMAND_EXPIRED',
        completedAt: now,
      },
    });
    const records = await this.prisma.adjustmentRecord.findMany({
      where: { siteId, status: 'PENDING', expiresAt: { gt: now },
        site: { automationPaused: false, structureStatus: 'COMPATIBLE' } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    return records.flatMap((record) => {
      const value = record.desiredState;
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        !('command' in value)
      )
        return [];
      const command = (value as { command: unknown }).command;
      if (!command || typeof command !== 'object' || Array.isArray(command))
        return [];
      return [
        {
          ...(command as Record<string, unknown>),
          id: record.id,
          idempotencyKey: record.idempotencyKey,
          strategyVersion: record.strategyVersion ?? 0,
          targetVersion: record.targetVersion ?? '',
          expiresAt: record.expiresAt?.toISOString() ?? now.toISOString(),
        },
      ];
    });
  }

  async completeCommand(
    siteId: string,
    id: string,
    result: {
      status: string;
      beforeState?: Record<string, unknown>;
      actualState?: Record<string, unknown>;
      failureReason?: string;
    },
  ) {
    const record = await this.prisma.adjustmentRecord.findFirst({
      where: { id, siteId },
    });
    if (!record) throw new NotFoundException('调整记录不存在');
    // A command may already be in flight when a group is stopped or edited.
    // Preserve a confirmed source success instead of leaving a misleading cancellation.
    const completedAfterCancellation =
      record.status === 'SKIPPED' &&
      Boolean(record.bindingId) &&
      result.status === 'SUCCEEDED';
    if (record.status !== 'PENDING' && !completedAfterCancellation)
      return record;
    const completionData = {
      status: result.status,
      ...(result.beforeState
        ? { beforeState: result.beforeState as Prisma.InputJsonValue }
        : {}),
      ...(result.actualState
        ? { actualState: result.actualState as Prisma.InputJsonValue }
        : {}),
      failureReason: completedAfterCancellation
        ? '配置变更前已下发的指令执行成功，请检查原站点当前状态'
        : result.failureReason,
      completedAt: new Date(),
    };
    let completed: typeof record;
    if (
      record.action !== 'ADD_POLLING_MEMBER' ||
      result.status !== 'SUCCEEDED' ||
      !record.strategyGroupId
    )
      completed = await updateAdjustment(this.prisma, this.prisma.applicationAdjustmentAudit, id, completionData);
    else {
      // A successfully added reserve becomes a controlled member. Failed/cancelled
      // additions never create phantom bindings or discard confirmed source results.
      completed = await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM strategy_group WHERE id = ${record.strategyGroupId} FOR UPDATE`,
          );
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM epay_site WHERE id = ${siteId} FOR UPDATE`,
          );
          const latest = await tx.adjustmentRecord.findUnique({
            where: { id },
          });
          if (
            !latest ||
            (latest.status !== 'PENDING' && latest.status !== 'SKIPPED')
          )
            return latest ?? record;
          if (latest.status === 'SKIPPED')
            completionData.failureReason =
              '配置变更前已下发的指令执行成功，请检查原站点当前状态';
          const group = await tx.strategyGroup.findUnique({
            where: { id: record.strategyGroupId! },
          });
          const payload = record.desiredState as {
            command?: {
              target?: { groupCode?: string };
              desiredState?: { channelCode?: string };
            };
          } | null;
          const groupCode = payload?.command?.target?.groupCode;
          const channelCode = payload?.command?.desiredState?.channelCode;
          const actualMembers = result.actualState?.members as
            | { channelCode: string }[]
            | undefined;
          if (
            group &&
            group.currentVersion === latest.groupVersion &&
            groupCode &&
            channelCode &&
            Array.isArray(actualMembers) &&
            actualMembers.some((row) => row.channelCode === channelCode)
          ) {
            const key = {
              siteId,
              controlType: 'MEMBER_WEIGHT',
              pollingGroupCode: groupCode,
              channelCode,
            };
            const existing = await tx.strategyTarget.findUnique({
              where: { siteId_controlType_pollingGroupCode_channelCode: key },
            });
            const claim = await tx.strategyTarget.findFirst({
              where: {
                groupId: group.id,
                siteId,
                pollingGroupCode: groupCode,
                controlType: 'POLLING_MEMBERS',
                isClaim: true,
              },
            });
            if (!existing && claim) {
              await tx.strategyTarget.create({
                data: {
                  ...key,
                  id: `target-${ulid().toLowerCase()}`,
                  groupId: group.id,
                  lastTriggeredAt: new Date(),
                  lastReason: '备用通道已补入，纳入当前策略组',
                },
              });
              const updated = await tx.strategyGroup.update({
                where: { id: group.id },
                data: { currentVersion: { increment: 1 } },
              });
              // Only runtime membership changed; queued commands still use the same rules.
              await tx.adjustmentRecord.updateMany({
                where: {
                  strategyGroupId: group.id,
                  groupVersion: group.currentVersion,
                  status: 'PENDING',
                },
                data: {
                  groupVersion: updated.currentVersion,
                  strategyVersion: updated.currentVersion,
                },
              });
            }
          }
          return updateAdjustment(tx, this.prisma.applicationAdjustmentAudit, id, completionData);
        },
        { timeout: 20000 },
      );
    }
    if (completed?.siteId && completed.action)
      setImmediate(() => {
        void this.recordAutomaticAdjustment(completed).catch((error: unknown) =>
          this.logger.warn(
            `自动调整日志记录失败: ${error instanceof Error ? error.message : 'unknown'}`,
          ),
        );
      });
    return completed;
  }

  private async recordAutomaticAdjustment(record: {
    id: string;
    siteId: string;
    strategyGroupId: string | null;
    action: string;
    target: Prisma.JsonValue;
    beforeState: Prisma.JsonValue | null;
    desiredState: Prisma.JsonValue | null;
    actualState: Prisma.JsonValue | null;
    status: string;
    ruleName: string | null;
    failureReason: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }) {
    const payload =
      record.desiredState && typeof record.desiredState === 'object'
        ? (record.desiredState as Record<string, any>)
        : {};
    const command =
      payload.command && typeof payload.command === 'object'
        ? (payload.command as Record<string, any>)
        : {};
    const target = command.target ?? record.target;
    const beforeState = command.expectedState ?? record.beforeState;
    const desiredState = command.desiredState ?? record.desiredState ?? {};
    const groupCode = target?.groupCode ? String(target.groupCode) : undefined;
    const site = await this.prisma.epaySite.findUnique({
      where: { id: record.siteId },
      select: { name: true },
    });
    const group = record.strategyGroupId
      ? await this.prisma.strategyGroup.findUnique({
          where: { id: record.strategyGroupId },
          select: {
            name: true,
            template: { select: { id: true, name: true } },
          },
        })
      : null;
    const pollingGroup = groupCode
      ? await this.prisma.epayPollingGroup.findFirst({
          where: { siteId: record.siteId, code: groupCode },
          select: { name: true },
        })
      : null;
    const memberCodes = [
      ...((beforeState?.members ?? []) as { channelCode?: string }[]).map(
        (row) => row.channelCode,
      ),
      ...((desiredState?.members ?? []) as { channelCode?: string }[]).map(
        (row) => row.channelCode,
      ),
      ...(target?.channelCode ? [String(target.channelCode)] : []),
    ].filter((code): code is string => Boolean(code));
    const channels = memberCodes.length
      ? await this.prisma.epayChannel.findMany({
          where: {
            siteId: record.siteId,
            code: { in: [...new Set(memberCodes)] },
          },
          select: { code: true, name: true },
        })
      : [];
    const channelNames = Object.fromEntries(
      channels.map((channel) => [channel.code, channel.name]),
    );
    const actionLabels: Record<string, string> = {
      SET_POLLING_MEMBER_WEIGHTS: '自动调整通道权重',
      SET_CHANNEL_STATUS: '自动调整通道状态',
      ADD_POLLING_MEMBER: '自动添加备用通道',
      REMOVE_POLLING_MEMBER: '自动移除轮询通道',
    };
    const finishedAt = record.completedAt ?? new Date();
    const entry: OperationLogProperties = {
      userId: 'system',
      username: '系统自动',
      domain: 'built-in',
      moduleName: '策略中心',
      description: actionLabels[record.action] ?? '系统自动调整',
      requestId: record.id,
      method: 'SYSTEM',
      url: '/system/automatic-adjustment',
      ip: '',
      userAgent: null,
      params: null,
      body: {
        audit: {
          siteId: record.siteId,
          siteName: site?.name ?? null,
          strategyGroupId: record.strategyGroupId,
          strategyGroupName: group?.name ?? null,
          strategyId: group?.template?.id ?? null,
          strategyName: group?.template?.name ?? null,
          searchText: [
            site?.name,
            group?.name,
            group?.template?.name,
            record.ruleName,
            pollingGroup?.name,
            ...Object.values(channelNames),
          ]
            .filter(Boolean)
            .join(' '),
          targetName: groupCode
            ? `${pollingGroup?.name ?? '轮询组'}（轮询组 ${groupCode}）`
            : target?.channelCode
              ? `${channelNames[String(target.channelCode)] ?? '通道'}（通道 ${String(target.channelCode)}）`
              : null,
        },
        ruleName: record.ruleName,
        action: record.action,
        target,
        beforeState,
        desiredState,
        channelNames,
      },
      response: {
        status: record.status,
        actualState: record.actualState,
        failureReason: record.failureReason,
      },
      startTime: record.createdAt,
      endTime: finishedAt,
      duration: Math.max(0, finishedAt.getTime() - record.createdAt.getTime()),
      source: 'SYSTEM',
      level:
        record.status === 'FAILED'
          ? 'ERROR'
          : record.status === 'SUCCEEDED'
            ? 'INFO'
            : 'WARN',
      status: record.status,
      objectId: record.strategyGroupId,
      objectName:
        [site?.name, group?.name, pollingGroup?.name ?? groupCode]
          .filter(Boolean)
          .join(' / ') || record.siteId,
      relatedId: record.id,
    };
    this.eventEmitter.emit(EVENT_OPERATION_LOG_CREATED, entry);
  }

  private async buildCommand(
    strategy: {
      id: string;
      groupId: string;
      group: { currentVersion: number };
    },
    scope: Scope,
    action: Action,
  ) {
    const statusValue = (status: SiteChannelStatus) =>
      status === SiteChannelStatus.ENABLED
        ? 1
        : status === SiteChannelStatus.DISABLED
          ? 0
          : -1;
    const siteId = await this.groupSiteId(strategy.groupId);
    const account =
      scope.type === 'ACCOUNT'
        ? await this.accounts.findEnabledBinding(siteId, scope.accountId)
        : null;
    if (scope.type === 'ACCOUNT' && !account)
      throw new ConflictException('账号未绑定到该站点');
    const scopedChannelCode = account?.binding.channelCode ?? scope.channelCode;
    if (action.type === 'SET_CHANNEL_STATUS') {
      if (!['CHANNEL', 'ACCOUNT'].includes(scope.type) || !scopedChannelCode)
        throw new BadRequestException(
          '通道启停策略必须指定 channelCode 或账号绑定',
        );
      const channel = await this.prisma.epayChannel.findFirst({
        where: { siteId, code: scopedChannelCode },
      });
      if (!channel || channel.sourceVersion === null)
        throw new ConflictException('目标通道不存在或数据未发布');
      const desiredState = { status: action.status };
      return {
        action: action.type,
        target: { channelCode: channel.code },
        expectedState: { status: channel.sourceStatus },
        desiredState,
        targetVersion: channel.sourceVersion,
        noop: channel.sourceStatus === action.status,
      };
    }
    const groupCode = scope.groupCode;
    if (!groupCode)
      throw new BadRequestException('轮询组策略必须指定 groupCode');
    const group = await this.prisma.epayPollingGroup.findFirst({
      where: { siteId, code: groupCode },
      include: {
        members: { orderBy: { position: 'asc' }, include: { channel: true } },
      },
    });
    if (!group || !group.sourceVersion)
      throw new ConflictException('目标轮询组不存在或数据未发布');
    const expectedMembers = group.members.map((member) => ({
      channelCode: member.channel.code,
      weight: member.weight,
      position: member.position,
    }));
    if (action.type === 'SET_POLLING_GROUP_STATUS') {
      const desiredState = { status: action.status };
      const current = statusValue(group.status);
      if (current < 0) throw new ConflictException('目标轮询组状态未知');
      return {
        action: action.type,
        target: { groupCode: group.code },
        expectedState: { status: current, info: expectedMembers },
        desiredState,
        targetVersion: group.sourceVersion,
        noop: current === action.status,
      };
    }
    if (account && action.channelCode !== account.binding.channelCode)
      throw new ConflictException('账号策略只能作用于账号绑定通道');
    const target = expectedMembers.find(
      (member) =>
        member.channelCode ===
        (account?.binding.channelCode ?? action.channelCode),
    );
    if (!target) throw new ConflictException('目标通道不是该轮询组成员');
    const weight =
      action.type === 'SET_MEMBER_WEIGHT'
        ? action.weight
        : target.weight + action.delta;
    if (
      !Number.isInteger(weight) ||
      weight < 0 ||
      weight > 2147483647 ||
      Math.abs(weight - target.weight) > 100
    )
      throw new BadRequestException('单次权重变化必须在 0 到 100 之间');
    const desiredMembers = expectedMembers.map((member) =>
      member.channelCode === target.channelCode
        ? { ...member, weight }
        : member,
    );
    const currentStatus = statusValue(group.status);
    if (currentStatus < 0) throw new ConflictException('目标轮询组状态未知');
    return {
      action: 'SET_POLLING_MEMBER_WEIGHTS',
      target: { groupCode: group.code },
      expectedState: { status: currentStatus, members: expectedMembers },
      desiredState: { status: currentStatus, members: desiredMembers },
      targetVersion: group.sourceVersion,
      noop: weight === target.weight,
    };
  }

  private async groupSiteId(groupId: string) {
    const group = await this.prisma.strategyGroup.findUnique({
      where: { id: groupId },
      select: { siteId: true },
    });
    if (!group?.siteId) throw new ConflictException('策略组未绑定站点');
    return group.siteId;
  }

  private matches(
    condition: Condition,
    summary: {
      successRate: number | null;
      failureRate: number | null;
      orderCount: number;
      stale: boolean;
    },
    accountStatus?: AccountStatus,
  ): boolean {
    if ('logic' in condition) {
      const results: boolean[] = condition.conditions.map((item) =>
        this.matches(item, summary, accountStatus),
      );
      return condition.logic === 'AND'
        ? results.every(Boolean)
        : results.some(Boolean);
    }
    if (
      condition.minSamples !== undefined &&
      summary.orderCount < condition.minSamples
    )
      return false;
    if (condition.metric === 'ACCOUNT_STATUS')
      return (
        condition.operator === 'EQ' &&
        accountStatus !== undefined &&
        accountStatus === condition.value
      );
    const actual =
      condition.metric === 'SUCCESS_RATE'
        ? summary.successRate
        : condition.metric === 'FAILURE_RATE'
          ? summary.failureRate
          : condition.metric === 'ORDER_COUNT'
            ? summary.orderCount
            : summary.stale
              ? 1
              : 0;
    if (actual === null) return false;
    const threshold = condition.value as number;
    return condition.operator === 'LT'
      ? actual < threshold
      : condition.operator === 'LTE'
        ? actual <= threshold
        : condition.operator === 'GT'
          ? actual > threshold
          : condition.operator === 'GTE'
            ? actual >= threshold
            : actual === threshold;
  }

  private parseCondition(value: unknown, depth = 0): Condition {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('策略条件格式无效');
    const row = value as Record<string, unknown>;
    if (row.logic !== undefined) {
      if (
        depth >= 3 ||
        !['AND', 'OR'].includes(String(row.logic)) ||
        !Array.isArray(row.conditions) ||
        row.conditions.length < 1 ||
        row.conditions.length > 10
      )
        throw new BadRequestException('组合条件格式无效');
      return {
        logic: row.logic as 'AND' | 'OR',
        conditions: row.conditions.map((item) =>
          this.parseCondition(item, depth + 1),
        ),
      };
    }
    if (
      ![
        'SUCCESS_RATE',
        'FAILURE_RATE',
        'ORDER_COUNT',
        'STALE',
        'ACCOUNT_STATUS',
      ].includes(String(row.metric)) ||
      !['LT', 'LTE', 'GT', 'GTE', 'EQ'].includes(String(row.operator))
    )
      throw new BadRequestException('策略条件指标或运算符无效');
    if (row.metric === 'ACCOUNT_STATUS') {
      if (
        row.operator !== 'EQ' ||
        !Object.values(AccountStatus).includes(
          String(row.value) as AccountStatus,
        )
      )
        throw new BadRequestException('账号状态条件必须使用有效状态');
      return {
        metric: 'ACCOUNT_STATUS',
        operator: 'EQ',
        value: row.value as AccountStatus,
      };
    }
    const number = Number(row.value);
    if (!Number.isFinite(number))
      throw new BadRequestException('策略条件阈值无效');
    const minSamples =
      row.minSamples === undefined ? undefined : Number(row.minSamples);
    if (
      minSamples !== undefined &&
      (!Number.isInteger(minSamples) ||
        minSamples < 0 ||
        minSamples > 10_000_000)
    )
      throw new BadRequestException('最小样本数无效');
    return {
      metric: row.metric as SimpleCondition['metric'],
      operator: row.operator as SimpleCondition['operator'],
      value: number,
      ...(minSamples === undefined ? {} : { minSamples }),
    };
  }

  private needsAccountStatus(condition: Condition): boolean {
    return 'logic' in condition
      ? condition.conditions.some((item) => this.needsAccountStatus(item))
      : condition.metric === 'ACCOUNT_STATUS';
  }

  private parseScope(value: unknown): Scope {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('策略对象格式无效');
    const row = value as Record<string, unknown>;
    if (
      !['SITE', 'CHANNEL', 'POLLING_GROUP', 'ACCOUNT'].includes(
        String(row.type),
      )
    )
      throw new BadRequestException('策略对象类型无效');
    if (
      row.type === 'ACCOUNT' &&
      (!row.accountId || typeof row.accountId !== 'string')
    )
      throw new BadRequestException('账号策略必须指定 accountId');
    return {
      type: row.type as Scope['type'],
      ...(row.accountId === undefined
        ? {}
        : { accountId: String(row.accountId) }),
      ...(row.channelCode === undefined
        ? {}
        : { channelCode: this.code(row.channelCode) }),
      ...(row.groupCode === undefined
        ? {}
        : { groupCode: this.code(row.groupCode) }),
    };
  }

  private parseAction(value: unknown): Action {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('策略动作格式无效');
    const row = value as Record<string, unknown>;
    const type = String(row.type);
    if (type === 'SET_CHANNEL_STATUS' || type === 'SET_POLLING_GROUP_STATUS') {
      if (row.status !== 0 && row.status !== 1)
        throw new BadRequestException('策略启停状态无效');
      return { type, status: row.status } as Action;
    }
    if (type !== 'SET_MEMBER_WEIGHT' && type !== 'ADJUST_MEMBER_WEIGHT')
      throw new BadRequestException('策略动作类型无效');
    const channelCode = this.code(row.channelCode);
    const amount = Number(
      type === 'SET_MEMBER_WEIGHT' ? row.weight : row.delta,
    );
    if (
      !Number.isInteger(amount) ||
      amount < -2147483647 ||
      amount > 2147483647
    )
      throw new BadRequestException('策略权重无效');
    return type === 'SET_MEMBER_WEIGHT'
      ? { type, channelCode, weight: amount }
      : { type, channelCode, delta: amount };
  }

  private code(value: unknown) {
    const code = String(value);
    if (!/^\d{1,20}$/.test(code)) throw new BadRequestException('目标编号无效');
    return code;
  }

  private async requireSite(id: string) {
    const site = await this.prisma.epaySite.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!site) throw new NotFoundException('站点不存在');
  }
}
