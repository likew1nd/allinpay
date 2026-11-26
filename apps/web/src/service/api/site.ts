import { request } from '../request';

export interface SiteStructureReport {
  database: string;
  checkedAt: string;
  candidates: string[];
  tables: { name: string; columns?: string[] }[];
  siteVersion?: string;
  validation?: {
    mappingVersion: string;
    tablePrefix?: string;
    candidatePrefixes: string[];
    reason: 'MATCHED' | 'MISSING_TABLES_OR_COLUMNS' | 'AMBIGUOUS_PREFIX' | 'NO_MATCH';
    checks: {
      table: string;
      exists: boolean;
      requiredColumns: string[];
      missingColumns: string[];
    }[];
  };
}

export interface SiteInput {
  name: string;
  baseUrl: string;
  tablePrefix?: string;
  timezone: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
}

export interface SiteRecord extends Omit<SiteInput, 'dbPassword'> {
  id: string;
  hasDbPassword: boolean;
  connectionStatus: 'PENDING' | 'ONLINE' | 'OFFLINE' | 'ERROR';
  structureStatus: 'UNKNOWN' | 'COMPATIBLE' | 'INCOMPATIBLE';
  structureReport?: SiteStructureReport | null;
  adapterVersion?: string | null;
  lastHeartbeatAt?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  automationPaused?: boolean;
}

export interface SiteSearchParams {
  current: number;
  size: number;
  keyword?: string;
  status?: SiteRecord['connectionStatus'];
}

export function fetchSites(params?: Partial<SiteSearchParams>) {
  return request<Api.Common.PaginatingQueryRecord<SiteRecord>>({
    url: '/sites',
    method: 'get',
    params
  });
}

export type SiteDataRecord = SiteRecord & {
  summary:
    | (Pick<
        SiteSummary,
        'channelCount' | 'pollingGroupCount' | 'orderCount' | 'successRate' | 'successAmount' | 'lastSyncAt' | 'stale'
      > & {
        latest: { status: string; error: string | null } | null;
      })
    | null;
};

export function fetchSiteDataList(params: SiteSearchParams) {
  return request<SiteDataPage<SiteDataRecord, SiteListStatistics>>({
    url: '/sites/data',
    method: 'get',
    params
  });
}

export type SiteListStatistics = Record<'total' | 'online' | 'offline' | 'pending' | 'error', number>;
type ChannelOrderSummary = { amount: string; total: number; success: number; unpaid: number };

export type OrderCollectionStatistics = {
  today: ChannelOrderSummary | null;
  cumulative: ChannelOrderSummary;
  successRates: (number | null)[];
};
export type OrderListStatistics = Record<'total' | 'unpaid' | 'paid' | 'refunded' | 'frozen' | 'preauthorized' | 'unknown', number> & {
  collections: OrderCollectionStatistics;
};
type SiteDataPage<Row, Statistics> = Api.Common.PaginatingQueryRecord<Row> & { statistics?: Statistics };

export function createSite(data: SiteInput) {
  return request<SiteRecord>({ url: '/sites', method: 'post', data });
}

export function fetchSite(id: string) {
  return request<SiteRecord>({
    url: `/sites/${encodeURIComponent(id)}`,
    method: 'get'
  });
}

export function updateSite(id: string, data: Partial<SiteInput>) {
  return request<SiteRecord>({
    url: `/sites/${encodeURIComponent(id)}`,
    method: 'patch',
    data
  });
}

export function deleteSite(id: string, password: string) {
  return request<{ id: string }>({
    url: `/sites/${encodeURIComponent(id)}`,
    method: 'delete',
    data: { password }
  });
}

export function updateSiteAutomation(id: string, paused: boolean) {
  return request<SiteRecord>({
    url: `/sites/${encodeURIComponent(id)}/automation`,
    method: 'patch',
    data: { paused }
  });
}

export interface SiteDataParams {
  current: number;
  size: number;
  keyword?: string;
  status?: string;
  sourceStatus?: string;
  channelCode?: string;
  start?: string;
  end?: string;
}

