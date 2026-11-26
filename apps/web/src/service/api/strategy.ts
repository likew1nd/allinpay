import { request } from '../request';
import { DELETE_CONFIRM_TEXT } from './transfer';
import type { DeleteCheck } from './transfer';

export type StrategyStatus = 'DRAFT' | 'RUNNING' | 'PAUSED' | 'ERROR';
export interface StrategyGroupRecord {
  id: string;
  templateId: string | null;
  template: StrategyTemplate | null;
  configuration: StrategyConfiguration | null;
  reserveChannels?: ReserveChannel[] | null;
  targets: { siteId: string; site: { id: string; name: string } }[];
  siteId: string | null;
  name: string;
  description: string | null;
  executionOrder: number;
  status: StrategyStatus;
  currentVersion: number;
  lastRunAt: string | null;
  _count?: { strategies?: number; bindings?: number; targets: number };
  site?: { id: string; name: string } | null;
}
export interface StrategyRecord {
  id: string;
  groupId: string;
  name: string;
  condition: Record<string, unknown>;
  scope: Record<string, unknown>;
  action: Record<string, unknown>;
  schedule: string | null;
  priority: number;
  version: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: StrategyStatus;
  lastTriggeredAt: string | null;
  group: { id: string; name: string; siteId: string | null; status: StrategyStatus };
}
export interface AdjustmentRecord {
  id: string;
  strategyGroupId?: string;
  bindingId?: string;
  ruleName?: string;
  siteId: string;
  strategyId: string | null;
  action: string;
  target: Record<string, unknown>;
  beforeState: Record<string, unknown> | null;
  desiredState: Record<string, unknown> | null;
  actualState: Record<string, unknown> | null;
  status: string;
  failureReason: string | null;
  strategyVersion: number | null;
  targetVersion: string | null;
  expiresAt: string | null;
  createdAt: string;
  completedAt: string | null;
}
export interface StrategyPageParams {
  current: number;
  size: number;
  keyword?: string;
  siteId?: string;
  groupId?: string;
}
export function fetchStrategyGroups(params?: Partial<StrategyPageParams>) {
  return request<Api.Common.PaginatingQueryRecord<StrategyGroupRecord>>({
    url: '/strategy-groups',
    method: 'get',
    params
  });
}
export function createStrategyGroup(data: { name: string; templateId: string; description?: string }) {
  return request<StrategyGroupRecord>({ url: '/strategy-groups', method: 'post', data });
}
export function updateStrategyGroup(
  id: string,
  data: Partial<Pick<StrategyGroupRecord, 'name' | 'description' | 'status'>> & { templateId?: string }
) {
  return request<StrategyGroupRecord>({ url: `/strategy-groups/${encodeURIComponent(id)}`, method: 'patch', data });
}
export interface StrategyGroupBinding {
  id: string;
  groupId: string;
  siteId: string;
  pollingGroupCode: string;
  channelCode: string;
  channelName?: string;
  pollingGroupName?: string;
  controlType: 'MEMBER_WEIGHT' | 'CHANNEL_STATUS' | 'RULE_ACTIONS';
  lastReason: string | null;
  lastEvaluatedAt: string | null;
  lastTriggeredAt: string | null;
  site?: { id: string; name: string };
}
export function fetchStrategyGroupBindings(id: string) {
  return request<StrategyGroupBinding[]>({ url: `/strategy-groups/${encodeURIComponent(id)}/bindings`, method: 'get' });
}
export function addStrategyGroupBinding(
  id: string,
  data: { siteId: string; pollingGroupCode?: string; channelCodes: string[] }
) {
  return request<{ count: number }>({
    url: `/strategy-groups/${encodeURIComponent(id)}/bindings`,
    method: 'post',
    data
  });
}
export function removeStrategyGroupBinding(id: string, bindingId: string) {
  return request<{ id: string }>({
    url: `/strategy-groups/${encodeURIComponent(id)}/bindings/${encodeURIComponent(bindingId)}`,
    method: 'delete'
  });
}
export function fetchStrategies(params?: Partial<StrategyPageParams>) {
  return request<Api.Common.PaginatingQueryRecord<StrategyRecord>>({ url: '/strategies', method: 'get', params });
}
export function simulateStrategy(id: string) {
  return request<Record<string, unknown>>({ url: `/strategies/${encodeURIComponent(id)}/simulate`, method: 'post' });
}
export function fetchStrategyVersions(id: string) {
  return request<
    Array<{
      id: string;
      strategyId: string;
      version: number;
      name: string;
      condition: Record<string, unknown>;
      scope: Record<string, unknown>;
      action: Record<string, unknown>;
      effectiveFrom: string | null;
      effectiveTo: string | null;
      createdAt: string;
    }>
  >({ url: `/strategies/${encodeURIComponent(id)}/versions`, method: 'get' });
}
export function replayStrategyVersion(id: string, version: number) {
  return request<Record<string, unknown>>({
    url: `/strategies/${encodeURIComponent(id)}/versions/${version}/replay`,
    method: 'post'
  });
}
export function fetchAdjustments(params?: Partial<StrategyPageParams>) {
  return request<Api.Common.PaginatingQueryRecord<AdjustmentRecord>>({ url: '/adjustments', method: 'get', params });
}

