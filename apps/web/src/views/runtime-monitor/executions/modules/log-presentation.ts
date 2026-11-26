import type { OperationLogRecord } from '@/service/api/operation-log';
import { summarizeTargetChanges } from './target-changes';

type Values = Record<string, unknown>;
interface LogContext {
  row: OperationLogRecord;
  body: Values;
  audit: Values;
  siteRelated: boolean;
  strategyRelated: boolean;
}
export interface LogChange {
  field: string;
  before: string;
  after: string;
  actual?: string;
}

const fieldLabels: Record<string, string> = {
  name: '名称',
  status: '启停状态',
  enabled: '是否启用',
  automationPaused: '站点自动调整',
  controlType: '调整方式',
  windowMinutes: '统计窗口（分钟）',
  minSamples: '最少订单样本数',
  cooldownSeconds: '两次调整间隔（秒）',
  minWeight: '权重下限',
  maxWeight: '权重上限',
  rules: '触发条件和执行动作',
  targets: '执行对象',
  channel: '通道',
  site: '站点',
  weight: '权重',
  position: '轮询顺序',
  mode: '结算方式',
  rate: '手续费率',
  costRate: '成本费率',
  dailyLimit: '单日金额上限',
  dailyOrderLimit: '单日订单上限',
  minAmount: '单笔最小金额',
  maxAmount: '单笔最大金额',
  rateLimitSeconds: '限频间隔（秒）',
  rateLimitCount: '限频次数',
  startHour: '开始小时',
  endHour: '结束小时',
  feeThreshold: '手续费门槛',
  minFee: '最低手续费',
  orderName: '订单名称',
  orderNameRules: '订单名称规则',
  appTypes: '支付端类型',
  apptype: '支付端类型',
  paymentTypeId: '支付方式编号',
  paymentType: '支付方式',
  plugin: '支付接口',
  reason: '原因',
  failureReason: '失败原因',
  message: '说明',
  note: '说明',
  result: '结果',
  beforeState: '修改前',
  desiredState: '本次设置',
  actualState: '实际回读',
  siteId: '站点编号',
  siteName: '站点',
  strategyGroupId: '策略组编号',
  strategyGroupName: '策略组',
  strategyName: '策略',
  ruleName: '触发规则',
  channelCode: '通道编号',
  groupCode: '轮询组编号',
  channelName: '通道',
  pollingGroupName: '轮询组',
  targetName: '操作对象',
  members: '轮询成员',
  field: '设置项',
  before: '修改前',
  after: '本次设置',
  expectedStatus: '修改前状态',
  paused: '暂停自动调整',
  value: '设置值',
  baseUrl: '站点网址',
  timezone: '站点时区',
  remark: '备注',
  description: '说明',
  accountId: '账号编号',
  username: '账号',
  userName: '账号',
  roleName: '角色',
  action: '执行动作',
  scope: '作用范围',
  type: '类型',
  priority: '优先级',
  executionOrder: '执行顺序',
  threshold: '触发阈值',
  operator: '比较方式',
  metric: '监测指标',
  resetConfiguration: '重置配置',
  configuredFields: '已修改配置项',
  appTypesChanged: '支付端类型有变更'
};
const valueLabels: Record<string, string> = {
  SUCCEEDED: '成功',
  FAILED: '失败',
  PENDING: '等待执行',
  SKIPPED: '已跳过',
  EXPIRED: '已过期',
  UNKNOWN: '结果未知',
  ENABLED: '启用',
  DISABLED: '停用',
  RUNNING: '运行中',
  STOPPED: '已停止',
  PAUSED: '已暂停',
  DRAFT: '未启用',
  MEMBER_WEIGHT: '按轮询成员权重调整',
  CHANNEL_STATUS: '调整通道启停',
  RULE_ACTIONS: '按规则自动调整',
  SET_POLLING_MEMBER_WEIGHTS: '调整通道权重',
  SET_CHANNEL_STATUS: '调整通道启停',
  SET_POLLING_GROUP_STATUS: '调整轮询组启停',
  ADD_POLLING_MEMBER: '添加备用通道',
  REMOVE_POLLING_MEMBER: '移除轮询通道',
  SUCCESS_RATE: '成功率',
  FAILURE_RATE: '失败率',
  ORDER_COUNT: '订单数',
  CHANNEL_COUNT: '通道数',
  LT: '低于',
  LTE: '不高于',
  GT: '高于',
  GTE: '不低于',
  EQ: '等于'
};
const descriptionLabels: Record<string, string> = {
  'Create a New AccessKey': '新增接口密钥',
  'Delete a AccessKey': '删除接口密钥',
  'Create a New Domain': '新增权限域',
  'Update a Domain': '修改权限域',
  'Delete a Domain': '删除权限域',
  'Create a New Route': '新增菜单',
  'Update a Route': '修改菜单',
  'Delete a Route': '删除菜单',
  'Create a New Role': '新增角色',
  'Update a Role': '修改角色',
  'Delete a Role': '删除角色',
  'Create a New User': '新增用户',
  'Update a User': '修改用户',
  'Delete a User': '删除用户'
};