export interface SiteOrderParams extends SiteDataParams {
  siteId?: string;
  orderId?: string;
  merchantId?: string;
  minAmount?: string;
  maxAmount?: string;
}
export interface SiteChannel {
  details?: {
    totalSuccessAmount?: string;
    totalSuccessCount?: number;
    paymentTypeCode?: string;
    pluginTitle?: string;
    availableInterfaces?: string[];
    mode?: number;
    rate?: string;
    costRate?: string;
    dailyLimit?: string;
    dailyOrderLimit?: number;
    minAmount?: string;
    maxAmount?: string;
  } | null;
  strategyGroups: { id: string; name: string; status: string }[];
  orderMetrics?: {
    today: { amount: string; count: number } | null;
    successRates: (number | null)[];
  } | null;
  id: string;
  siteId: string;
  siteName?: string;
  siteBaseUrl?: string;
  code: string;
  name: string;
  channelType: string;
  paymentTypeId: string;
  plugin: string;
  status: 'ENABLED' | 'DISABLED' | 'UNKNOWN';
  sourceStatus: number;
  dayStatus: number;
  updatedAt: string;
  pollingMembers: {
    weight: number;
    pollingGroup: { code: string; name: string; kind: number };
  }[];
}
export interface SitePollingGroup {
  id: string;
  code: string;
  name: string;
  paymentTypeName: string;
  kind: number;
  position: number;
  status: SiteChannel['status'];
  updatedAt: string;
  members: {
    weight: number;
    position: number;
    enabled: boolean;
    channel: SiteChannel;
  }[];
}
export interface SiteOrder {
  id: string;
  siteId: string;
  siteName: string;
  siteBaseUrl: string;
  externalId: string;
  merchantId: string;
  channelCode: string;
  subchannelCode: string;
  paymentTypeName: string;
  amount: string;
  realAmount: string | null;
  sourceStatus: string;
  status: 'SUCCESS' | 'FAILED' | 'PROCESSING' | 'EXCLUDED';
  occurredAt: string;
  paidAt: string | null;
}
export interface SiteSyncRun {
  id: string;
  status: string;
  windowStart: string;
  windowEnd: string;
  orderCount: number;
  expectedCount: number;
  mappingVersion: string;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}
