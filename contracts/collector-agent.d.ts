export type ScriptAccountStatus = 'LOGGED_IN' | 'LOGIN_REQUIRED' | 'PASSWORD_REJECTED' | 'QR_LOGIN_REQUIRED' | 'CAPTCHA_REQUIRED' | 'PAGE_ERROR' | 'ENV_UNAVAILABLE' | 'UNKNOWN';
export interface ScriptSettings {
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
  loginMaxAttempts?: number;
  loginTimeoutMinutes?: number;
  /** 打码平台：NONE 表示不打码；账号密码由中心解密后随配置和任务下发，采集端只在内存中使用。 */
  captchaProvider?: 'NONE' | 'TTSHITU' | 'BINGTOP';
  captchaUsername?: string;
  captchaPassword?: string;
  /** 滑块识别坐标的固定补偿像素，默认 10。 */
  sliderOffsetPx?: number;
  /** 环境同步间隔（分钟），默认 30。 */
  environmentSyncMinutes?: number;
  /** 扫码确认最多等待的分钟数（1~25），默认 8。 */
  qrWaitMinutes?: number;
  updatedAt?: string | null;
}
export interface ScriptTabSnapshot {
  tab: 'home' | 'riskManage'; url: string; loaded: boolean;
  loginState: ScriptAccountStatus; title?: string; observedAt: string;
}
export interface EnvironmentProfile { externalId: string; profileNo: string; name: string; groupName: string }
export interface AgentConfiguration {
  revision: number;
  settings: ScriptSettings;
  accounts: Array<{ externalId: string }>;
}
export interface AgentCommand { id: string; kind: 'SYNC_ENVIRONMENTS' | 'UPDATE_SCRIPT'; payload?: { version?: string } | null }
export interface AgentHeartbeat {
  collectorId: string; scriptVersion: string; sentAt: string; accounts: [];
  sessionId: string; appliedRevision: number; activeTaskIds: string[];
  adsPowerStatus: 'UNKNOWN' | 'AVAILABLE' | 'UNAVAILABLE';
  environmentSyncError?: string | null;
}
export interface AgentHeartbeatResponse {
  accepted: number; rejected: number; nextHeartbeatAt: string;
  configRevision: number; commands: AgentCommand[]; activeTaskIds: string[];
  /** 采集端仍在执行、但中心已结束的转账单（强制结束、取消、超时兜底、重新排队），脚本收到后立即停止 */
  stoppedTransferIds?: string[];
  /** 有待领转账的巡检在当前步骤结束后归还环境，归还前仍然续租。 */
  yieldPollingTaskIds?: string[];
}
export interface AgentTask {
  taskId: string; profileId: string; revision: number; settings: ScriptSettings;
  bindings: Partial<Record<'tab1' | 'tab2' | 'tab3', { targetId: string; targetUrl: string | null }>>;
  monitorAccount?: boolean;
  fetchAppIds?: boolean;
}
/** 标签 1 读取的资金数据；读不到的项为 null，中心不会用 null 覆盖旧值。金额均为不带千分位的两位小数字符串。 */
export interface AccountFundsInspection {
  availableBalance: string | null;
  unavailableBalance: string | null;
  pendingBalance: string | null;
  /** 当日可收款额度；页面显示“不限额”时为 null，同时 receiptUnlimited 为 true */
  receiptQuota: string | null;
  /** 当日可用付款额度；页面显示“不限额”时为 null，同时 paymentUnlimited 为 true */
  paymentQuota: string | null;
  receiptUnlimited?: boolean;
  paymentUnlimited?: boolean;
}
/** 标签 2 单个查询（商家限制或司法限制）的结果；limited 为 true 时附带结果区域截图（JPEG data URL）。 */
export interface RestrictionInspection { limited: boolean; image?: string }
/** 登录后巡检结果；某一项没有执行或执行失败时不出现，中心保持原值不变。 */
export interface AccountInspection {
  funds?: AccountFundsInspection;
  restriction?: RestrictionInspection;
  judicial?: RestrictionInspection;
}
export interface AgentTaskResult {
  taskId: string; profileId: string; status: ScriptAccountStatus;
  tabs: ScriptTabSnapshot[]; completedAt: string; error?: string;
  bindings: AgentTask['bindings'];
  inspection?: AccountInspection;
  yieldedForTransfer?: boolean;
  appIdsAttempted?: boolean;
  appIds?: string[];
  appIdsError?: string;
}
export interface ScriptVersion { version: string; bundleHash: string; releasedAt: string }
