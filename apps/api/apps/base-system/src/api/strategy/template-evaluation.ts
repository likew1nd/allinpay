import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { mapOrderStatus, summarizeOrderCounts } from '../site/order-mapping';
import {
  describeRule,
  isMembershipAction,
  isWeightAction,
  matchingRule,
  nextWeight,
  parseTemplateRules,
  rankReserveChannels,
  ruleConditions,
} from './template-rules';
import { configurationFrom, newId, reserveChannelsFrom } from './template-strategy.shared';

export async function channelRates(
  tx: Prisma.TransactionClient,
  site: { id: string; activeSyncId: string | null; lastSyncAt: Date | null },
  windowMinutes: number,
  now = new Date(),
) {
  const rates = new Map<string, number>();
  if (
    !site.activeSyncId ||
    !site.lastSyncAt ||
    now.getTime() - site.lastSyncAt.getTime() > 90000
  )
    return rates;
  const windowStart = new Date(now.getTime() - windowMinutes * 60000);
  const sync = await tx.epaySyncRun.findUnique({
    where: { id: site.activeSyncId },
    select: { windowStart: true },
  });
  if (!sync || sync.windowStart > windowStart) return rates;
  const counts = await tx.epayOrder.groupBy({
    by: ['channelCode', 'sourceStatus'],
    where: {
      siteId: site.id,
      syncRunId: site.activeSyncId,
      occurredAt: { gte: windowStart, lte: now },
    },
    _count: { _all: true },
  });
  const totals = new Map<string, { success: number; total: number }>();
  for (const row of counts) {
    if (!row.channelCode) continue;
    const status = mapOrderStatus(row.sourceStatus);
    if (status === 'EXCLUDED') continue;
    const count = totals.get(row.channelCode) ?? { success: 0, total: 0 };
    count.total += row._count._all;
    if (status === 'SUCCESS') count.success += row._count._all;
    totals.set(row.channelCode, count);
  }
  for (const [code, count] of totals)
    rates.set(code, count.success / count.total);
  return rates;
}

