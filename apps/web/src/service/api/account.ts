import { request } from '../request';

export type CollectorStatus = 'ONLINE' | 'OFFLINE' | 'ERROR';
export type CaptchaProvider = 'NONE' | 'TTSHITU' | 'BINGTOP';
export interface ScriptSettings {
  loginCooldownMinutes: number;
  loginMaxAttempts: number;
  loginTimeoutMinutes: number;
  /** 环境同步间隔（分钟），默认 30。 */
  environmentSyncMinutes: number;
  /** 余额新鲜阈值（分钟），默认 10；转账只使用此时间内采集到的余额。 */
  balanceFreshMinutes: number;
  /** 扫码确认等待时间（分钟），默认 8；超时本笔转账按失败结束。 */
  qrWaitMinutes: number;
  /** 滑块识别坐标的固定补偿像素，默认 10。 */
  sliderOffsetPx: number;
  captchaProvider: CaptchaProvider;
  ttshituUsername: string;
  hasTtshituPassword: boolean;
  bingtopUsername: string;
  hasBingtopPassword: boolean;
  enabled: boolean;
  tab1Url: string;
  tab2Url: string;
  tab3Url: string;
  minRefreshSeconds: number;
  maxRefreshSeconds: number;
  navigationTimeoutSeconds: number;
  maxConcurrentAccounts: number;
  retryCount: number;
  actionTimeoutSeconds: number;
  updatedAt?: string | null;
}
export type UpdateScriptSettings = Omit<ScriptSettings, 'updatedAt' | 'hasTtshituPassword' | 'hasBingtopPassword'> & {
  ttshituPassword?: string;
  bingtopPassword?: string;
};
export type AccountStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'AUTH_EXPIRED'
  | 'PASSWORD_REJECTED'
  | 'CAPTCHA_REQUIRED'
  | 'ENV_UNAVAILABLE'
  | 'UNKNOWN';

export type AccountBusinessStatus = 'NORMAL' | 'RESTRICTED' | 'JUDICIAL' | 'UNKNOWN';
export interface CollectorMoney {
  available: string | null;
  unavailable: string | null;
  pending: string | null;
  partial?: boolean;
  unreportedEnvironmentCount?: number;
}
export interface CollectorInput {
  name: string;
  customId?: string;
  customToken?: string;
}
export interface CollectorCreateResult extends CollectorRecord {
  token?: string; // 仅创建时返回一次
}
export interface CollectorRecord {
  environmentCount?: number;
  linkedEnvironmentCount?: number;
  adsPowerStatus: 'UNKNOWN' | 'AVAILABLE' | 'UNAVAILABLE';
  environmentSyncedAt: string | null;
  environmentSyncError: string | null;
  monitoringEnabled: boolean;
  configRevision: number;
  appliedRevision: number;
  commands?: { id: string; kind: string; status: string; error: string | null }[];
  accountSummary?: Record<AccountBusinessStatus, number>;
  balances?: CollectorMoney[];
  id: string;
  name: string;
  status: CollectorStatus;
  version: string | null;
  lastHeartbeatAt: string | null;
  lastError: string | null;
  _count?: { accounts: number };
}
export interface AccountBalance {
  balance: string | null;
  balanceAt: string | null;
}
export type AccountRuntimeState = 'RUNNING' | 'ERROR' | 'PENDING_LOGIN' | 'IDLE';
export interface AccountLinkedSite {
  id: string;
  name: string;
  channels: { code: string; name: string; appId: string }[];
}
export interface AccountRecord extends AccountBalance {
  loginAccount: string;
  transferListed: boolean; transferEnabled: boolean; transferRuleId: string | null;
  linkedSites: AccountLinkedSite[];
  profileNo: string | null;
  groupName: string | null;
  businessStatus: AccountBusinessStatus;
  receiptLimit: string | null;
  paymentLimit: string | null;
  unavailableBalance: string | null;
  pendingBalance: string | null;
  /** 限制截图/司法截图的采集时间；为空表示当前没有截图。图片本身用 fetchAccountEvidence 按需读取。 */
  restrictionImageAt: string | null;
  judicialImageAt: string | null;
  /** 巡检得到的限制标记，两项可同时为真；都为假时按 businessStatus 显示 */
  restrictionActive: boolean;
  judicialActive: boolean;
  /** 页面上额度显示为“不限额”；此时对应数值无意义 */
  receiptUnlimited: boolean;
  paymentUnlimited: boolean;
  id: string;
  collectorId: string | null;
  externalId: string;
  name: string | null;
  status: AccountStatus;
  runtimeState?: AccountRuntimeState;
  monitoringEnabled: boolean;
  browserState: string | null;
  lastSeenAt: string | null;
  lastError: string | null;
  collector: { id: string; name: string; status: CollectorStatus; lastHeartbeatAt: string | null } | null;
  bindings: { id: string; site: { id: string; name: string } }[];
}
export interface AccountBindingRecord {
  id: string;
  accountId: string;
  siteId: string;
  channelCode: string;
  enabled: boolean;
  account: { id: string; externalId: string; name: string | null; status: AccountStatus };
  site: { id: string; name: string };
}
export interface AccountPageParams {
  current: number;
  size: number;
  keyword?: string;
  status?: AccountStatus;
  collectorId?: string;
}

