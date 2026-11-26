import { BadRequestException } from '@nestjs/common';

export type ControlType = 'MEMBER_WEIGHT' | 'CHANNEL_STATUS' | 'RULE_ACTIONS';
export type TemplateCondition = {
  metric: 'SUCCESS_RATE' | 'FAILURE_RATE' | 'ORDER_COUNT' | 'CHANNEL_COUNT';
  operator: 'LT' | 'LTE' | 'GT' | 'GTE' | 'EQ';
  value: number;
};
export type TemplateRule = TemplateCondition & {
  name?: string;
  // Additional AND conditions; preserve the original first condition for compatibility.
  conditions?: TemplateCondition[];
  action: {
    type:
      | 'ADJUST_MEMBER_WEIGHT'
      | 'SET_MEMBER_WEIGHT'
      | 'SET_CHANNEL_STATUS'
      | 'ADD_POLLING_MEMBER'
      | 'REMOVE_POLLING_MEMBER'
      | 'REMOVE_REPLACEMENT_MEMBER';
    value: number;
  };
};
export type TargetMetrics = {
  successRate: number | null;
  failureRate: number | null;
  orderCount: number;
  channelCount?: number | null;
};

export function ruleConditions(rule: TemplateRule): TemplateCondition[] {
  return [rule, ...(rule.conditions ?? [])];
}

function parseCondition(value: unknown): TemplateCondition {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('判断条件格式无效');
  const row = value as TemplateCondition;
  if (
    !['SUCCESS_RATE', 'FAILURE_RATE', 'ORDER_COUNT', 'CHANNEL_COUNT'].includes(
      row.metric,
    ) ||
    !['LT', 'LTE', 'GT', 'GTE', 'EQ'].includes(row.operator)
  )
    throw new BadRequestException('规则指标或比较方式无效');
  if (
    typeof row.value !== 'number' ||
    !Number.isFinite(row.value) ||
    row.value < 0 ||
    (['ORDER_COUNT', 'CHANNEL_COUNT'].includes(row.metric)
      ? !Number.isInteger(row.value) || row.value > 10000000
      : row.value > 1)
  )
    throw new BadRequestException(
      '规则阈值无效，数量应为 0 到 10000000 的整数，比例应在 0 到 1 之间',
    );
  return { metric: row.metric, operator: row.operator, value: row.value };
}

function conditionKey(condition: TemplateCondition) {
  return JSON.stringify([
    condition.metric,
    condition.operator,
    condition.value,
  ]);
}

export function parseTemplateRules(
  value: unknown,
  controlType: string,
  minWeight: number,
  maxWeight: number,
): TemplateRule[] {
  if (
    !['MEMBER_WEIGHT', 'CHANNEL_STATUS', 'RULE_ACTIONS'].includes(controlType)
  )
    throw new BadRequestException('控制类型无效');
  if (minWeight > maxWeight)
    throw new BadRequestException('权重下限不能大于上限');
  if (!Array.isArray(value) || value.length < 1 || value.length > 20)
    throw new BadRequestException('模板需要 1 至 20 条规则');
  const seen = new Set<string>();
  return value.map((input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new BadRequestException('规则格式无效');
    const row = input as TemplateRule;
    const firstCondition = parseCondition(row);
    if (
      row.conditions !== undefined &&
      (!Array.isArray(row.conditions) || row.conditions.length > 19)
    )
      throw new BadRequestException('每条规则最多包含 20 个判断条件');
    const conditions = (row.conditions ?? []).map(parseCondition);
    const predicateKeys = [firstCondition, ...conditions].map(conditionKey);
    if (new Set(predicateKeys).size !== predicateKeys.length)
      throw new BadRequestException('同一规则中存在重复的判断条件');
    const action = row.action;
    if (!action || !Number.isInteger(action.value))
      throw new BadRequestException('规则动作无效');
    if (action.type === 'SET_CHANNEL_STATUS') {
      if (controlType === 'MEMBER_WEIGHT' || ![0, 1].includes(action.value))
        throw new BadRequestException('通道全局状态动作无效');
    } else if (controlType === 'CHANNEL_STATUS') {
      throw new BadRequestException('通道启停模板只能设置通道状态');
    } else if (action.type === 'ADJUST_MEMBER_WEIGHT') {
      if (!action.value || Math.abs(action.value) > 100)
        throw new BadRequestException('单次调权幅度为 1 至 100');
    } else if (action.type === 'SET_MEMBER_WEIGHT') {
      if (action.value < minWeight || action.value > maxWeight)
        throw new BadRequestException('目标权重必须在模板上下限内');
    } else if (action.type === 'ADD_POLLING_MEMBER') {
      if (action.value < minWeight || action.value > maxWeight)
        throw new BadRequestException('补入通道的初始权重必须在模板上下限内');
    } else if (
      action.type === 'REMOVE_POLLING_MEMBER' ||
      action.type === 'REMOVE_REPLACEMENT_MEMBER'
    ) {
      if (action.value !== 0)
        throw new BadRequestException('移除通道动作无需设置数值');
    } else throw new BadRequestException('成员调权模板不能改变通道全局状态');
    // Identical predicates make later rules unreachable, even if actions differ.
    // AND is commutative: rearranging conditions must not bypass duplicate detection.
    const key = JSON.stringify(predicateKeys.sort());
    if (seen.has(key))
      throw new BadRequestException('存在完全相同的判断条件，请合并规则');
    seen.add(key);
    return {
      ...(typeof row.name === 'string' && row.name.trim()
        ? { name: row.name.trim() }
        : {}),
      ...firstCondition,
      ...(conditions.length ? { conditions } : {}),
      action: { type: action.type, value: action.value },
    };
  });
}

