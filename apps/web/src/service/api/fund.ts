import { request } from '../request';
import type { AccountRecord } from './account';

export interface FundAccount {
  accountId: string | null;
  account: Pick<
    AccountRecord,
    'id' | 'name' | 'externalId' | 'status' | 'balance' | 'balanceAt'
  > | null;
  id: string;
  name: string;
  owner: string;
  balance: string;
  frozen: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}
export function fetchFundAccounts(params: { current: number; size: number; keyword?: string }) {
  return request<Api.Common.PaginatingQueryRecord<FundAccount>>({ url: '/fund-accounts', method: 'get', params });
}
export function createFundAccount(data: { name: string; owner: string; accountId?: string | null }) {
  return request<FundAccount>({ url: '/fund-accounts', method: 'post', data });
}
export function updateFundAccount(id: string, accountId: string | null) {
  return request<FundAccount>({
    url: `/fund-accounts/${encodeURIComponent(id)}`,
    method: 'patch',
    data: { accountId }
  });
}
export interface SettlementRecord {
  id: string;
  fundAccountId: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  fee: string;
  status: string;
  note?: string;
  fundAccount?: { id: string; name: string };
}
export function fetchSettlements(params: { current: number; size: number; status?: string }) {
  return request<Api.Common.PaginatingQueryRecord<SettlementRecord>>({ url: '/settlements', method: 'get', params });
}
export function createSettlement(data: {
  fundAccountId: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  fee?: string;
  note?: string;
}) {
  return request<SettlementRecord>({ url: '/settlements', method: 'post', data });
}
