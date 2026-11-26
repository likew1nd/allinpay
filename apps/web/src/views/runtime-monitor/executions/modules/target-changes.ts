type Values = Record<string, unknown>;
interface TargetSnapshot {
  siteId: string;
  siteName: string;
  pollingGroupCode: string;
  pollingGroupName: string;
  channelCode: string;
  channelName: string;
}
interface TargetSet {
  targets: TargetSnapshot[];
  identity: 'id' | 'name';
}
export interface TargetChangeDetail {
  action: '新增' | '移除';
  site: string;
  group: string;
  channel: string;
  sentence: string;
}
export interface TargetChanges {
  summary: string;
  beforeCount: number;
  afterCount: number;
  unchangedCount: number;
  details: TargetChangeDetail[];
}

function record(value: unknown): Values {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Values) : {};
}
function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}
function targetKey(target: TargetSnapshot) {
  return JSON.stringify([target.siteId, target.pollingGroupCode, target.channelCode]);
}
function structuredTarget(value: unknown): TargetSnapshot | null {
  const item = record(value);
  if (typeof item.pollingGroupCode !== 'string' && typeof item.pollingGroupCode !== 'number') return null;
  const siteId = text(item.siteId);
  const channelCode = text(item.channelCode);
  const pollingGroupCode = text(item.pollingGroupCode);
  if (!siteId || !/^\d{1,20}$/.test(channelCode) || !/^(|\d{1,20})$/.test(pollingGroupCode)) return null;
  return {
    siteId,
    siteName: text(item.siteName),
    pollingGroupCode,
    pollingGroupName: text(item.pollingGroupName),
    channelCode,
    channelName: text(item.channelName)
  };
}
function legacyTarget(value: string): TargetSnapshot | null {
  const parts = value.split(' / ');
  if (parts.length !== 2 && parts.length !== 3) return null;
  const siteName = parts[0].trim();
  if (!siteName || /[/；;（）]/u.test(siteName)) return null;
  const channel = /^([^/；;（）]+)（通道 (\d{1,20})）$/u.exec(parts.at(-1)?.trim() || '');
  const group = parts.length === 3 ? /^([^/；;（）]+)（轮询组 (\d{1,20})）$/u.exec(parts[1].trim()) : null;
  if (!channel || (parts.length === 3 && !group)) return null;
  return {
    siteId: siteName,
    siteName,
    pollingGroupCode: group?.[2] || '',
    pollingGroupName: group?.[1].trim() || '',
    channelCode: channel[2],
    channelName: channel[1].trim()
  };
}
function targetSet(value: unknown): TargetSet | null {
  if (Array.isArray(value)) {
    const targets = value.map(structuredTarget);
    if (targets.includes(null)) return null;
    return { targets: targets as TargetSnapshot[], identity: 'id' };
  }
  if (typeof value !== 'string') return null;
  if (value.trim() === '无') return { targets: [], identity: 'name' };
  if (!value.trim() || value.includes('…')) return null;
  // 旧记录没有站点ID，只解析完整的既有显示格式；分隔符混入名称时保留原记录。
  const targets = value.split('；').map(item => legacyTarget(item.trim()));
  if (targets.includes(null)) return null;
  return { targets: targets as TargetSnapshot[], identity: 'name' };
}
function completeSet(value: unknown, expectedCount: unknown) {
  const parsed = targetSet(value);
  if (!parsed) return null;
  if (expectedCount !== undefined && (!Number.isInteger(expectedCount) || expectedCount !== parsed.targets.length))
    return null;
  if (new Set(parsed.targets.map(targetKey)).size !== parsed.targets.length) return null;
  return parsed;
}
function comparable(before: TargetSet, after: TargetSet) {
  if (!before.targets.length || !after.targets.length) return true;
  if (before.identity !== after.identity) return false;
  if (before.identity === 'id') return true;
  const oldSites = new Set(before.targets.map(target => target.siteId));
  const newSites = new Set(after.targets.map(target => target.siteId));
  const removedSite = [...oldSites].some(site => !newSites.has(site));
  const addedSite = [...newSites].some(site => !oldSites.has(site));
  // 旧字符串缺站点ID，不能将站点改名臆断为先移除再新增。
  return !(removedSite && addedSite);
}
function submissionSummary(summary: string, status: string) {
  if (status === 'SUCCEEDED') return summary;
  if (status === 'PENDING') return `计划${summary}（等待执行）`;
  const endings: Record<string, string> = {
    FAILED: '未确认生效',
    SKIPPED: '已跳过，未执行',
    EXPIRED: '已过期，未执行',
    UNKNOWN: '执行结果未知'
  };
  return `本次提交计划${summary}（${endings[status] || '执行结果未记录'}）`;
}
function differenceSummary(added: number, removed: number, unchanged: number) {
  const parts: string[] = [];
  if (added) parts.push(`新增 ${added} 个执行对象`);
  if (removed) parts.push(`移除 ${removed} 个策略执行对象`);
  if (!parts.length) parts.push('执行对象没有增减');
  if (unchanged) parts.push(`原有 ${unchanged} 个保持不变`);
  return parts.join('，');
}
function detail(target: TargetSnapshot, action: TargetChangeDetail['action'], status: string): TargetChangeDetail {
  const site = target.siteName || `站点编号 ${target.siteId}`;
  const groupName = target.pollingGroupName || target.pollingGroupCode;
  const channelName = target.channelName || target.channelCode;
  const group = target.pollingGroupCode ? `${groupName}（编号 ${target.pollingGroupCode}）` : '未指定轮询组';
  const channel = `${channelName}（编号 ${target.channelCode}）`;
  const scope = target.pollingGroupCode ? `的轮询组“${groupName}”（编号 ${target.pollingGroupCode}）中` : '中';
  const channelText = `通道“${channelName}”（编号 ${target.channelCode}）`;
  const operation = action === '新增' ? `新增${channelText}作为策略执行对象` : `将${channelText}从策略执行对象中移除`;
  const prefix = status === 'SUCCEEDED' ? '' : '本次提交计划';
  return { action, site, group, channel, sentence: `${prefix}在站点“${site}”${scope}，${operation}。` };
}

export function summarizeTargetChanges(value: unknown, status: string): TargetChanges | null {
  const change = record(value);
  const hasSnapshots = Object.hasOwn(change, 'beforeTargets') || Object.hasOwn(change, 'afterTargets');
  const before = completeSet(hasSnapshots ? change.beforeTargets : change.before, change.beforeTargetCount);
  const after = completeSet(hasSnapshots ? change.afterTargets : change.after, change.afterTargetCount);
  if (!before || !after || !comparable(before, after)) return null;
  const previous = new Map(before.targets.map(target => [targetKey(target), target]));
  const current = new Map(after.targets.map(target => [targetKey(target), target]));
  const added = after.targets.filter(target => !previous.has(targetKey(target)));
  const removed = before.targets.filter(target => !current.has(targetKey(target)));
  const unchangedCount = before.targets.length - removed.length;
  return {
    summary: submissionSummary(differenceSummary(added.length, removed.length, unchangedCount), status),
    beforeCount: before.targets.length,
    afterCount: after.targets.length,
    unchangedCount,
    details: [
      ...added.map(target => detail(target, '新增', status)),
      ...removed.map(target => detail(target, '移除', status))
    ]
  };
}