export function fetchCollectors(params?: {
  current?: number;
  size?: number;
  keyword?: string;
  status?: CollectorStatus;
}) {
  return request<Api.Common.PaginatingQueryRecord<CollectorRecord>>({ url: '/collectors', method: 'get', params });
}
export interface CollectorStatistics {
  collectors: { total: number; online: number; offline: number; error: number };
  environments: {
    total: number; linked: number; monitoring: number; running: number;
    abnormal: number; restricted: number; judicial: number; unknown: number;
  };
  balances: {
    available: string | null; unavailable: string | null; pending: string | null;
    unreportedEnvironmentCount: number;
  };
}
export function fetchAccountStatistics() {
  return request<CollectorStatistics>({ url: '/accounts/statistics', method: 'get' });
}
export function fetchCollectorStatistics(collectorId?: string) {
  return request<CollectorStatistics>({ url: '/collectors/statistics', method: 'get', params: { collectorId } });
}
export function createCollector(data: CollectorInput) {
  return request<CollectorCreateResult>({ url: '/collectors', method: 'post', data });
}
export function updateCollector(id: string, data: CollectorInput) {
  return request<CollectorRecord>({ url: `/collectors/${encodeURIComponent(id)}`, method: 'patch', data });
}
export function batchNotifyScriptUpdate(ids: string[]) {
  return request<{ notified: number }>({ url: '/script-bundle/notify-update', method: 'post', data: { ids } });
}
export function fetchCollector(id: string) {
  return request<CollectorRecord>({ url: `/collectors/${encodeURIComponent(id)}`, method: 'get' });
}
export function syncCollector(id: string) {
  return request<{ id: string; commandId: string; status: string }>({ url: `/collectors/${encodeURIComponent(id)}/sync`, method: 'post' });
}
/** 切换采集端监控开关，关闭后该采集端不再执行巡检任务 */
export function updateCollectorMonitoring(id: string, monitoringEnabled: boolean) {
  return request<CollectorRecord>({ url: `/collectors/${encodeURIComponent(id)}/monitoring`, method: 'patch', data: { monitoringEnabled } });
}
export function fetchCollectorToken(id: string) {
  return request<{ token: string }>({ url: `/collectors/${encodeURIComponent(id)}/token`, method: 'get' });
}
export function resetCollectorToken(id: string) {
  return request<CollectorRecord & { token: string }>({ url: `/collectors/${encodeURIComponent(id)}/reset-token`, method: 'post' });
}
export function fetchCollectorAccounts(id: string, params: Partial<AccountPageParams>) {
  return request<Api.Common.PaginatingQueryRecord<AccountRecord>>({
    url: `/collectors/${encodeURIComponent(id)}/accounts`,
    method: 'get',
    params
  });
}
export function deleteCollector(id: string) {
  return request<{ id: string }>({ url: `/collectors/${encodeURIComponent(id)}`, method: 'delete' });
}
export function fetchAccounts(params?: Partial<AccountPageParams>) {
  return request<Api.Common.PaginatingQueryRecord<AccountRecord>>({ url: '/accounts', method: 'get', params });
}
export function fetchAccountBindings(params?: Partial<AccountPageParams>) {
  return request<Api.Common.PaginatingQueryRecord<AccountBindingRecord>>({
    url: '/account-bindings',
    method: 'get',
    params
  });
}
export function createAccountBinding(data: { accountId: string; siteId: string; channelCode: string }) {
  return request<AccountBindingRecord>({ url: '/account-bindings', method: 'post', data });
}
export function updateAccountBinding(id: string, data: { enabled: boolean }) {
  return request<AccountBindingRecord>({ url: `/account-bindings/${encodeURIComponent(id)}`, method: 'patch', data });
}
export function deleteAccountBinding(id: string) {
  return request<{ id: string }>({ url: `/account-bindings/${encodeURIComponent(id)}`, method: 'delete' });
}

