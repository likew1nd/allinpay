import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { blockedMessage, deleteCheckOf } from '../delete-check';
import { PageStrategyDto } from './dto/strategy.dto';
import {
  BindTargetsDto,
  SaveTemplateDto,
  SaveWorkspaceGroupDto,
} from './dto/template.dto';
import {
  isMembershipAction,
  isWeightAction,
  parseTemplateRules,
  ruleConditions,
} from './template-rules';
import { channelRates, evaluateStrategyTarget } from './template-evaluation';
import { finishPendingAdjustments } from './adjustment-audit';
import { configurationFrom, newId, reserveChannelsFrom } from './template-strategy.shared';

type GroupInput = {
  name?: string;
  description?: string;
  templateId?: string;
  status?: string;
};

@Injectable()
export class TemplateStrategyService {
  private readonly logger = new Logger(TemplateStrategyService.name);
  private ticking = false;
  constructor(private readonly prisma: PrismaService) {}

  private async transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: 'Serializable',
          timeout: 20000,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 2
        )
          continue;
        throw error;
      }
    }
  }

  async pageTemplates(query: PageStrategyDto) {
    const where = query.keyword ? { name: { contains: query.keyword } } : {};
    const [records, total] = await this.prisma.$transaction([
      this.prisma.strategyTemplate.findMany({
        where,
        include: { _count: { select: { groups: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.current - 1) * query.size,
        take: query.size,
      }),
      this.prisma.strategyTemplate.count({ where }),
    ]);
    return { records, total, current: query.current, size: query.size };
  }

  async findTemplate(id: string) {
    const template = await this.prisma.strategyTemplate.findUnique({
      where: { id },
    });
    if (!template) throw new NotFoundException('策略模板不存在');
    return template;
  }

  async saveTemplate(dto: SaveTemplateDto, id?: string) {
    if (!dto.name.trim()) throw new BadRequestException('请填写模板名称');
    const rules = parseTemplateRules(
      dto.rules,
      dto.controlType,
      dto.minWeight,
      dto.maxWeight,
    );
    const data = {
      ...dto,
      name: dto.name.trim(),
      rules: rules as unknown as Prisma.InputJsonValue,
    };
    try {
      return await this.transaction(async (tx) => {
        const duplicate = await tx.strategyTemplate.findFirst({
          where: { name: data.name, ...(id ? { id: { not: id } } : {}) },
          select: { id: true },
        });
        if (duplicate)
          throw new ConflictException('模板名称已存在，请使用其他名称');
        if (!id)
          return tx.strategyTemplate.create({
            data: { ...data, id: newId('template') },
          });
        const current = await tx.strategyTemplate.findUnique({
          where: { id },
          include: { _count: { select: { groups: true } } },
        });
        if (!current) throw new NotFoundException('策略模板不存在');
        return tx.strategyTemplate.update({
          where: { id },
          data: { ...data, version: { increment: 1 } },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('模板名称已存在，请使用其他名称');
      throw error;
    }
  }

  async deleteTemplate(id: string) {
    return this.transaction(async (tx) => {
      const row = await tx.strategyTemplate.findUnique({
        where: { id },
        include: { _count: { select: { groups: true } } },
      });
      if (!row) throw new NotFoundException('策略模板不存在');
      await tx.strategyTemplate.delete({ where: { id } });
      return { id };
    });
  }

  async pageGroups(query: PageStrategyDto) {
    const where: Prisma.StrategyGroupWhereInput = {
      ...(query.keyword ? { name: { contains: query.keyword } } : {}),
      ...(query.siteId ? { targets: { some: { siteId: query.siteId } } } : {}),
    };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.strategyGroup.findMany({
        where,
        include: {
          template: true,
          _count: { select: { targets: { where: { isClaim: false } } } },
          targets: {
            where: { isClaim: false },
            select: {
              siteId: true,
              site: { select: { id: true, name: true } },
            },
            distinct: ['siteId'],
          },
        },
        orderBy: { id: 'desc' },
        skip: (query.current - 1) * query.size,
        take: query.size,
      }),
      this.prisma.strategyGroup.count({ where }),
    ]);
    return { records, total, current: query.current, size: query.size };
  }

  async objectCatalog(windowMinutes = 10) {
    const [sites, owners] = await Promise.all([
      this.prisma.epaySite.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          connectionStatus: true,
          activeSyncId: true,
          lastSyncAt: true,
          channels: {
            where: { sourceVersion: { not: null } },
            orderBy: { code: 'asc' },
            select: { code: true, name: true, status: true },
          },
          pollingGroups: {
            orderBy: { code: 'asc' },
            select: {
              code: true,
              name: true,
              kind: true,
              status: true,
              sourceVersion: true,
              members: {
                orderBy: { position: 'asc' },
                select: {
                  weight: true,
                  channel: { select: { code: true, name: true, status: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.strategyTarget.findMany({
        select: {
          siteId: true,
          pollingGroupCode: true,
          channelCode: true,
          controlType: true,
          groupId: true,
          group: { select: { name: true } },
        },
      }),
    ]);
    const now = new Date();
    return {
      windowMinutes,
      sites: await Promise.all(
        sites.map(async ({ activeSyncId, lastSyncAt, ...site }) => {
          const rates = await channelRates(
            this.prisma,
            { id: site.id, activeSyncId, lastSyncAt },
            windowMinutes,
            now,
          );
          const channelRate = <T extends { code: string }>(channel: T) => ({
            ...channel,
            successRate: rates.get(channel.code) ?? null,
          });
          return {
            ...site,
            channels: site.channels.map(channelRate),
            pollingGroups: site.pollingGroups.map((group) => ({
              ...group,
              members: group.members.map((member) => ({
                ...member,
                channel: channelRate(member.channel),
              })),
              published: Boolean(group.sourceVersion),
              sourceVersion: undefined,
            })),
          };
        }),
      ),
      owners,
    };
  }

  async workspaceGroup(id: string) {
    const group = await this.prisma.strategyGroup.findUnique({
      where: { id },
      include: { template: { select: { id: true, name: true } } },
    });
    if (!group) throw new NotFoundException('策略组不存在');
    return { ...group, bindings: await this.bindings(id) };
  }

  async saveWorkspaceGroup(dto: SaveWorkspaceGroupDto, id?: string) {
    if (!dto.name.trim()) throw new BadRequestException('请填写策略组名称');
    const configuration = configurationFrom(dto.configuration)!;
    configuration.rules = parseTemplateRules(
      configuration.rules,
      configuration.controlType,
      configuration.minWeight,
      configuration.maxWeight,
    );
    const key = (target: {
      siteId: string;
      pollingGroupCode: string;
      channelCode: string;
    }) =>
      JSON.stringify([
        target.siteId,
        target.pollingGroupCode,
        target.channelCode,
      ]);
    if (new Set(dto.targets.map(key)).size !== dto.targets.length)
      throw new BadRequestException('执行对象重复');
    try {
      return await this.transaction(async (tx) => {
        if (id)
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM strategy_group WHERE id = ${id} FOR UPDATE`,
          );
        const current = id
          ? await tx.strategyGroup.findUnique({
              where: { id },
              include: { targets: true },
            })
          : null;
        if (id && !current) throw new NotFoundException('策略组不存在');
        if (current && dto.expectedVersion !== current.currentVersion)
          throw new ConflictException(
            '策略组已被修改，请重新加载后再保存，当前修改未提交',
          );
        if (
          dto.templateId &&
          !(await tx.strategyTemplate.findUnique({
            where: { id: dto.templateId },
            select: { id: true },
          }))
        )
          throw new ConflictException(
            '所选模板已删除，请重新选择模板或使用自定义规则',
          );
        const reserves =
          dto.reserveChannels ?? reserveChannelsFrom(current?.reserveChannels);
        if (
          new Set(
            reserves.map((row) =>
              JSON.stringify([row.siteId, row.channelCode]),
            ),
          ).size !== reserves.length
        )
          throw new BadRequestException('备用通道重复');
        const siteIds = [
          ...new Set(
            [...dto.targets, ...reserves].map((target) => target.siteId),
          ),
        ];
        const needsWeight = configuration.rules.some(isWeightAction);
        const needsMembership = configuration.rules.some(isMembershipAction);
        const needsChannelCount = configuration.rules.some((rule) =>
          ruleConditions(rule).some(
            (condition) => condition.metric === 'CHANNEL_COUNT',
          ),
        );
        const needsStatus = configuration.rules.some(
          (rule) => rule.action.type === 'SET_CHANNEL_STATUS',
        );
        const desired = dto.targets.map((target) => ({
          ...target,
          controlType: target.pollingGroupCode
            ? 'MEMBER_WEIGHT'
            : 'CHANNEL_STATUS',
          isClaim: false,
        }));
        if (needsStatus) {
          const controlledSites = new Set(
            dto.targets.map((target) => target.siteId),
          );
          const canAdd = configuration.rules.some(
            (rule) => rule.action.type === 'ADD_POLLING_MEMBER',
          );
          for (const target of [
            ...dto.targets,
            ...reserves
              .filter((row) => canAdd && controlledSites.has(row.siteId))
              .map((row) => ({ ...row, pollingGroupCode: '' })),
          ]) {
            if (
              !desired.some(
                (row) =>
                  row.siteId === target.siteId &&
                  row.channelCode === target.channelCode &&
                  !row.pollingGroupCode,
              )
            )
              desired.push({
                siteId: target.siteId,
                channelCode: target.channelCode,
                pollingGroupCode: '',
                controlType: 'CHANNEL_STATUS',
                isClaim: true,
              });
          }
        }
        if (needsMembership) {
          for (const target of dto.targets.filter(
            (row) => row.pollingGroupCode,
          )) {
            if (
              !desired.some(
                (row) =>
                  row.siteId === target.siteId &&
                  row.pollingGroupCode === target.pollingGroupCode &&
                  row.channelCode === '',
              )
            )
              desired.push({
                siteId: target.siteId,
                pollingGroupCode: target.pollingGroupCode,
                channelCode: '',
                controlType: 'POLLING_MEMBERS',
                isClaim: true,
              });
          }
        }
        if (siteIds.length)
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM epay_site WHERE id IN (${Prisma.join([...siteIds].sort())}) ORDER BY id FOR UPDATE`,
          );
        const [channels, pollingGroups, owners] = await Promise.all([
          tx.epayChannel.findMany({
            where: { siteId: { in: siteIds }, sourceVersion: { not: null } },
            select: { siteId: true, code: true },
          }),
          tx.epayPollingGroup.findMany({
            where: { siteId: { in: siteIds } },
            select: {
              siteId: true,
              code: true,
              kind: true,
              sourceVersion: true,
              members: { select: { channel: { select: { code: true } } } },
            },
          }),
          tx.strategyTarget.findMany({
            where: {
              siteId: { in: siteIds },
              ...(id ? { groupId: { not: id } } : {}),
            },
            include: { group: { select: { name: true } } },
          }),
        ]);
        const channelKeys = new Set(
          channels.map((channel) =>
            JSON.stringify([channel.siteId, channel.code]),
          ),
        );
        const ownerMap = new Map(owners.map((target) => [key(target), target]));
        for (const reserve of reserves) {
          if (
            !channelKeys.has(
              JSON.stringify([reserve.siteId, reserve.channelCode]),
            ) &&
            !reserveChannelsFrom(current?.reserveChannels).some(
              (row) =>
                row.siteId === reserve.siteId &&
                row.channelCode === reserve.channelCode,
            )
          )
            throw new BadRequestException(
              `备用通道 ${reserve.channelCode} 不存在或尚未同步`,
            );
        }
        for (const target of dto.targets) {
          const existing = current?.targets.find(
            (row) => !row.isClaim && key(row) === key(target),
          );
          // Existing stale objects remain visible and removable without blocking unrelated edits.
          if (
            !existing &&
            !channelKeys.has(
              JSON.stringify([target.siteId, target.channelCode]),
            )
          )
            throw new BadRequestException(
              `通道 ${target.channelCode} 不存在或尚未同步`,
            );
          if (!target.pollingGroupCode) {
            if (needsWeight || needsMembership || needsChannelCount)
              throw new BadRequestException(
                '调权、增删成员动作或通道数量指标需要具体轮询组，请从轮询组中选择受控通道；全部通道中的备用勾选独立保存',
              );
          } else {
            const polling = pollingGroups.find(
              (group) =>
                group.siteId === target.siteId &&
                group.code === target.pollingGroupCode,
            );
            if (
              !existing &&
              (!polling?.sourceVersion ||
                (needsWeight && polling.kind !== 1) ||
                !polling.members.some(
                  (member) => member.channel.code === target.channelCode,
                ))
            )
              throw new BadRequestException(
                `轮询组 ${target.pollingGroupCode} 必须${needsWeight ? '使用加权随机且' : ''}包含通道 ${target.channelCode}`,
              );
            if (needsWeight && polling && polling.kind !== 1)
              throw new BadRequestException(
                `轮询组 ${target.pollingGroupCode} 不使用加权随机，不能执行调权动作`,
              );
            const structuralOwner = owners.find(
              (row) =>
                row.siteId === target.siteId &&
                row.pollingGroupCode === target.pollingGroupCode &&
                (needsMembership || row.controlType === 'POLLING_MEMBERS'),
            );
            if (structuralOwner)
              throw new ConflictException(
                `轮询组 ${target.pollingGroupCode} 已归属“${structuralOwner.group.name}”，增删成员规则需要独占该轮询组，所有修改均未提交`,
              );
          }
        }
        for (const target of desired) {
          const owner = ownerMap.get(key(target));
          if (owner)
            throw new ConflictException(
              `通道 ${target.channelCode} 的${target.controlType === 'MEMBER_WEIGHT' ? '该轮询成员' : target.controlType === 'POLLING_MEMBERS' ? '轮询组成员管理' : '全局启停'}已归属“${owner.group.name}”，所有修改均未提交`,
            );
        }
        const groupId = current?.id ?? newId('strategy-group');
        const data = {
          name: dto.name.trim(),
          description: dto.description ?? '',
          templateId: dto.templateId ?? null,
          siteId: null,
          configuration: configuration as unknown as Prisma.InputJsonValue,
          reserveChannels: reserves.map(
            ({ siteId, channelCode, allowReuse }) => ({
              siteId,
              channelCode,
              allowReuse,
            }),
          ) as Prisma.InputJsonValue,
          status: 'PAUSED' as const,
        };
        const group = current
          ? await tx.strategyGroup.update({
              where: { id },
              data: { ...data, currentVersion: { increment: 1 } },
            })
          : await tx.strategyGroup.create({ data: { ...data, id: groupId } });
        const desiredKeys = new Set(desired.map(key));
        const retained = (current?.targets ?? []).filter((target) =>
          desiredKeys.has(key(target)),
        );
        for (const target of retained) {
          const next = desired.find((row) => key(row) === key(target))!;
          if (next.isClaim !== target.isClaim)
            await tx.strategyTarget.update({
              where: { id: target.id },
              data: { isClaim: next.isClaim },
            });
        }
        await tx.strategyTarget.deleteMany({
          where: {
            groupId,
            id: { notIn: retained.map((target) => target.id) },
          },
        });
        const retainedKeys = new Set(retained.map(key));
        const added = desired.filter(
          (target) => !retainedKeys.has(key(target)),
        );
        if (added.length)
          await tx.strategyTarget.createMany({
            data: added.map((target) => ({
              ...target,
              id: newId('target'),
              groupId,
            })),
          });
        await this.cancelPending(
          tx,
          [groupId],
          '策略规则或绑定已修改，请确认后重新启用',
        );
        return group;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          '执行对象刚被其他策略组绑定，请刷新后重试，所有修改均未提交',
        );
      throw error;
    }
  }

  async saveGroup(dto: GroupInput, id?: string) {
    if (dto.name !== undefined && !dto.name.trim())
      throw new BadRequestException('请填写策略组名称');
    if (dto.templateId) {
      if (dto.status === 'RUNNING')
        throw new ConflictException('应用模板后请先保存，再确认启用');
      const template = await this.prisma.strategyTemplate.findUnique({
        where: { id: dto.templateId },
      });
      if (!template) throw new NotFoundException('策略模板不存在');
      const current = id ? await this.workspaceGroup(id) : null;
      return this.saveWorkspaceGroup(
        {
          name: dto.name ?? current?.name ?? '',
          description: dto.description ?? current?.description ?? '',
          templateId: template.id,
          expectedVersion: current?.currentVersion,
          configuration: configurationFrom(template)!,
          targets:
            current?.bindings.map(
              ({ siteId, pollingGroupCode, channelCode }) => ({
                siteId,
                pollingGroupCode,
                channelCode,
              }),
            ) ?? [],
          reserveChannels: reserveChannelsFrom(current?.reserveChannels),
        },
        id,
      );
    }
    return this.transaction(async (tx) => {
      if (id)
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM strategy_group WHERE id = ${id} FOR UPDATE`,
        );
      const current = id
        ? await tx.strategyGroup.findUnique({
            where: { id },
            include: { _count: { select: { targets: true } }, template: true },
          })
        : null;
      if (id && !current) throw new NotFoundException('策略组不存在');
      // Status toggles use the group's private snapshot and survive template deletion.
      if (current && !dto.templateId) {
        if (!current.configuration)
          throw new ConflictException('请先配置策略规则');
        if (dto.status === 'RUNNING' && !current._count.targets)
          throw new ConflictException('请先绑定执行对象');
        const result = await tx.strategyGroup.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description }
              : {}),
            ...(dto.status
              ? { status: dto.status as 'RUNNING' | 'PAUSED' }
              : {}),
            currentVersion: { increment: 1 },
          },
        });
        await this.cancelPending(tx, [current.id], '策略组配置或状态已变更');
        return result;
      }
      throw new BadRequestException('请选择策略模板，或通过策略组配置创建规则');
    });
  }

  /**
   * 删除前检查：只读。策略组正在运行、仍绑定执行对象时都不能删，需要先停止、先全部移除绑定。
   * 弹窗和真正的删除共用 groupDeleteCheck，保证两边判断一致。
   */
  private groupDeleteCheck(
    group: { name: string; status: string },
    bindings: Awaited<ReturnType<TemplateStrategyService['bindings']>>,
  ) {
    const LIMIT = 30;
    const label = (row: (typeof bindings)[number]) =>
      `${row.site?.name ?? row.siteId} · ${row.pollingGroupCode ? `${row.pollingGroupName || row.pollingGroupCode} / ` : ''}${row.channelName || row.channelCode}`;
    const shown = bindings.slice(0, LIMIT).map((row) => ({ id: row.id, label: label(row) }));
    if (bindings.length > LIMIT)
      shown.push({ id: 'more', label: `……另有 ${bindings.length - LIMIT} 个执行对象` });
    return deleteCheckOf(
      group.name,
      [
        {
          kind: 'GROUP_RUNNING',
          title: '策略组正在运行，请先停止策略组',
          items: group.status === 'RUNNING' ? [{ id: 'running', label: '运行中' }] : [],
        },
        {
          kind: 'GROUP_TARGET',
          title: `仍绑定 ${bindings.length} 个执行对象，请进入策略组把它们全部移除并保存`,
          items: shown,
        },
      ],
      ['待执行的调整记录会标记为跳过', '已有的执行记录会保留，不会回滚站点上已调整的权重和状态'],
    );
  }

  async deleteCheck(id: string) {
    const group = await this.workspaceGroup(id);
    return this.groupDeleteCheck(group, group.bindings);
  }

  async deleteGroup(id: string) {
    return this.transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM strategy_group WHERE id = ${id} FOR UPDATE`,
      );
      const group = await tx.strategyGroup.findUnique({ where: { id } });
      if (!group) throw new NotFoundException('策略组不存在');
      const check = this.groupDeleteCheck(group, await this.bindings(id, tx));
      if (!check.canDelete) throw new ConflictException(blockedMessage(check));
      await this.cancelPending(tx, [id], '策略组已删除');
      await tx.strategyGroup.delete({ where: { id } });
      return { id };
    });
  }

  async bindings(
    groupId: string,
    db: Pick<
      Prisma.TransactionClient,
      'strategyTarget' | 'epayChannel' | 'epayPollingGroup'
    > = this.prisma,
  ) {
    const rows = await db.strategyTarget.findMany({
      where: { groupId, isClaim: false },
      include: { site: { select: { id: true, name: true } } },
      orderBy: [
        { siteId: 'asc' },
        { pollingGroupCode: 'asc' },
        { channelCode: 'asc' },
      ],
    });
    const sites = [...new Set(rows.map((row) => row.siteId))];
    const [channels, groups] = await Promise.all([
      db.epayChannel.findMany({
        where: { siteId: { in: sites } },
        select: { siteId: true, code: true, name: true },
      }),
      db.epayPollingGroup.findMany({
        where: { siteId: { in: sites } },
        select: { siteId: true, code: true, name: true },
      }),
    ]);
    return rows.map((row) => ({
      ...row,
      channelName: channels.find(
        (c) => c.siteId === row.siteId && c.code === row.channelCode,
      )?.name,
      pollingGroupName: groups.find(
        (g) => g.siteId === row.siteId && g.code === row.pollingGroupCode,
      )?.name,
    }));
  }

  async bind(groupId: string, dto: BindTargetsDto) {
    const group = await this.workspaceGroup(groupId);
    if (group.status === 'RUNNING')
      throw new ConflictException('请先停止策略组再修改绑定');
    const configuration = configurationFrom(group.configuration);
    if (!configuration) throw new ConflictException('请先配置策略规则');
    await this.saveWorkspaceGroup(
      {
        name: group.name,
        description: group.description ?? '',
        templateId: group.templateId,
        expectedVersion: group.currentVersion,
        configuration,
        targets: [
          ...group.bindings.map(
            ({ siteId, pollingGroupCode, channelCode }) => ({
              siteId,
              pollingGroupCode,
              channelCode,
            }),
          ),
          ...dto.channelCodes.map((channelCode) => ({
            siteId: dto.siteId,
            pollingGroupCode: dto.pollingGroupCode ?? '',
            channelCode,
          })),
        ],
      },
      groupId,
    );
    return { count: dto.channelCodes.length };
  }

  async unbind(groupId: string, id: string) {
    const group = await this.workspaceGroup(groupId);
    if (group.status === 'RUNNING')
      throw new ConflictException('请先停止策略组再修改绑定');
    if (!group.bindings.some((binding) => binding.id === id))
      throw new NotFoundException('绑定不存在');
    const configuration = configurationFrom(group.configuration);
    if (!configuration) throw new ConflictException('请先配置策略规则');
    await this.saveWorkspaceGroup(
      {
        name: group.name,
        description: group.description ?? '',
        templateId: group.templateId,
        expectedVersion: group.currentVersion,
        configuration,
        targets: group.bindings
          .filter((binding) => binding.id !== id)
          .map(({ siteId, pollingGroupCode, channelCode }) => ({
            siteId,
            pollingGroupCode,
            channelCode,
          })),
      },
      groupId,
    );
    return { id };
  }

  private async cancelPending(
    tx: Prisma.TransactionClient,
    ids: string[],
    reason: string,
  ) {
    if (ids.length)
      await finishPendingAdjustments(tx, this.prisma.applicationAdjustmentAudit, {
        where: { strategyGroupId: { in: ids }, status: 'PENDING' },
        data: {
          status: 'SKIPPED',
          failureReason: reason,
          completedAt: new Date(),
        },
      });
  }

  async evaluateGroup(groupId: string, simulation = false) {
    const group = await this.prisma.strategyGroup.findUnique({
      where: { id: groupId },
      include: {
        template: true,
        targets: {
          where: { isClaim: false },
          orderBy: [{ lastTriggeredAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!group?.configuration) throw new ConflictException('请先配置策略规则');
    if (!simulation && group.status !== 'RUNNING')
      throw new ConflictException('策略组尚未启用');
    const results = [];
    for (const target of group.targets) {
      try {
        results.push(await this.evaluateTarget(target.id, simulation));
      } catch (error) {
        const reason = error instanceof Error ? error.message : '评估失败';
        results.push({
          bindingId: target.id,
          siteId: target.siteId,
          channelCode: target.channelCode,
          pollingGroupCode: target.pollingGroupCode,
          matched: false,
          reason,
        });
        if (!simulation)
          await this.prisma.strategyTarget.updateMany({
            where: { id: target.id },
            data: {
              lastEvaluatedAt: new Date(),
              lastReason: reason.slice(0, 190),
            },
          });
      }
    }
    return { simulation, groupId, results };
  }

  private async evaluateTarget(id: string, simulation: boolean) {
    return this.transaction((tx) => evaluateStrategyTarget(tx, id, simulation, this.prisma.applicationAdjustmentAudit));
  }

  @Interval(30000)
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const groups = await this.prisma.strategyGroup.findMany({
        where: { status: 'RUNNING', configuration: { not: Prisma.DbNull } },
        select: { id: true },
        orderBy: [{ lastRunAt: 'asc' }, { id: 'asc' }],
      });
      for (const group of groups)
        await this.evaluateGroup(group.id).catch((error) =>
          this.logger.warn(
            `策略组 ${group.id} 评估失败: ${error instanceof Error ? error.message : 'unknown'}`,
          ),
        );
    } finally {
      this.ticking = false;
    }
  }
}
