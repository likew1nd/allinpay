import { BadRequestException } from '@nestjs/common';
import type { TransferCondition, TransferStrategyRule } from '../../../../../../../contracts/transfer-strategy';
import { toCents } from './transfer-calc';

export function validateTransferConditions(rules: TransferStrategyRule[]) {
  const predicates = new Set<string>();
  for (const rule of rules) {
    const keys = rule.conditions.map(condition => `${condition.metric}:${condition.operator}:${toCents(condition.value)}`);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('同一规则中存在重复判断条件');
    // 条件全部满足，按分计算开闭区间，拒绝永远不可能命中的条件组合。
    const ranges = new Map<string, [number, number]>();
    for (const condition of rule.conditions) {
      const value = toCents(condition.value);
      const range = ranges.get(condition.metric) ?? [0, Number.MAX_SAFE_INTEGER];
      if (condition.operator === 'GT') range[0] = Math.max(range[0], value + 1);
      if (condition.operator === 'GTE' || condition.operator === 'EQ') range[0] = Math.max(range[0], value);
      if (condition.operator === 'LT') range[1] = Math.min(range[1], value - 1);
      if (condition.operator === 'LTE' || condition.operator === 'EQ') range[1] = Math.min(range[1], value);
      if (range[0] > range[1]) throw new BadRequestException('同一规则中存在互相矛盾的判断条件');
      ranges.set(condition.metric, range);
    }
    const key = keys.sort().join('|');
    if (predicates.has(key)) throw new BadRequestException('存在相同判断条件的规则，请修改原规则');
    predicates.add(key);
  }
}

export function firstMatchingTransferRule(
  rules: TransferStrategyRule[],
  metrics: Record<TransferCondition['metric'], string | null>,
): TransferStrategyRule | undefined {
  return rules.find(rule => rule.enabled && rule.conditions.length > 0 && rule.conditions.every(condition => {
    const raw = metrics[condition.metric];
    // 未采集的余额不能当成零参与判断。
    if (raw == null) return false;
    const actual = toCents(raw);
    const expected = toCents(condition.value);
    switch (condition.operator) {
      case 'LT': return actual < expected;
      case 'LTE': return actual <= expected;
      case 'GT': return actual > expected;
      case 'GTE': return actual >= expected;
      case 'EQ': return actual === expected;
      default: return false;
    }
  }));
}