export function fetchScriptSettings() {
  return request<ScriptSettings>({ url: '/script-settings', method: 'get' });
}

export function updateScriptSettings(data: UpdateScriptSettings) {
  return request<ScriptSettings>({ url: '/script-settings', method: 'patch', data });
}

export interface ScriptBundleVersion {
  version: string;
  bundleHash: string;
  releasedAt: string;
}

/** 查询当前发布的脚本包版本 */
export function fetchScriptBundleVersion() {
  return request<ScriptBundleVersion>({ url: '/script-bundle/version', method: 'get' });
}

/** 显式向全部采集端下发脚本更新命令，离线端上线后领取。 */
export function notifyScriptUpdate() {
  return request<{ notified: number }>({ url: '/script-bundle/notify-update', method: 'post', data: { all: true } });
}

export type AccountMode = 'OFF' | 'MONITOR' | 'TRANSFER';

export function updateAccountMode(id: string, mode: AccountMode) {
  return request<Pick<AccountRecord, 'id' | 'monitoringEnabled' | 'transferListed' | 'transferEnabled' | 'transferRuleId'>>({
    url: '/accounts/' + encodeURIComponent(id) + '/mode',
    method: 'patch',
    data: { mode }
  });
}

export function updateAccountMonitoring(id: string, monitoringEnabled: boolean) {
  return request<{ id: string; monitoringEnabled: boolean }>({
    url: `/accounts/${encodeURIComponent(id)}/monitoring`,
    method: 'patch',
    data: { monitoringEnabled }
  });
}

export function batchUpdateAccountMonitoring(ids: string[], monitoringEnabled: boolean) {
  return request<{ updated: number; monitoringEnabled: boolean }>({
    url: '/accounts/batch-monitoring',
    method: 'post',
    data: { ids, monitoringEnabled }
  });
}

export function batchRefreshAccountAppIds(collectorId: string, ids: string[]) {
  return request<{ queued: number }>({
    url: `/collectors/${encodeURIComponent(collectorId)}/accounts/app-ids/refresh`,
    method: 'post',
    data: { ids }
  });
}

export interface MonitoringLogEntry {
  at: string;
  message: string;
  url?: string;
}

export function fetchAccountMonitoringLogs(collectorId: string, accountId: string) {
  return request<{ records: MonitoringLogEntry[] }>({
    url: `/collectors/${encodeURIComponent(collectorId)}/accounts/${encodeURIComponent(accountId)}/monitoring-logs`,
    method: 'get'
  });
}

export type AccountEvidenceKind = 'restriction' | 'judicial';
/** 读取单张限制/司法截图（JPEG data URL），列表接口不带图片。 */
export function fetchAccountEvidence(collectorId: string, accountId: string, kind: AccountEvidenceKind) {
  return request<{ image: string | null; capturedAt: string | null }>({
    url: `/collectors/${encodeURIComponent(collectorId)}/accounts/${encodeURIComponent(accountId)}/evidence/${kind}`,
    method: 'get'
  });
}

export interface AccountCredentials {
  loginAccount: string;
  appId: string;
  appIds: string[];
  hasPassword: boolean;
  hasPaymentPassword: boolean;
}
export interface AccountCredentialsInput {
  loginAccount: string;
  appId: string;
  appIds: string[];
  password?: string;
  paymentPassword?: string;
}

export function fetchAccountCredentials(collectorId: string, accountId: string) {
  return request<AccountCredentials>({
    url: `/collectors/${encodeURIComponent(collectorId)}/accounts/${encodeURIComponent(accountId)}/credentials`,
    method: 'get'
  });
}

export function updateAccountCredentials(collectorId: string, accountId: string, data: AccountCredentialsInput) {
  return request<{ id: string }>({
    url: `/collectors/${encodeURIComponent(collectorId)}/accounts/${encodeURIComponent(accountId)}/credentials`,
    method: 'patch',
    data
  });
}