export function describeRule(rule: TemplateRule) {
  const metrics = {
    SUCCESS_RATE: '成功率',
    FAILURE_RATE: '失败率',
    ORDER_COUNT: '订单数量',
    CHANNEL_COUNT: '通道数量',
  };
  const operators = { LT: '<', LTE: '≤', GT: '>', GTE: '≥', EQ: '=' };
  const description = ruleConditions(rule)
    .map((condition) => {
      const threshold = ['ORDER_COUNT', 'CHANNEL_COUNT'].includes(
        condition.metric,
      )
        ? condition.value
        : `${Math.round(condition.value * 10000) / 100}%`;
      return `${metrics[condition.metric]} ${operators[condition.operator]} ${threshold}`;
    })
    .join(' 且 ');
  let action: string;
  switch (rule.action.type) {
    case 'SET_MEMBER_WEIGHT':
      action = `设置权重 ${rule.action.value}`;
      break;
    case 'ADJUST_MEMBER_WEIGHT':
      action = `${rule.action.value < 0 ? '减少' : '增加'}权重 ${Math.abs(rule.action.value)}`;
      break;
    case 'ADD_POLLING_MEMBER':
      action = `添加通道（权重 ${rule.action.value}）`;
      break;
    case 'REMOVE_REPLACEMENT_MEMBER':
      action = '回切（移出此前为本通道补入的备用通道）';
      break;
    case 'REMOVE_POLLING_MEMBER':
      action = '移除通道';
      break;
    case 'SET_CHANNEL_STATUS':
      action = rule.action.value ? '启动通道（全局）' : '停止通道（全局）';
      break;
  }
  return `${description} → ${action}`;
}

export function isWeightAction(rule: TemplateRule) {
  return ['ADJUST_MEMBER_WEIGHT', 'SET_MEMBER_WEIGHT'].includes(
    rule.action.type,
  );
}

export function isMembershipAction(rule: TemplateRule) {
  return [
    'ADD_POLLING_MEMBER',
    'REMOVE_POLLING_MEMBER',
    'REMOVE_REPLACEMENT_MEMBER',
  ].includes(
    rule.action.type,
  );
}

export function rankReserveChannels<
  T extends { code: string; successRate: number | null },
>(channels: T[]): T[] {
  return [...channels].sort((a, b) => {
    if (a.successRate === null && b.successRate !== null) return -1;
    if (b.successRate === null && a.successRate !== null) return 1;
    return (
      (b.successRate ?? 0) - (a.successRate ?? 0) ||
      a.code.localeCompare(b.code, 'en', { numeric: true })
    );
  });
}

export function matchingRule(
  rules: TemplateRule[],
  metrics: TargetMetrics,
): TemplateRule | undefined {
  return rules.find((rule) =>
    ruleConditions(rule).every((condition) => {
      const actual =
        condition.metric === 'SUCCESS_RATE'
          ? metrics.successRate
          : condition.metric === 'FAILURE_RATE'
            ? metrics.failureRate
            : condition.metric === 'CHANNEL_COUNT'
              ? metrics.channelCount
              : metrics.orderCount;
      if (actual === null || actual === undefined) return false;
      return condition.operator === 'LT'
        ? actual < condition.value
        : condition.operator === 'LTE'
          ? actual <= condition.value
          : condition.operator === 'GT'
            ? actual > condition.value
            : condition.operator === 'GTE'
              ? actual >= condition.value
              : actual === condition.value;
    }),
  );
}

export function nextWeight(
  current: number,
  rule: TemplateRule,
  minimum: number,
  maximum: number,
) {
  const requested =
    rule.action.type === 'SET_MEMBER_WEIGHT'
      ? rule.action.value
      : current + rule.action.value;
  const bounded = Math.max(minimum, Math.min(maximum, requested));
  // Approach an absolute target gradually; never exceed the source's single-step limit.
  return current + Math.max(-100, Math.min(100, bounded - current));
}
