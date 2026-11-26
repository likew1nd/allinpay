import { request } from '../request';
import type { AccountRecord } from './account';
export type TransferStatus = 'READY' | 'PREPARING' | 'CLAIMED' | 'NEEDS_MANUAL' | 'UNKNOWN' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export function isExecutingTransfer(status: string) {
  return status === 'PREPARING' || status === 'CLAIMED';
}
export interface Payee {
  id: string;
  name: string;
  accountMasked: string;
  /** 完整收款账号，收款列表直接显示；其他页面仍使用 accountMasked */
  account: string;
  status: 'ACTIVE' | 'DISABLED';
  dailyLimit: string | null;
  totalLimit: string | null;
  receivedToday: string;
  receivedTotal: string;
}
export type {
  TransferAllocation,
  TransferCondition,
  TransferStrategyRule
} from '../../../../../contracts/transfer-strategy';
import type { TransferAllocation, TransferStrategyRule } from '../../../../../contracts/transfer-strategy';
export interface TransferRuleInput {
  description?: string;
  rules?: TransferStrategyRule[] | null;
  name: string;
  triggerBalance: string;
  reserveAmount: string;
  feeBuffer: string;
  minAmount: string;
  maxAmount: string;
  dailyLimit: string | null;
  allocations: TransferAllocation[];
  enabled: boolean;
  isTemplate: boolean;
}
export interface TransferRule extends TransferRuleInput {
  id: string;
  version: number;
}
export interface AutomaticTransferAccount extends AccountRecord {
  transferRule: Pick<TransferRule, 'id' | 'name' | 'enabled'> | null;
  transferStatus: string;
  totalIncome: string | null;
  totalTransferred: string;
}
export interface TransferRequest {
  id: string;
  outBizNo: string;
  batchId: string | null;
  accountId: string | null;
  fundAccountId: string | null;
  amount: string;
  status: TransferStatus;
  /** AUTO 为策略触发；TEST 为手动转账测试 */
  mode: 'AUTO' | 'TEST';
  balanceSnapshot: string;
  balanceAt: string;
  resultNote: string | null;
  /** 采集端最近一次进度上报，超过 30 秒没有更新说明脚本可能卡死 */
  progressAt: string | null;
  progressNote: string | null;
  testRemark: string | null;
  /** 终态截图的采集时间；为空表示没有截图。图片本体不在列表里，需按需读取 */
  screenshotAt: string | null;
  createdAt: string;
  claimedAt: string | null;
  completedAt: string | null;
  account: { id: string; name: string | null; externalId: string } | null;
  fundAccount: { id: string; name: string } | null;
  payee: Pick<Payee, 'id' | 'name' | 'accountMasked'>;
  /** 测试单没有策略 */
  rule: { id: string; name: string } | null;
}
export interface TransferPageParams {
  current: number;
  size: number;
  status?: string;
  fundAccountId?: string;
  accountId?: string;
}
export const fetchPayees = (params: TransferPageParams) =>
  request<Api.Common.PaginatingQueryRecord<Payee>>({
    url: '/payees',
    method: 'get',
    params
  });
export const createPayee = (data: {
  name: string;
  account: string;
  dailyLimit?: string | null;
  totalLimit?: string | null;
}) => request<Payee>({ url: '/payees', method: 'post', data });
export const setPayeeStatus = (id: string, status: Payee['status']) =>
  request<Payee>({
    url: '/payees/' + encodeURIComponent(id) + '/status',
    method: 'patch',
    data: { status }
  });
/** 删除前检查的统一返回：收款账号、转账策略、站点策略共用。blockers 非空即不能删，需先处理占用方 */
export interface DeleteBlockerItem {
  id: string;
  label: string;
  hint?: string;
}
export interface DeleteBlocker {
  kind: string;
  title: string;
  items: DeleteBlockerItem[];
}
export interface DeleteCheck {
  name: string;
  canDelete: boolean;
  blockers: DeleteBlocker[];
  /** 没有占用时，删除会自动处理的事项，弹窗里提前告知 */
  willAutoHandle: string[];
}
/** 删除接口必须带 confirm: '删除'，和弹窗里要求手动输入的两个字一致 */
export const DELETE_CONFIRM_TEXT = '删除';
export const fetchPayeeDeleteCheck = (id: string) =>
  request<DeleteCheck>({ url: '/payees/' + encodeURIComponent(id) + '/delete-check', method: 'get' });
export const deletePayee = (id: string) =>
  request<{ id: string }>({
    url: '/payees/' + encodeURIComponent(id),
    method: 'delete',
    data: { confirm: DELETE_CONFIRM_TEXT }
  });
export const fetchTransferRuleDeleteCheck = (id: string) =>
  request<DeleteCheck>({ url: '/transfer-rules/' + encodeURIComponent(id) + '/delete-check', method: 'get' });
export const deleteTransferRule = (id: string) =>
  request<{ id: string }>({
    url: '/transfer-rules/' + encodeURIComponent(id),
    method: 'delete',
    data: { confirm: DELETE_CONFIRM_TEXT }
  });
