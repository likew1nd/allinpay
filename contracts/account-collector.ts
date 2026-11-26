export type AccountStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'AUTH_EXPIRED'
  | 'PASSWORD_REJECTED'
  | 'CAPTCHA_REQUIRED'
  | 'ENV_UNAVAILABLE'
  | 'UNKNOWN';

export interface AccountCollectorHeartbeat {
  version?: string;
  status?: 'ONLINE' | 'OFFLINE' | 'ERROR';
  error?: string;
  metadata?: Record<string, unknown>;
  accounts?: Array<{
    externalId: string;
    name?: string;
    status: AccountStatus;
    browserState?: string;
    businessStatus?: 'NORMAL' | 'RESTRICTED' | 'JUDICIAL' | 'UNKNOWN';
    receiptLimit?: string;
    paymentLimit?: string;
    unavailableBalance?: string;
    pendingBalance?: string;
    error?: string;
    metadata?: Record<string, unknown>;
    // 页面采集的余额，最多两位小数
    balance?: string;
  }>;
}

export interface AccountCollectorHeartbeatResult {
  collector: { id: string; status: 'ONLINE' | 'OFFLINE' | 'ERROR'; lastHeartbeatAt: string | null };
  accepted: number;
}