/** 评估单个执行对象：命中规则后生成调整指令，模拟模式只演算不写库；必须在可序列化事务内调用 */
export async function evaluateStrategyTarget(
  tx: Prisma.TransactionClient,
  id: string,
  simulation: boolean,
) {
  const initial = await tx.strategyTarget.findUnique({
    where: { id },
    select: { groupId: true, siteId: true },
  });
  if (!initial) throw new NotFoundException('绑定已移除');
  if (!simulation)
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM strategy_group WHERE id = ${initial.groupId} FOR UPDATE`,
    );
  if (!simulation)
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM epay_site WHERE id = ${initial.siteId} FOR UPDATE`,
    );
  const target = await tx.strategyTarget.findUnique({
    where: { id },
    include: { site: true, group: { include: { template: true } } },
  });
  if (!target?.group.configuration)
    throw new ConflictException('绑定或模板不存在');
  const { site, group } = target;
  const template = configurationFrom(group.configuration)!;
  const now = new Date();
  const base = {
    bindingId: id,
    siteId: site.id,
    siteName: site.name,
    channelCode: target.channelCode,
    pollingGroupCode: target.pollingGroupCode,
  };
  const finish = async (
    reason: string,
    extra: Record<string, unknown> = {},
  ) => {
    if (!simulation)
      await tx.strategyTarget.update({
        where: { id },
        data: { lastEvaluatedAt: now, lastReason: reason },
      });
    return { ...base, matched: false, reason, ...extra };
  };
  if (!simulation && group.status !== 'RUNNING')
    return finish('策略组已停止');
  if (
    site.connectionStatus !== 'ONLINE' ||
    site.structureStatus !== 'COMPATIBLE' ||
    site.automationPaused ||
    !site.lastHeartbeatAt ||
    now.getTime() - site.lastHeartbeatAt.getTime() > 90000
  )
    return finish('站点离线、暂停或结构不兼容');
  if (
    !site.activeSyncId ||
    !site.lastSyncAt ||
    now.getTime() - site.lastSyncAt.getTime() > 90000
  )
    return finish('订单数据尚未同步或已过期');
  const rules = parseTemplateRules(
    template.rules,
    template.controlType,
    template.minWeight,
    template.maxWeight,
  );
  const hasChannelCount = rules.some((rule) =>
    ruleConditions(rule).some(
      (condition) => condition.metric === 'CHANNEL_COUNT',
    ),
  );
  if (hasChannelCount && !target.pollingGroupCode)
    return finish('通道数量指标需要绑定具体轮询组');
  const windowStart = new Date(
    now.getTime() - template.windowMinutes * 60000,
  );
  const sync = await tx.epaySyncRun.findUnique({
    where: { id: site.activeSyncId },
    select: { windowStart: true },
  });
  if (!sync) return finish('订单数据尚未同步或已过期');
  const orderWindowCovered = sync.windowStart <= windowStart;
  if (!orderWindowCovered && !hasChannelCount)
    return finish('已同步数据未覆盖模板统计窗口');
  // Count actual membership, including members not managed by this strategy.
  // Serializable evaluation keeps the count and subsequent command in one snapshot.
  const countedPolling = target.pollingGroupCode
    ? await tx.epayPollingGroup.findFirst({
        where: {
          siteId: site.id,
          code: target.pollingGroupCode,
          sourceVersion: { not: null },
        },
        select: { _count: { select: { members: true } } },
      })
    : null;
  const channelCount = countedPolling?._count.members ?? null;
  if (hasChannelCount && channelCount === null)
    return finish('轮询组不存在或尚未同步');
  const counts = orderWindowCovered
    ? await tx.epayOrder.groupBy({
        by: ['sourceStatus'],
        where: {
          siteId: site.id,
          syncRunId: site.activeSyncId,
          channelCode: target.channelCode,
          occurredAt: { gte: windowStart, lte: now },
        },
        _count: { _all: true },
      })
    : [];
  const { orderCount, successRate, failureRate } =
    summarizeOrderCounts(counts);
  const metrics = {
    orderCount,
    channelCount,
    orderWindowCovered,
    successRate,
    failureRate,
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
    scope: 'CHANNEL',
  };
  const orderMetricsAvailable =
    orderWindowCovered && orderCount >= template.minSamples;
  // Missing order samples only exclude order-dependent rules. Membership
  // rules still run in their original order, even when there are no orders.
  const rule = matchingRule(
    rules.filter((candidate) =>
      ruleConditions(candidate).every(
        (condition) =>
          condition.metric === 'CHANNEL_COUNT' || orderMetricsAvailable,
      ),
    ),
    metrics,
  );
  if (!rule) {
    const needsOrderMetrics = rules.some((candidate) =>
      ruleConditions(candidate).some(
        (condition) => condition.metric !== 'CHANNEL_COUNT',
      ),
    );
    if (needsOrderMetrics && !orderWindowCovered)
      return finish('已同步数据未覆盖模板统计窗口', { metrics });
    if (needsOrderMetrics && !orderMetricsAvailable)
      return finish('订单样本不足', { metrics });
    return finish('未命中规则', { metrics });
  }
  const ruleDescription = describeRule(rule);
  const context = { matched: true, ruleName: ruleDescription, metrics };
  const statusAction = rule.action.type === 'SET_CHANNEL_STATUS';
  const membershipAction = isMembershipAction(rule);
  const executionTarget = membershipAction
    ? await tx.strategyTarget.findFirst({
        where: {
          groupId: group.id,
          siteId: site.id,
          pollingGroupCode: target.pollingGroupCode,
          controlType: 'POLLING_MEMBERS',
          isClaim: true,
        },
      })
    : statusAction && target.pollingGroupCode
      ? await tx.strategyTarget.findFirst({
          where: {
            groupId: group.id,
            siteId: site.id,
            channelCode: target.channelCode,
            controlType: 'CHANNEL_STATUS',
            pollingGroupCode: '',
          },
        })
      : target;
  if (!executionTarget)
    return finish('执行归属尚未配置，请重新保存策略组', context);
  if (
    executionTarget.lastTriggeredAt &&
    now.getTime() - executionTarget.lastTriggeredAt.getTime() <
      template.cooldownSeconds * 1000
  )
    return finish('该对象处于冷却期', context);
  const channel = await tx.epayChannel.findFirst({
    where: { siteId: site.id, code: target.channelCode },
  });
  if (!channel?.sourceVersion)
    return finish('通道不存在或尚未同步', context);
  let command: {
    action: string;
    target: Record<string, unknown>;
    expectedState: Record<string, unknown>;
    desiredState: Record<string, unknown>;
    targetVersion: string;
    noop: boolean;
  };
  if (target.pollingGroupCode && statusAction) {
    const member = await tx.epayPollingGroup.findFirst({
      where: {
        siteId: site.id,
        code: target.pollingGroupCode,
        sourceVersion: { not: null },
        members: { some: { channelId: channel.id } },
      },
      select: { id: true },
    });
    if (!member) return finish('通道已不属于该轮询组，请移除绑定', context);
  }
  if (statusAction) {
    command = {
      action: 'SET_CHANNEL_STATUS',
      target: { channelCode: channel.code },
      expectedState: { status: channel.sourceStatus },
      desiredState: { status: rule.action.value },
      targetVersion: channel.sourceVersion,
      noop: channel.sourceStatus === rule.action.value,
    };
  } else {
    if (!target.pollingGroupCode)
      return finish('调权或增删通道需要绑定具体轮询组成员', context);
    if (!simulation)
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM epay_polling_group WHERE site_id = ${site.id} AND code = ${target.pollingGroupCode} FOR UPDATE`,
      );
    const polling = await tx.epayPollingGroup.findFirst({
      where: { siteId: site.id, code: target.pollingGroupCode },
      include: {
        members: {
          orderBy: { position: 'asc' },
          include: { channel: true },
        },
      },
    });
    if (!polling?.sourceVersion)
      return finish('轮询组不存在或尚未同步', context);
    if (isWeightAction(rule) && polling.kind !== 1)
      return finish('该轮询组不使用加权随机，无法调权', context);
    const member = polling.members.find(
      (row) => row.channel.code === target.channelCode,
    );
    if (polling.status !== 'ENABLED')
      return finish('轮询组已停止，暂不调整成员', context);
    const members = polling.members.map((row) => ({
      channelCode: row.channel.code,
      weight: row.weight,
      position: row.position,
    }));
    if (rule.action.type === 'ADD_POLLING_MEMBER') {
      if (members.length >= 2000)
        return finish('轮询组已达到 2000 个成员上限', context);
      if (!polling.paymentTypeId)
        return finish('轮询组支付方式尚未同步，不能补入通道', context);
      const reserves = reserveChannelsFrom(group.reserveChannels).filter(
        (row) => row.siteId === site.id,
      );
      if (!reserves.length)
        return finish('本站点未勾选补充备用通道', context);
      const rates = await channelRates(
        tx,
        site,
        template.windowMinutes,
        now,
      );
      const candidates = await tx.epayChannel.findMany({
        where: {
          siteId: site.id,
          code: { in: reserves.map((row) => row.channelCode) },
          sourceVersion: { not: null },
          status: 'ENABLED',
          sourceStatus: 1,
          dayStatus: 0,
          paymentTypeId: polling.paymentTypeId,
        },
        include: { pollingMembers: { select: { groupId: true } } },
      });
      const candidate = rankReserveChannels(
        candidates
          .filter(
            (row) =>
              !members.some((member) => member.channelCode === row.code) &&
              (reserves.find((reserve) => reserve.channelCode === row.code)!
                .allowReuse ||
                !row.pollingMembers.length),
          )
          .map((row) => ({
            ...row,
            successRate: rates.get(row.code) ?? null,
          })),
      )[0];
      if (!candidate)
        return finish(
          '没有可用备用通道（需同支付方式、已启用且符合复用设置）',
          context,
        );
      const reserve = reserves.find(
        (row) => row.channelCode === candidate.code,
      )!;
      command = {
        action: 'ADD_POLLING_MEMBER',
        target: { groupCode: polling.code },
        expectedState: { status: 1, members },
        desiredState: {
          status: 1,
          members: [
            ...members,
            {
              channelCode: candidate.code,
              weight: rule.action.value,
              position: members.length,
            },
          ],
          channelCode: candidate.code,
          allowReuse: reserve.allowReuse,
        },
        targetVersion: polling.sourceVersion,
        noop: false,
      };
    } else if (rule.action.type === 'REMOVE_REPLACEMENT_MEMBER') {
      // 回切：移出此前为当前通道补入、且仍在轮询组中的备用通道。
      // 来源取自成功的补入调整记录（desiredState 里保存了触发通道和备用通道），不另建表。
      const added = await tx.adjustmentRecord.findMany({
        where: {
          siteId: site.id,
          strategyGroupId: group.id,
          action: 'ADD_POLLING_MEMBER',
          status: 'SUCCEEDED',
        },
        orderBy: { completedAt: 'desc' },
        take: 200,
        select: { desiredState: true },
      });
      let replacement: string | undefined;
      for (const row of added) {
        const state = row.desiredState as unknown as {
          command?: { target?: { groupCode?: string } };
          channelCode?: string;
          affectedChannelCode?: string;
        } | null;
        const candidate = state?.affectedChannelCode;
        if (
          !!state &&
          state.command?.target?.groupCode === polling.code &&
          state.channelCode === target.channelCode &&
          candidate &&
          candidate !== target.channelCode &&
          members.some((current) => current.channelCode === candidate)
        ) {
          replacement = candidate;
          break;
        }
      }
      if (!replacement)
        return finish(
          '没有可回切的备用通道（本通道尚未触发过补入，或备用通道已不在轮询组中）',
          context,
        );
      if (members.length <= 1)
        return finish('至少保留一个轮询成员，未执行回切', context);
      command = {
        action: 'REMOVE_POLLING_MEMBER',
        target: { groupCode: polling.code },
        expectedState: { status: 1, members },
        desiredState: {
          status: 1,
          members: members
            .filter((row) => row.channelCode !== replacement)
            .map((row, position) => ({ ...row, position })),
          channelCode: replacement,
        },
        targetVersion: polling.sourceVersion,
        noop: false,
      };
    } else if (rule.action.type === 'REMOVE_POLLING_MEMBER') {
      if (!member)
        return finish('通道已不在该轮询组中，无需移除', {
          ...context,
          executable: false,
        });
      if (members.length <= 1)
        return finish('至少保留一个轮询成员，未执行移除', context);
      command = {
        action: 'REMOVE_POLLING_MEMBER',
        target: { groupCode: polling.code },
        expectedState: { status: 1, members },
        desiredState: {
          status: 1,
          members: members
            .filter((row) => row.channelCode !== channel.code)
            .map((row, position) => ({ ...row, position })),
          channelCode: channel.code,
        },
        targetVersion: polling.sourceVersion,
        noop: false,
      };
    } else {
      if (!member)
        return finish(
          '通道已不属于该轮询组，暂不调权；可保留绑定供添加规则判断',
          context,
        );
      if (channel.status !== 'ENABLED')
        return finish('通道已停止，暂不调权', context);
      const weight = nextWeight(
        member.weight,
        rule,
        template.minWeight,
        template.maxWeight,
      );
      command = {
        action: 'SET_POLLING_MEMBER_WEIGHTS',
        target: { groupCode: polling.code },
        expectedState: { status: 1, members },
        desiredState: {
          status: 1,
          members: members.map((row) =>
            row.channelCode === target.channelCode
              ? { ...row, weight }
              : row,
          ),
        },
        targetVersion: polling.sourceVersion,
        noop: weight === member.weight,
      };
    }
  }
  // The source writes a full polling-group member array. Serialize those writes,
  // including across strategy groups, and wait for a fresh sync after completion.
  if (!simulation)
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM epay_channel WHERE id = ${channel.id} FOR UPDATE`,
    );
  const pending = await tx.adjustmentRecord.findMany({
    where: {
      siteId: site.id,
      action: {
        in: [
          'SET_CHANNEL_STATUS',
          'SET_POLLING_MEMBER_WEIGHTS',
          'ADD_POLLING_MEMBER',
          'REMOVE_POLLING_MEMBER',
        ],
      },
      OR: [
        { status: 'PENDING', expiresAt: { gt: now } },
        { status: 'SUCCEEDED', completedAt: { gte: site.lastSyncAt } },
      ],
    },
    select: { target: true, action: true, desiredState: true },
  });
  if (
    pending.some((row) => {
      const scope = row.target as Record<string, unknown> | null;
      const state = row.desiredState as Record<string, unknown> | null;
      if (JSON.stringify(row.target) === JSON.stringify(command.target))
        return true;
      if (
        membershipAction &&
        ['ADD_POLLING_MEMBER', 'REMOVE_POLLING_MEMBER'].includes(row.action)
      )
        return true;
      const previous = state?.command as
        | {
            expectedState?: { members?: { channelCode: string }[] };
            desiredState?: { members?: { channelCode: string }[] };
          }
        | undefined;
      const currentMembers = [
        ...((command.expectedState.members ?? []) as {
          channelCode: string;
        }[]),
        ...((command.desiredState.members ?? []) as {
          channelCode: string;
        }[]),
      ];
      if (row.action === 'SET_CHANNEL_STATUS')
        return statusAction
          ? scope?.channelCode === target.channelCode
          : currentMembers.some(
              (member) => member.channelCode === scope?.channelCode,
            );
      return (
        statusAction &&
        [
          ...(previous?.expectedState?.members ?? []),
          ...(previous?.desiredState?.members ?? []),
        ].some((member) => member.channelCode === target.channelCode)
      );
    })
  )
    return finish('等待同一目标的调整完成并同步', context);
  if (simulation)
    return finish(
      command.noop ? '已达到目标，无需调整' : '可生成调整指令',
      {
        ...context,
        executable: !command.noop,
        beforeState: command.expectedState,
        desiredState: command.desiredState,
      },
    );
  const expiresAt = new Date(now.getTime() + 120000);
  const adjustment = await tx.adjustmentRecord.create({
    data: {
      id: newId('adjustment'),
      siteId: site.id,
      strategyGroupId: group.id,
      bindingId: executionTarget.id,
      groupVersion: group.currentVersion,
      ruleName: ruleDescription,
      strategyVersion: group.currentVersion,
      action: command.action,
      target: command.target as Prisma.InputJsonValue,
      beforeState: command.expectedState as Prisma.InputJsonValue,
      desiredState: {
        command,
        expiresAt: expiresAt.toISOString(),
        templateId: group.templateId,
        templateName: group.template?.name ?? '自定义规则',
        groupName: group.name,
        channelCode: target.channelCode,
        affectedChannelCode:
          command.desiredState.channelCode ?? target.channelCode,
        metrics,
        ruleSnapshot: rule,
        constraints: {
          windowMinutes: template.windowMinutes,
          minSamples: template.minSamples,
          cooldownSeconds: template.cooldownSeconds,
          minWeight: template.minWeight,
          maxWeight: template.maxWeight,
        },
      } as unknown as Prisma.InputJsonValue,
      targetVersion: command.targetVersion,
      status: command.noop ? 'SKIPPED' : 'PENDING',
      expiresAt,
      idempotencyKey: newId('command'),
      ...(command.noop
        ? { completedAt: now, failureReason: '已达到目标，无需调整' }
        : {}),
    },
  });
  await tx.strategyTarget.update({
    where: { id: executionTarget.id },
    data: { lastTriggeredAt: now },
  });
  await tx.strategyGroup.update({
    where: { id: group.id },
    data: { lastRunAt: now },
  });
  return finish(
    command.noop ? '已达到目标，无需调整' : '已生成指令，等待站点执行',
    { ...context, adjustmentId: adjustment.id, status: adjustment.status },
  );
}