export interface SiteSummary {
  channelCount: number;
  pollingGroupCount: number;
  orderCount: number;
  successCount: number;
  failedCount: number;
  processingCount: number;
  excludedCount: number;
  successRate: number | null;
  failureRate: number | null;
  successAmount: string;
  windowStart: string | null;
  windowEnd: string | null;
  mappingVersion: string;
  lastSyncAt: string | null;
  stale: boolean;
  latest: Pick<SiteSyncRun, 'id' | 'status' | 'error' | 'createdAt' | 'completedAt'> | null;
  timezone: string;
}
export function fetchSiteSummary(id: string) {
  return request<SiteSummary>({
    url: `/sites/${encodeURIComponent(id)}/summary`,
    method: 'get'
  });
}
export function fetchSiteChannels(id: string, params: SiteDataParams) {
  return request<SiteDataPage<SiteChannel, OrderCollectionStatistics>>({
    url: `/sites/${encodeURIComponent(id)}/channels`,
    method: 'get',
    params
  });
}
export function fetchAllSiteChannels(params: SiteDataParams) {
  return request<SiteDataPage<SiteChannel, OrderCollectionStatistics>>({ url: '/sites/channels', method: 'get', params });
}
export interface ChannelEdit {
  paymentTypeId: number;
  plugin: string;
  resetConfiguration?: boolean;
  catalog: {
    types: { id: number; code: string; label: string; enabled: boolean }[];
    plugins: { name: string; title: string; paymentTypes: string[] }[];
  };
  revision: string;
  name: string;
  mode: number;
  rate: string;
  costRate: string;
  dailyLimit: number;
  dailyOrderLimit: number;
  minAmount: string;
  maxAmount: string;
}
export interface ChannelAdvanced {
  revision: string;
  dailyLimit: number;
  dailyOrderLimit: number;
  rateLimitSeconds: number;
  rateLimitCount: number;
  minAmount: string;
  maxAmount: string;
  startHour: string;
  endHour: string;
  feeThreshold: string;
  minFee: string;
  orderName: string;
  orderNameRules: { name: string; min: string; max: string }[];
}
export function fetchChannelAdvanced(siteId: string, code: string) {
  return request<ChannelAdvanced>({ url: `${channelUrl(siteId, code)}/advanced`, method: 'get' });
}
export function updateChannelAdvanced(siteId: string, code: string, data: ChannelAdvanced) {
  return request({ url: `${channelUrl(siteId, code)}/advanced`, method: 'patch', data, timeout: 30000 });
}
export interface ChannelConfiguration {
  plugin: string;
  schema: 'alipay' | 'generic';
  apptype: string[];
  interfaces: { value: string; label: string }[];
  revision: string;
  fields: {
    key: string;
    configured: boolean;
    kind: 'text' | 'number' | 'boolean' | 'array' | 'object';
    value?: string;
    label?: string;
    input?: string;
    secret?: boolean;
    required?: boolean;
    signature?: string;
    placeholder?: string;
    options?: { value: string; label: string }[];
  }[];
}
function channelUrl(siteId: string, code: string) {
  return `/sites/${encodeURIComponent(siteId)}/channels/${encodeURIComponent(code)}`;
}
export function fetchChannelEdit(siteId: string, code: string) {
  return request<ChannelEdit>({ url: channelUrl(siteId, code), method: 'get' });
}
export function fetchChannelConfiguration(siteId: string, code: string) {
  return request<ChannelConfiguration>({
    url: `${channelUrl(siteId, code)}/configuration`,
    method: 'get'
  });
}
export function updateChannel(siteId: string, code: string, data: ChannelEdit) {
  const { catalog: _catalog, ...payload } = data;
  return request({ url: channelUrl(siteId, code), method: 'patch', data: payload, timeout: 30000 });
}
export function updateChannelStatus(siteId: string, code: string, data: { status: number; expectedStatus: number }) {
  return request<Pick<SiteChannel, 'sourceStatus' | 'dayStatus' | 'status'>>({
    url: `${channelUrl(siteId, code)}/status`,
    method: 'patch',
    timeout: 30000,
    data
  });
}
export function updateChannelConfiguration(
  siteId: string,
  code: string,
  data: { revision: string; changes: Record<string, unknown>; apptype?: string[] }
) {
  return request({
    url: `${channelUrl(siteId, code)}/configuration`,
    method: 'patch',
    timeout: 30000,
    data
  });
}
export function deleteChannel(siteId: string, code: string, data: { revision: string; password: string }) {
  return request({
    url: channelUrl(siteId, code),
    method: 'delete',
    timeout: 30000,
    data
  });
}
export function fetchSitePollingGroups(id: string, params: SiteDataParams) {
  return request<SiteDataPage<SitePollingGroup, OrderCollectionStatistics>>({
    url: `/sites/${encodeURIComponent(id)}/polling-groups`,
    method: 'get',
    params
  });
}
export function fetchSiteOrders(id: string, params: SiteOrderParams) {
  return request<SiteDataPage<SiteOrder, OrderListStatistics>>({
    url: `/sites/${encodeURIComponent(id)}/orders`,
    method: 'get',
    params
  });
}
export function fetchAllSiteOrders(params: SiteOrderParams) {
  return request<SiteDataPage<SiteOrder, OrderListStatistics>>({ url: '/sites/orders', method: 'get', params });
}
export function fetchAllSiteOrderStatistics() {
  return request<OrderListStatistics>({ url: '/sites/orders/statistics', method: 'get' });
}
export function fetchSiteSyncHistory(id: string, params: SiteDataParams) {
  return request<Api.Common.PaginatingQueryRecord<SiteSyncRun>>({
    url: `/sites/${encodeURIComponent(id)}/sync-history`,
    method: 'get',
    params
  });
}
