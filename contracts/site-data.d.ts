/** 白名单业务字段；不传支付配置、买家、回调地址或商户密钥。 */
export interface ChannelData {
  code: string;
  name: string;
  paymentTypeId: string;
  paymentTypeName: string;
  plugin: string;
  sourceStatus: number;
  dayStatus: number;
  details?: ChannelDetails;
}
export interface ChannelDetails {
  totalSuccessAmount?: string;
  totalSuccessCount?: number;
  /** 仅用于环境关联匹配，不同步完整支付配置。 */
  appId?: string;
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
}
export interface PollingData {
  code: string;
  name: string;
  paymentTypeId: string;
  paymentTypeName: string;
  sourceStatus: number;
  kind: number;
  position: number;
  members: { channelCode: string; weight: number; position: number }[];
}
export interface OrderData {
  externalId: string;
  merchantId: string;
  paymentTypeId: string;
  paymentTypeName: string;
  channelCode: string;
  subchannelCode: string;
  amount: string;
  realAmount?: string;
  sourceStatus: string;
  occurredAt: string;
  paidAt?: string;
}
export interface SyncStart {
  revision: number;
  windowStart: string;
  windowEnd: string;
  mappingVersion: 'epay-pro-2070-status-v1' | 'epay-pro-2070-status-v2';
  expectedCount: number;
  channels: ChannelData[];
  pollingGroups: PollingData[];
}