export const updatePayeeLimits = (id: string, data: Pick<Payee, 'dailyLimit' | 'totalLimit'>) =>
  request<Payee>({
    url: '/payees/' + encodeURIComponent(id) + '/limits',
    method: 'patch',
    data
  });
export const createTransferDraft = (data: { name: string; description: string; isTemplate?: boolean }) =>
  request<TransferRule>({ url: '/transfer-rules/drafts', method: 'post', data });
export const fetchTransferRules = (params: TransferPageParams) =>
  request<Api.Common.PaginatingQueryRecord<TransferRule>>({
    url: '/transfer-rules',
    method: 'get',
    params
  });
/** 只切换策略的启用状态，不动策略内容；停用会撤销未领取的转账单 */
export const setTransferRuleFlags = (id: string, data: { enabled: boolean }) =>
  request<TransferRule>({
    url: '/transfer-rules/' + encodeURIComponent(id) + '/flags',
    method: 'patch',
    data
  });
export const renameTransferTemplate = (id: string, name: string) =>
  request<{ id: string; name: string }>({
    url: '/transfer-rules/' + encodeURIComponent(id) + '/template-name',
    method: 'patch',
    data: { name }
  });
export const createTransferRule = (data: TransferRuleInput) =>
  request<TransferRule>({ url: '/transfer-rules', method: 'post', data });
export const updateTransferRule = (id: string, data: TransferRuleInput) =>
  request<TransferRule>({
    url: '/transfer-rules/' + encodeURIComponent(id),
    method: 'patch',
    data
  });
export const fetchAutomaticTransfers = (params: { current: number; size: number; keyword?: string }) =>
  request<Api.Common.PaginatingQueryRecord<AutomaticTransferAccount>>({
    url: '/automatic-transfers',
    method: 'get',
    params
  });
export const setEnvironmentTransfer = (id: string, data: { listed?: boolean; enabled?: boolean; ruleId?: string | null }) =>
  request<Pick<AccountRecord, 'id' | 'transferListed' | 'transferEnabled' | 'transferRuleId'>>({
    url: '/accounts/' + encodeURIComponent(id) + '/automatic-transfer',
    method: 'patch',
    data
  });
export const fetchTransferRequests = (params: TransferPageParams) =>
  request<Api.Common.PaginatingQueryRecord<TransferRequest>>({
    url: '/transfer-requests',
    method: 'get',
    params
  });
/** 手动转账测试：收款账号手填（payeeAccount）或选收款池账号（payeeId，由后端解密）二选一；会真实付款；不填姓名（企业账号页面显示“****司”，无法核对） */
export const createTransferTest = (
  accountId: string,
  data: { amount: string; payeeAccount?: string; payeeId?: string; remark?: string }
) =>
  request<{ id: string; outBizNo: string; status: TransferStatus }>({
    url: '/accounts/' + encodeURIComponent(accountId) + '/transfer-test',
    method: 'post',
    data
  });
export interface TransferProgressLog {
  at: string;
  message: string;
}
export const fetchTransferProgressLogs = (id: string) =>
  request<{ status: TransferStatus; resultNote: string | null; progressAt: string | null; progressNote: string | null; records: TransferProgressLog[] }>({
    url: '/transfer-requests/' + encodeURIComponent(id) + '/progress-logs',
    method: 'get'
  });
/** 读取单张转账终态截图（JPEG data URL）；列表接口不带图片，按需请求 */
export const fetchTransferScreenshot = (id: string) =>
  request<{ image: string | null; result: string | null; capturedAt: string | null }>({
    url: '/transfer-requests/' + encodeURIComponent(id) + '/screenshot',
    method: 'get'
  });
export const cancelTransfer = (id: string) =>
  request<TransferRequest>({
    url: '/transfer-requests/' + encodeURIComponent(id) + '/cancel',
    method: 'post'
  });
export const resolveTransfer = (id: string, data: { status: 'SUCCEEDED' | 'FAILED'; note: string }) =>
  request<TransferRequest>({
    url: '/transfer-requests/' + encodeURIComponent(id) + '/resolve',
    method: 'post',
    data
  });
/** 强制结束执行中的转账单：未点“下一步”判失败并释放环境，已点则转结果未知 */
export const forceStopTransfer = (id: string) =>
  request<TransferRequest>({
    url: '/transfer-requests/' + encodeURIComponent(id) + '/force-stop',
    method: 'post'
  });
// 选择器读取全部分页，避免第 101 条以后无法选择。
export async function fetchAllTransferRules() {
  const rows: TransferRule[] = [];
  for (let current = 1; ; current++) {
    const result = await fetchTransferRules({ current, size: 100 });
    if (result.error) return { data: null, error: result.error };
    rows.push(...result.data.records);
    if (rows.length >= result.data.total || !result.data.records.length) return { data: rows, error: null };
  }
}
export async function fetchAllPayees() {
  const rows: Payee[] = [];
  for (let current = 1; ; current++) {
    const result = await fetchPayees({ current, size: 100 });
    if (result.error) return { data: null, error: result.error };
    rows.push(...result.data.records);
    if (rows.length >= result.data.total || !result.data.records.length) return { data: rows, error: null };
  }
}
