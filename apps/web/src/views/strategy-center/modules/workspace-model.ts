import type {
  StrategyConfiguration,
  TemplateCondition,
  TemplateInput,
  TemplateRule,
  WorkspaceTarget
} from '@/service/api';

export const metricNames = {
  SUCCESS_RATE: '成功率',
  FAILURE_RATE: '失败率',
  ORDER_COUNT: '订单数量',
  CHANNEL_COUNT: '通道数量'
};
export const operatorNames = { LT: '<', LTE: '≤', GT: '>', GTE: '≥', EQ: '=' };
export const maxRuleConditions = 20;
export function ruleConditions(rule: TemplateRule): TemplateCondition[] {
  return [rule, ...(rule.conditions ?? [])];
}
export function conditionKey(condition: TemplateCondition) {
  return JSON.stringify([condition.metric, condition.operator, condition.value]);
}
export function ruleKey(rule: TemplateRule) {
  return JSON.stringify(ruleConditions(rule).map(conditionKey).sort());
}
export function ruleConditionError(rule: TemplateRule) {
  const conditions = ruleConditions(rule);
  if (conditions.length > maxRuleConditions) return `每条规则最多包含 ${maxRuleConditions} 个判断条件`;
  if (new Set(conditions.map(conditionKey)).size !== conditions.length) return '同一规则中存在重复的判断条件';
  return '';
}
export function copyRule(rule: TemplateRule): TemplateRule {
  const copyCondition = ({ metric, operator, value }: TemplateCondition) => ({ metric, operator, value });
  return {
    ...copyCondition(rule),
    ...(rule.conditions?.length ? { conditions: rule.conditions.map(copyCondition) } : {}),
    action: { ...rule.action }
  };
}
export function defaultRule(controlType = 'RULE_ACTIONS'): TemplateRule {
  return {
    metric: 'SUCCESS_RATE',
    operator: 'LT',
    value: 0.7,
    action: {
      type: controlType === 'CHANNEL_STATUS' ? 'SET_CHANNEL_STATUS' : 'ADJUST_MEMBER_WEIGHT',
      value: controlType === 'CHANNEL_STATUS' ? 0 : -10
    }
  };
}
export function defaultConfiguration(
  controlType: StrategyConfiguration['controlType'] = 'RULE_ACTIONS'
): StrategyConfiguration {
  const rules = [defaultRule(controlType)];
  if (controlType !== 'CHANNEL_STATUS')
    rules.push({
      metric: 'SUCCESS_RATE',
      operator: 'GTE',
      value: 0.9,
      action: { type: 'ADJUST_MEMBER_WEIGHT', value: 10 }
    });
  return { controlType, windowMinutes: 10, minSamples: 1, cooldownSeconds: 300, minWeight: 0, maxWeight: 100, rules };
}
export function copyConfiguration(value: StrategyConfiguration): StrategyConfiguration {
  return {
    controlType: 'RULE_ACTIONS',
    windowMinutes: value.windowMinutes,
    minSamples: value.minSamples,
    cooldownSeconds: value.cooldownSeconds,
    minWeight: value.minWeight,
    maxWeight: value.maxWeight,
    rules: value.rules.map(copyRule)
  };
}
export function asTemplate(value: StrategyConfiguration, name: string, description = ''): TemplateInput {
  return { ...copyConfiguration(value), name, description };
}
export function singleConditionLabel(condition: TemplateCondition) {
  const value = ['ORDER_COUNT', 'CHANNEL_COUNT'].includes(condition.metric)
    ? condition.value
    : `${Math.round(condition.value * 10000) / 100}%`;
  return `${metricNames[condition.metric]} ${operatorNames[condition.operator]} ${value}`;
}
export function conditionLabel(rule: TemplateRule) {
  return ruleConditions(rule).map(singleConditionLabel).join(' 且 ');
}
export function actionLabel(rule: TemplateRule) {
  if (rule.action.type === 'SET_CHANNEL_STATUS')
    return rule.action.value ? '启动通道（影响全局，慎用）' : '停止通道（影响全局，慎用）';
  if (rule.action.type === 'ADD_POLLING_MEMBER') return `添加 1 个备用通道 · 初始权重 ${rule.action.value}`;
  if (rule.action.type === 'REMOVE_POLLING_MEMBER') return '从轮询组移除通道（不自动补入）';
  if (rule.action.type === 'REMOVE_REPLACEMENT_MEMBER') return '回切：移出此前为本通道补入的备用通道';
  if (rule.action.type === 'SET_MEMBER_WEIGHT') return`设置权重为 ${rule.action.value}`;
  return `权重${rule.action.value < 0 ? '减少' : '增加'} ${Math.abs(rule.action.value)}`;
}
export function isWeightAction(rule: TemplateRule) {
  return ['ADJUST_MEMBER_WEIGHT', 'SET_MEMBER_WEIGHT'].includes(rule.action.type);
}
export function isMembershipAction(rule: TemplateRule) {
  return ['ADD_POLLING_MEMBER', 'REMOVE_POLLING_MEMBER', 'REMOVE_REPLACEMENT_MEMBER'].includes(rule.action.type);
}
export function successRateLabel(value: number | null | undefined) {
  return value === null || value === undefined ? '暂无' : `${Math.round(value * 10000) / 100}%`;
}
export function targetKey(target: WorkspaceTarget) {
  return JSON.stringify([target.siteId, target.pollingGroupCode, target.channelCode]);
}