export interface TemplateCondition {
  metric: 'SUCCESS_RATE' | 'FAILURE_RATE' | 'ORDER_COUNT' | 'CHANNEL_COUNT';
  operator: 'LT' | 'LTE' | 'GT' | 'GTE' | 'EQ';
  value: number;
}
export interface TemplateRule extends TemplateCondition {
  name?: string;
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
}
export interface StrategyConfiguration {
  controlType: 'MEMBER_WEIGHT' | 'CHANNEL_STATUS' | 'RULE_ACTIONS';
  windowMinutes: number;
  minSamples: number;
  cooldownSeconds: number;
  minWeight: number;
  maxWeight: number;
  rules: TemplateRule[];
}
export interface TemplateInput extends StrategyConfiguration {
  name: string;
  description?: string;
}
export interface StrategyTemplate extends TemplateInput {
  id: string;
  version: number;
  _count?: { groups: number };
}
export interface StrategyEvaluation {
  simulation: boolean;
  groupId: string;
  results: {
    bindingId: string;
    siteId: string;
    siteName?: string;
    channelCode: string;
    pollingGroupCode: string;
    matched: boolean;
    executable?: boolean;
    reason: string;
    ruleName?: string;
    metrics?: {
      successRate: number | null;
      failureRate: number | null;
      orderCount: number;
      channelCount?: number | null;
      orderWindowCovered?: boolean;
    };
    beforeState?: Record<string, unknown>;
    desiredState?: Record<string, unknown>;
  }[];
}
export function fetchStrategyTemplates(params?: Partial<StrategyPageParams>) {
  return request<Api.Common.PaginatingQueryRecord<StrategyTemplate>>({
    url: '/strategy-templates',
    method: 'get',
    params
  });
}
export function saveStrategyTemplate(data: TemplateInput, id?: string) {
  return request<StrategyTemplate>({
    url: id ? `/strategy-templates/${encodeURIComponent(id)}` : '/strategy-templates',
    method: id ? 'patch' : 'post',
    data
  });
}
export function deleteStrategyTemplate(id: string) {
  return request<{ id: string }>({ url: `/strategy-templates/${encodeURIComponent(id)}`, method: 'delete' });
}
export function fetchStrategyGroupDeleteCheck(id: string) {
  return request<DeleteCheck>({ url: `/strategy-groups/${encodeURIComponent(id)}/delete-check`, method: 'get' });
}
export function deleteStrategyGroup(id: string) {
  return request<{ id: string }>({
    url: `/strategy-groups/${encodeURIComponent(id)}`,
    method: 'delete',
    data: { confirm: DELETE_CONFIRM_TEXT }
  });
}
export function evaluateStrategyGroup(id: string, simulation = true) {
  return request<StrategyEvaluation>({
    url: `/strategy-groups/${encodeURIComponent(id)}/${simulation ? 'simulate' : 'run'}`,
    method: 'post'
  });
}

export interface WorkspaceTarget {
  siteId: string;
  pollingGroupCode: string;
  channelCode: string;
}
export interface WorkspaceGroupInput {
  name: string;
  description?: string;
  templateId?: string | null;
  expectedVersion?: number;
  configuration: StrategyConfiguration;
  targets: WorkspaceTarget[];
  reserveChannels?: ReserveChannel[];
}
export interface ReserveChannel {
  siteId: string;
  channelCode: string;
  allowReuse: boolean;
}
export interface StrategyCatalogChannel {
  code: string;
  name: string;
  status: string;
  successRate: number | null;
}
export interface StrategyObjectCatalog {
  windowMinutes?: number;
  sites: {
    id: string;
    name: string;
    connectionStatus: string;
    channels: StrategyCatalogChannel[];
    pollingGroups: {
      code: string;
      name: string;
      kind: number;
      status: string;
      published: boolean;
      members: { weight: number; channel: StrategyCatalogChannel }[];
    }[];
  }[];
  owners: (WorkspaceTarget & { controlType: string; groupId: string; group: { name: string } })[];
}
export function fetchStrategyObjectCatalog(windowMinutes = 10) {
  return request<StrategyObjectCatalog>({
    url: '/strategy-workspace/objects',
    method: 'get',
    params: { windowMinutes }
  });
}
export function fetchStrategyGroupConfiguration(id: string) {
  return request<StrategyGroupRecord & { bindings: StrategyGroupBinding[] }>({
    url: `/strategy-groups/${encodeURIComponent(id)}/configuration`,
    method: 'get'
  });
}
export function saveStrategyGroupConfiguration(data: WorkspaceGroupInput, id?: string) {
  return request<StrategyGroupRecord>({
    url: id ? `/strategy-groups/${encodeURIComponent(id)}/configuration` : '/strategy-workspace/groups',
    method: id ? 'put' : 'post',
    data
  });
}
