import type { CollectorTransferClaimResult } from '../../../contracts/transfer-collector.js';
import type { AgentConfiguration, AgentHeartbeat, AgentHeartbeatResponse, AgentTask, EnvironmentProfile, ScriptVersion } from '../../../contracts/collector-agent.js';

/** 中心下发的浏览器登录凭据；非 ready 状态时只有状态，没有账号密码。 */
export type 登录凭据结果 =
  | { status: 'ready'; loginAccount: string; password: string; onRejected: () => Promise<void> }
  | { status: 'missing' | 'cooldown' | 'blocked' | 'stopped' };

/**
 * 中心返回 422 校验失败时，拼出“请求路径 + 不合法字段 + 原因”。
 * 只取字段路径和校验规则说明，不含请求体内容，不会带出账号密码等敏感信息。
 */
function 校验失败详情(路径: string, 响应: { message?: string; error?: { errors?: unknown } }): string | undefined {
  const 错误集合 = 响应.error?.errors;
  if (!错误集合 || typeof 错误集合 !== 'object') return undefined;
  const 明细: string[] = [];
  const 遍历 = (节点: unknown, 前缀: string) => {
    if (Array.isArray(节点)) { 明细.push(`${前缀}: ${节点.map(String).join('、')}`); return; }
    if (节点 && typeof 节点 === 'object') for (const [键, 值] of Object.entries(节点)) 遍历(值, 前缀 ? `${前缀}.${键}` : 键);
  };
  遍历(错误集合, '');
  if (!明细.length) return undefined;
  return `${响应.message ?? '校验失败'}（${路径}）：${明细.slice(0, 5).join('；').slice(0, 300)}`;
}

export class AgentHttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
  get fatal() { return [401, 403].includes(this.status) || (this.status === 409 && this.message.includes('会话已被替换')); }
}

export class AgentClient {
  sessionId = '';
  constructor(private readonly apiUrl: string, private readonly collectorId: string, private readonly token: string) {}

  async request<T>(path: string, body?: unknown, timeout = 20_000): Promise<T> {
    let response: Response;
    try { response = await fetch(`${this.apiUrl}/collectors/${encodeURIComponent(this.collectorId)}${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(timeout),
      headers: { 'content-type': 'application/json', 'x-collector-token': this.token },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }); } catch { throw new AgentHttpError(0, '中心请求未完成，请检查网络'); }
    let payload: { code?: number; data?: T; message?: string; error?: { errors?: unknown } };
    try { payload = await response.json() as typeof payload; } catch { throw new AgentHttpError(response.status, `中心响应格式无效（HTTP ${response.status}）`); }
    if (!response.ok || payload.code !== 200) throw new AgentHttpError(response.status, 校验失败详情(path, payload) || payload.message || `中心请求失败（HTTP ${response.status}）`);
    return payload.data as T;
  }

  async openSession(scriptVersion: string) {
    const result = await this.request<{ sessionId: string }>('/agent-session', { scriptVersion });
    this.sessionId = result.sessionId;
  }
  configuration() { return this.request<AgentConfiguration>(`/agent-configuration?sessionId=${encodeURIComponent(this.sessionId)}`); }
  heartbeat(body: Omit<AgentHeartbeat, 'sessionId'>) { return this.request<AgentHeartbeatResponse>('/script-heartbeat', { ...body, sessionId: this.sessionId }); }
  startInventory() { return this.request<{ syncId: string }>('/environment-sync/start', { sessionId: this.sessionId }); }
  inventoryPage(syncId: string, page: number, totalPages: number, profiles: EnvironmentProfile[]) {
    return this.request<{ committed: boolean; count?: number }>('/environment-sync/page', { sessionId: this.sessionId, syncId, page, totalPages, profiles }, 70_000);
  }
  async claimTransfer(): Promise<CollectorTransferClaimResult> {
    try { return await this.request<CollectorTransferClaimResult>('/transfers/claim-for-submit', { sessionId: this.sessionId }); }
    catch (error) {
      // 旧中心缺少一次性提交许可接口，仍可继续领取巡检任务。
      if (error instanceof AgentHttpError && error.status === 404) return { transfer: null, reason: 'UPDATE_REQUIRED' };
      throw error;
    }
  }
  async authorizeSubmission(id: string) {
    const result = await this.request<{ authorized: boolean }>(`/transfers/${encodeURIComponent(id)}/authorize-submission`, { sessionId: this.sessionId });
    if (result?.authorized !== true) throw new Error('中心未确认付款提交许可');
  }
  /** 转账执行时需要登录：按转账单取登录凭据，非 ready 状态只有状态没有账号密码 */
  async transferLogin(transferId: string): Promise<登录凭据结果> {
    const result = await this.request<{ status: 登录凭据结果['status']; loginAccount?: string; password?: string }>(`/transfers/${encodeURIComponent(transferId)}/login`, { sessionId: this.sessionId });
    if (result.status !== 'ready') return { status: result.status } as 登录凭据结果;
    if (!result.loginAccount || !result.password) throw new Error('中心返回的登录凭据不完整');
    return { status: 'ready', loginAccount: result.loginAccount, password: result.password,
      onRejected: async () => { await this.transferLoginRejected(transferId); } };
  }
  async transferLoginRejected(transferId: string) {
    await this.request(`/transfers/${encodeURIComponent(transferId)}/login-rejected`, { sessionId: this.sessionId });
  }
  claim(capacity: number) { return this.request<AgentTask[]>('/script-tasks/claim', { sessionId: this.sessionId, capacity }); }
  async active(taskId: string) {
    const result = await this.request<{ active: boolean }>(`/script-tasks/${encodeURIComponent(taskId)}/active`, { sessionId: this.sessionId });
    return result.active;
  }
  async login(taskId: string): Promise<登录凭据结果> {
    const result = await this.request<{ status: 登录凭据结果['status']; loginAccount?: string; password?: string }>(`/script-tasks/${encodeURIComponent(taskId)}/login`, { sessionId: this.sessionId });
    if (result.status !== 'ready') return { status: result.status } as 登录凭据结果;
    if (!result.loginAccount || !result.password) throw new Error('中心返回的登录凭据不完整');
    return { status: 'ready', loginAccount: result.loginAccount, password: result.password,
      onRejected: async () => { await this.loginRejected(taskId); } };
  }
  /** 页面提示账号或密码错误：通知中心把凭据标记为被拒绝，修正并保存前不再自动登录。 */
  async loginRejected(taskId: string) {
    await this.request(`/script-tasks/${encodeURIComponent(taskId)}/login-rejected`, { sessionId: this.sessionId });
  }
  /** 登录重试轮次全部用尽仍未成功：通知中心触发冷却。 */
  async loginFailed(taskId: string) {
    await this.request(`/script-tasks/${encodeURIComponent(taskId)}/login-failed`, { sessionId: this.sessionId });
  }
  version() { return this.request<ScriptVersion>('/script-version'); }
}