function record(value: unknown): Values {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Values) : {};
}
function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
function list(value: unknown): Values[] {
  return Array.isArray(value) ? value.map(record) : [];
}
function fieldLabel(field: string) {
  return fieldLabels[field] ?? field;
}
function fieldValue(field: string, value: unknown): string | undefined {
  if (field === 'automationPaused' && typeof value === 'boolean') return value ? '已暂停' : '已开启';
  if (field === 'status' || field === 'expectedStatus') {
    if (value === 1 || value === '1') return '启用';
    if (value === 0 || value === '0') return '停用';
  }
  if (field === 'mode' && ['0', '1'].includes(String(value))) return String(value) === '0' ? '余额结算' : '扣费模式';
  if (field === 'rate' || field === 'costRate') return `${String(value)}%`;
  return undefined;
}
export function formatLogValue(field: string, value: unknown): string {
  if (value === undefined) return '未记录';
  if (value === null || value === '') return '未设置';
  const translated = fieldValue(field, value);
  if (translated !== undefined) return translated;
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.length ? value.map(item => formatLogValue(field, item)).join('、') : '无';
  if (typeof value === 'object') {
    return (
      Object.entries(record(value))
        .map(([key, item]) => `${fieldLabel(key)}：${formatLogValue(key, item)}`)
        .join('；') || '无'
    );
  }
  return valueLabels[String(value)] ?? String(value);
}
export function statusLabel(status: string) {
  return valueLabels[status] ?? '结果未记录';
}
export function levelLabel(level: string) {
  return ({ INFO: '普通记录', WARN: '需要关注', ERROR: '异常记录' } as Record<string, string>)[level] ?? '级别未记录';
}
export function levelType(level: string) {
  if (level === 'ERROR') return 'danger';
  if (level === 'WARN') return 'warning';
  return 'info';
}
function savedChanges(audit: Values, omitTargets = false): LogChange[] {
  return list(audit.changes).flatMap(change => {
    if (typeof change.field !== 'string') return [];
    const field = change.field;
    if (omitTargets && field === 'targets') return [];
    // 配置只展示后端保存的脱敏说明，不读取或猜测密钥旧值。
    if (field.startsWith('configuration.') || field === 'connectionSettings') {
      return [
        {
          field: field === 'connectionSettings' ? '数据库连接信息' : `配置项“${field.slice(14)}”`,
          before: '已隐藏',
          after: '已更新（具体值已隐藏）'
        }
      ];
    }
    return [
      {
        field: fieldLabel(field),
        before: formatLogValue(field, change.before),
        after: formatLogValue(field, change.after)
      }
    ];
  });
}
function sameValue(before: unknown, after: unknown) {
  if (before === after) return true;
  const scalar = (value: unknown) => typeof value === 'number' || typeof value === 'string';
  return scalar(before) && scalar(after) && String(before) === String(after);
}
function membersByCode(value: unknown) {
  return new Map(
    list(value)
      .filter(member => text(member.channelCode))
      .map(member => [String(member.channelCode), member])
  );
}
function memberWeight(member: Values | undefined, knownMembers: boolean, missing: string) {
  if (member) return formatLogValue('weight', member.weight);
  return knownMembers ? missing : '未记录';
}
function memberChanges(
  before: Values,
  after: Values,
  { actual, names }: { actual: Values; names: Values }
): LogChange[] {
  const previous = membersByCode(before.members);
  const current = membersByCode(after.members);
  const readback = membersByCode(actual.members);
  return [...new Set([...previous.keys(), ...current.keys()])].flatMap(code => {
    const oldMember = previous.get(code);
    const newMember = current.get(code);
    const name = text(names[code]) || `通道 ${code}`;
    const changes: LogChange[] = [];
    if (!sameValue(oldMember?.weight, newMember?.weight) || !oldMember || !newMember) {
      changes.push({
        field: `${name}的权重`,
        before: memberWeight(oldMember, Array.isArray(before.members), '未加入轮询'),
        after: memberWeight(newMember, Array.isArray(after.members), '移出轮询'),
        actual: Array.isArray(actual.members) ? memberWeight(readback.get(code), true, '未在轮询中') : undefined
      });
    }
    if (oldMember && newMember && !sameValue(oldMember.position, newMember.position)) {
      changes.push({
        field: `${name}的轮询顺序`,
        before: formatLogValue('position', oldMember.position),
        after: formatLogValue('position', newMember.position)
      });
    }
    return changes;
  });
}
function stateChanges(body: Values, response: Values): LogChange[] {
  const before = record(body.beforeState);
  const after = record(body.desiredState);
  const actual = record(response.actualState);
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changes: LogChange[] = fields
    .filter(field => field !== 'members' && field !== 'revision' && !sameValue(before[field], after[field]))
    .map(field => ({
      field: fieldLabel(field),
      before: formatLogValue(field, before[field]),
      after: formatLogValue(field, after[field]),
      actual: actual[field] === undefined ? undefined : formatLogValue(field, actual[field])
    }));
  changes.push(...memberChanges(before, after, { actual, names: record(body.channelNames) }));
  if (
    !changes.length &&
    body.expectedStatus !== undefined &&
    body.status !== undefined &&
    !sameValue(body.expectedStatus, body.status)
  ) {
    changes.push({
      field: '启停状态',
      before: formatLogValue('status', body.expectedStatus),
      after: formatLogValue('status', body.status),
      actual: undefined
    });
  }
  return changes;
}
function outcome(row: OperationLogRecord, response: Values) {
  const reason = text(response.failureReason) || text(response.message) || text(record(response.error).message);
  const results: Record<string, string> = {
    SUCCEEDED: '操作成功',
    FAILED: '操作失败，本次设置未确认生效',
    PENDING: '已提交，等待执行',
    SKIPPED: '本次已跳过，没有执行修改',
    EXPIRED: '指令已过期，没有执行修改',
    UNKNOWN: '旧记录未保存执行结果'
  };
  return { result: results[row.status] ?? '执行结果未记录', reason: row.status === 'SUCCEEDED' ? '' : reason };
}
function legacySiteName(row: OperationLogRecord, siteRelated: boolean) {
  if (!siteRelated || !row.objectName) return '';
  if (row.objectName.includes(' / ')) return row.objectName.split(' / ')[0];
  if (row.moduleName === '站点管理' && !/\/channels(?:\/|$)/.test(row.url)) return row.objectName;
  return '';
}
function siteLabel({ row, body, audit, siteRelated, strategyRelated }: LogContext) {
  const sites = [
    ...new Set(
      list(audit.sites)
        .map(site => text(site.siteName) || text(site.siteId))
        .filter(Boolean)
    )
  ];
  const recorded = sites.join('、') || text(audit.siteName) || text(body.siteName);
  if (recorded) return recorded;
  const legacy = legacySiteName(row, siteRelated);
  if (legacy) return legacy;
  const siteId = text(audit.siteId) || text(body.siteId) || row.url.match(/\/sites\/([^/?#]+)\/channels(?:\/|$)/)?.[1];
  if (siteId) return `站点编号 ${siteId}`;
  if (strategyRelated && Array.isArray(audit.sites) && !audit.sites.length) return '尚未绑定站点';
  return siteRelated || strategyRelated ? '未记录站点' : '不涉及站点';
}
function legacyStrategyName(row: OperationLogRecord) {
  if (row.url.includes('/strategy-groups') || row.description.includes('策略组'))
    return { group: row.objectName || '', strategy: '' };
  return { group: '', strategy: row.objectName || '' };
}
function strategyLabel({ row, body, audit, strategyRelated }: LogContext) {
  let group = text(audit.strategyGroupName) || text(body.strategyGroupName);
  let strategy = text(audit.strategyName) || text(body.strategyName);
  if (row.source === 'SYSTEM' && !group) group = (row.objectName || '').split(' / ')[1] || '';
  if (strategyRelated && row.source !== 'SYSTEM' && !group && !strategy) {
    ({ group, strategy } = legacyStrategyName(row));
  }
  const rule = text(body.ruleName) || text(audit.ruleName);
  return (
    [group && `策略组“${group}”`, strategy && `策略“${strategy}”`, rule && `规则“${rule}”`]
      .filter(Boolean)
      .join('，') || (strategyRelated ? '未记录策略' : '不涉及策略')
  );
}
function targetLabel({ row, body, audit, siteRelated }: LogContext) {
  const targets = list(audit.targets)
    .map(target => {
      const group =
        text(target.pollingGroupName) || (text(target.pollingGroupCode) && `轮询组 ${text(target.pollingGroupCode)}`);
      const channel = text(target.channelName) || (text(target.channelCode) && `通道 ${text(target.channelCode)}`);
      return [text(target.siteName), group, channel].filter(Boolean).join(' / ');
    })
    .filter(Boolean);
  const named = targets.join('；') || text(audit.targetName) || text(body.targetName);
  if (named) return named;
  const targetData = record(body.target);
  const targetCode = text(targetData.channelCode) || text(targetData.groupCode);
  if (text(record(body.channelNames)[targetCode])) return text(record(body.channelNames)[targetCode]);
  const legacy = (row.objectName || '').split(' / ');
  if (siteRelated && legacy.length > 1) return legacy.at(-1) || '';
  if (row.objectName) return row.objectName;
  return targetCode ? `对象编号 ${targetCode}` : '未记录操作对象';
}
function operationLabel(row: OperationLogRecord, body: Values, audit: Values) {
  const operation =
    descriptionLabels[row.description] || row.description || valueLabels[text(body.action)] || '系统操作';
  if (!operation.includes('通道状态')) return operation;
  const statusChange = list(audit.changes).find(change => change.field === 'status');
  const status = statusChange?.after ?? record(body.desiredState).status ?? body.status;
  if (status === 1 || status === '1' || status === 'ENABLED') return '启用通道';
  if (status === 0 || status === '0' || status === 'DISABLED') return '停用通道';
  return operation;
}
function noChangesLabel(operation: string, audit: Values, status: string) {
  if (/新增|新建|创建/.test(operation)) return '这是新增操作，没有修改前的值。';
  if (/删除|移除/.test(operation)) return '这是删除操作，详情以当时保存的记录为准。';
  if (status === 'SUCCEEDED' && Array.isArray(audit.changes) && !audit.changes.length)
    return '提交的设置与原本相同，没有需要修改的内容。';
  return '当时没有保存修改前后值，无法还原具体改动。';
}
export function presentOperationLog(row: OperationLogRecord) {
  const body = record(row.body);
  const audit = record(body.audit);
  const response = record(row.response);
  const actor = row.source === 'SYSTEM' ? '系统自动' : row.username || '未记录操作账号';
  const siteRelated =
    ['站点管理', '通道管理'].includes(row.moduleName) ||
    row.url.includes('/sites/') ||
    row.url.includes('/system/automatic-adjustment');
  const strategyRelated =
    row.moduleName === '策略中心' ||
    /\/strateg(?:y|ies)/.test(row.url) ||
    row.url.includes('/system/automatic-adjustment');
  const contextData = { row, body, audit, siteRelated, strategyRelated };
  const site = siteLabel(contextData);
  const strategy = strategyLabel(contextData);
  const targetEntries = list(audit.changes).filter(change => change.field === 'targets');
  const targetChanges = targetEntries.length === 1 ? summarizeTargetChanges(targetEntries[0], row.status) : null;
  const target = targetChanges
    ? `原来 ${targetChanges.beforeCount} 个执行对象，本次设置 ${targetChanges.afterCount} 个`
    : targetLabel(contextData);
  const operation = operationLabel(row, body, audit);
  const changes = Array.isArray(audit.changes)
    ? savedChanges(audit, Boolean(targetChanges))
    : stateChanges(body, response);
  const context = [
    site !== '不涉及站点' && `在“${site}”`,
    strategy !== '不涉及策略' && `针对${strategy}`,
    `对“${target}”执行“${operation}”`
  ]
    .filter(Boolean)
    .join('，');
  return {
    actor,
    site,
    strategy,
    target,
    operation,
    changes,
    targetChanges,
    noChanges: targetChanges?.summary || noChangesLabel(operation, audit, row.status),
    sentence: targetChanges
      ? `${actor}针对${strategy}提交了执行对象调整：${targetChanges.summary}。`
      : `${actor}${context}。`,
    ...outcome(row, response)
  };
}
export function requestDetails(value: unknown): string[] {
  return Object.entries(record(value)).map(([field, item]) => `${fieldLabel(field)}：${formatLogValue(field, item)}`);
}
