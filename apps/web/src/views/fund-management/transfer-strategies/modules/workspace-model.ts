import type { Payee, TransferAllocation, TransferCondition, TransferRuleInput, TransferStrategyRule } from '@/service/api';

export const metricNames: Record<TransferCondition['metric'], string> = {
  BALANCE: '可用余额',
  UNAVAILABLE_BALANCE: '不可用余额',
  PENDING_BALANCE: '待结算金额',
  TRANSFERRED_TODAY: '当日已转出金额'
};
export const operatorNames = { LT: '<', LTE: '≤', GT: '>', GTE: '≥', EQ: '=' };
export type StrategyDraft = TransferRuleInput & {
  rules: TransferStrategyRule[];
};
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function defaultRule(): TransferStrategyRule {
  return {
    name: '余额触发转账',
    enabled: true,
    conditions: [{ metric: 'BALANCE', operator: 'GTE', value: '1000.00' }],
    maxAmount: '1000.00',
    allocationMode: 'EQUAL',
    allocations: []
  };
}
export function defaultStrategy(): StrategyDraft {
  return {
    name: '',
    description: '',
    triggerBalance: '1000.00',
    reserveAmount: '0.00',
    feeBuffer: '0.00',
    minAmount: '1.00',
    maxAmount: '1000.00',
    dailyLimit: null,
    allocations: [],
    enabled: true,
    isTemplate: false,
    rules: [defaultRule()]
  };
}
export function asDraft(value: TransferRuleInput): StrategyDraft {
  return clone({
    ...value,
    description: value.description ?? '',
    rules: value.rules ?? [
      {
        name: '余额触发转账',
        enabled: true,
        conditions: [{ metric: 'BALANCE', operator: 'GTE', value: value.triggerBalance }],
        maxAmount: value.maxAmount,
        allocations: value.allocations
      }
    ]
  });
}
export function conditionLabel(condition: TransferCondition) {
  return `${metricNames[condition.metric]} ${operatorNames[condition.operator]} ${condition.value} 元`;
}
export function cents(value: string | null | undefined) {
  if (!value || !/^\d{1,16}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const number = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(number) ? number : null;
}
export function allocationMode(rule: TransferStrategyRule): 'EQUAL' | 'MANUAL' {
  if (rule.allocationMode) return rule.allocationMode;
  const points = rule.allocations.map(row => row.basisPoints);
  return !points.length || (points.reduce((sum, value) => sum + value, 0) === 10000 &&
    Math.max(...points) - Math.min(...points) <= 1) ? 'EQUAL' : 'MANUAL';
}
function equalizeAllocations(rule: TransferStrategyRule) {
  const count = rule.allocations.length;
  if (!count) return;
  const base = Math.floor(10000 / count);
  const remainder = 10000 % count;
  rule.allocations.forEach((row, index) => {
    row.basisPoints = base + (index < remainder ? 1 : 0);
  });
}
export function addAllocation(rule: TransferStrategyRule) {
  if (rule.allocations.length >= 20) return;
  rule.allocationMode = allocationMode(rule);
  rule.allocations.push({ kind: 'PAYEE', targetId: '', basisPoints: 0 });
  if (rule.allocationMode === 'EQUAL') equalizeAllocations(rule);
}
export function removeAllocation(rule: TransferStrategyRule, index: number) {
  if (index < 0 || index >= rule.allocations.length) return;
  rule.allocationMode = allocationMode(rule);
  rule.allocations.splice(index, 1);
  if (rule.allocationMode === 'EQUAL') equalizeAllocations(rule);
}
export function updateAllocationPercentage(rule: TransferStrategyRule, index: number, value: number | null | undefined) {
  rule.allocationMode = 'MANUAL';
  rule.allocations[index].basisPoints = Number.isFinite(value)
    ? Math.max(0, Math.min(10000, Math.round(value! * 100))) : 0;
}
export function allocationError(allocations: TransferAllocation[], payees: Pick<Payee, 'id' | 'status'>[]) {
  if (!allocations.length || allocations.length > 20) return '请配置 1 至 20 项收款分配';
  if (allocations.some(row => !['PAYEE', 'AUTO'].includes(row.kind)))
    return '此规则包含历史收款池配置，请选择固定账号或自动抽取';
  if (allocations.some(row => !Number.isInteger(row.basisPoints) || row.basisPoints <= 0 || row.basisPoints > 10000))
    return '每项分配比例必须大于 0 且不超过 100%';
  const total = allocations.reduce((sum, row) => sum + row.basisPoints, 0);
  if (total !== 10000) return `分配比例合计必须为 100%，当前为 ${total / 100}%`;
  const fixed = allocations.filter(row => row.kind === 'PAYEE');
  if (fixed.some(row => !row.targetId)) return '请选择固定收款账号';
  const ids = new Set(fixed.map(row => row.targetId));
  if (ids.size !== fixed.length) return '同一规则内不能重复选择收款账号';
  if (fixed.some(row => !payees.some(payee => payee.id === row.targetId && payee.status === 'ACTIVE')))
    return '固定收款账号已停用或不存在，请重新选择';
  const autoCount = allocations.length - fixed.length;
  const available = new Set(payees.filter(row => row.status === 'ACTIVE' && !ids.has(row.id)).map(row => row.id)).size;
  if (autoCount > available)
    return `自动抽取需要 ${autoCount} 个不重复账号，排除固定账号后仅有 ${available} 个可用账号`;
  return '';
}
export function ruleError(rule: TransferStrategyRule, payees: Pick<Payee, 'id' | 'status'>[]) {
  if (!rule.name.trim()) return '请填写规则名称';
  if (!rule.conditions.length || rule.conditions.length > 20) return '每条规则需要 1 至 20 个判断条件';
  const keys = new Set<string>();
  const ranges = new Map<string, [number, number]>();
  for (const condition of rule.conditions) {
    const value = cents(condition.value);
    if (value === null) return '条件金额应为非负数，最多两位小数，且不能超出安全计算范围';
    const key = `${condition.metric}:${condition.operator}:${value}`;
    if (keys.has(key)) return '同一规则中存在重复判断条件';
    keys.add(key);
    const range = ranges.get(condition.metric) ?? [0, Number.MAX_SAFE_INTEGER];
    if (condition.operator === 'GT') range[0] = Math.max(range[0], value + 1);
    if (condition.operator === 'GTE' || condition.operator === 'EQ') range[0] = Math.max(range[0], value);
    if (condition.operator === 'LT') range[1] = Math.min(range[1], value - 1);
    if (condition.operator === 'LTE' || condition.operator === 'EQ') range[1] = Math.min(range[1], value);
    if (range[0] > range[1]) return '同一规则中存在互相矛盾的判断条件';
    ranges.set(condition.metric, range);
  }
  if ((cents(rule.maxAmount) ?? 0) <= 0) return '本次转账总额上限必须大于零';
  return allocationError(rule.allocations, payees);
}
export function strategyError(form: StrategyDraft, payees: Pick<Payee, 'id' | 'status'>[]) {
  if (!form.name.trim()) return '请填写策略名称';
  if ((!form.rules.length && form.enabled) || form.rules.length > 20) return '每个策略需要 1 至 20 条规则';
  if ([form.reserveAmount, form.feeBuffer, form.minAmount].some(value => cents(value) === null))
    return '执行约束金额格式无效';
  if (form.dailyLimit && (cents(form.dailyLimit) ?? 0) < Math.max(1, cents(form.minAmount)!))
    return '每日转出限额不能小于最小转账金额';
  const seen = new Set<string>();
  for (const [index, rule] of form.rules.entries()) {
    const error = ruleError(rule, payees);
    if (error) return `规则 ${index + 1}：${error}`;
    if (cents(rule.maxAmount)! < cents(form.minAmount)!) return `规则 ${index + 1}：转账上限不能小于最小转账金额`;
    const key = rule.conditions
      .map(row => `${row.metric}:${row.operator}:${cents(row.value)}`)
      .sort()
      .join('|');
    if (seen.has(key)) return '存在相同判断条件的规则，请修改原规则';
    seen.add(key);
  }
  return '';
}
export function toInput(form: StrategyDraft): TransferRuleInput {
  const {
    name,
    description,
    reserveAmount,
    feeBuffer,
    minAmount,
    dailyLimit,
    enabled,
    isTemplate,
    rules
  } = form;
  // 旧字段保留为兼容摘要，新规则的条件及动作由 rules 决定。
  return clone({
    name,
    description: description ?? '',
    reserveAmount,
    feeBuffer,
    minAmount,
    dailyLimit: dailyLimit || null,
    enabled,
    isTemplate,
    rules,
    triggerBalance: '1.00',
    maxAmount: rules[0]?.maxAmount ?? form.maxAmount,
    allocations: rules[0]?.allocations ?? []
  });
}
