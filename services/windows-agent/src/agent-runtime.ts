import type { CollectorTransferTask } from '../../../contracts/transfer-collector.js';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { AgentClient, AgentHttpError } from './agent-client.js';
import { AdsPowerClient } from './adspower.js';
import { AdsPowerBrowserClient, type BrowserMonitorOptions } from './browser/adspower-browser.js';
import { monitoringLogUrl, 规范日志条目 } from './browser/monitoring-log.js';
import { Outbox } from './outbox.js';
import type { AgentCommand, AgentConfiguration, AgentTask, AgentTaskResult } from '../../../contracts/collector-agent.js';

export const SCRIPT_VERSION = 'windows-agent-0.8.23';

const MAX_CONCURRENT_TRANSFERS = 2;

export class AgentRuntime {
  private readonly stopping = new AbortController();
  private readonly pollingWorkers = new Map<string, Promise<void>>();
  private readonly transferWorkers = new Map<string, Promise<void>>();
  private yieldForTransfer = new Set<string>();
  private readonly allowedTasks = new Set<string>();
  /** 中心已结束（强制结束、取消、兜底）的转账单：脚本据此在下一个检查点停止，不再继续操作浏览器 */
  private readonly stoppedTransfers = new Set<string>();
  private readonly commands = new Map<string, AgentCommand>();
  private readonly completedCommands = new Set<string>();
  private configuration?: AgentConfiguration;
  private connectedAt = 0;
  private heartbeatFailed = false;
  private inventoryRequested = true;
  private updateRequested = false;
  private adsPowerStatus: 'UNKNOWN' | 'AVAILABLE' | 'UNAVAILABLE' = 'UNKNOWN';
  private inventoryError: string | null = null;
  private readonly outbox: Outbox;

  constructor(private readonly central: AgentClient, private readonly adsPower: AdsPowerClient, private readonly browser: AdsPowerBrowserClient,
    private readonly collectorId: string, stateDirectory: string) { this.outbox = new Outbox(join(stateDirectory, 'outbox')); }

  /** 环境同步间隔：由中心的脚本设置下发（分钟，默认 30），每次循环重新读取，改设置后无需重启即可生效。 */
  private environmentSyncIntervalMs() {
    const minutes = this.configuration?.settings.environmentSyncMinutes ?? 30;
    return Math.max(1, Math.min(1440, minutes)) * 60_000;
  }

  stop() { this.stopping.abort(); }
  private wait(ms: number) { return delay(ms, undefined, { signal: this.stopping.signal }).catch(() => undefined); }
  private failed(error: unknown) {
    const message = error instanceof Error ? error.message : '采集端请求失败';
    console.error('[agent] ' + message);
    if (error instanceof Error && error.stack) {
      console.error('[agent] Stack trace:', error.stack);
    }
    if (error instanceof AgentHttpError && error.fatal) {
      console.error('[agent] 凭据或会话失效，已停止执行；请检查配置及重复运行的 Agent');
      process.exitCode = 1; this.stop();
    }
  }

  async run() {
    let backoff = 3000;
    while (!this.stopping.signal.aborted) {
      try { await this.central.openSession(SCRIPT_VERSION); break; }
      catch (error) { this.failed(error); await this.wait(backoff); backoff = Math.min(60_000, backoff * 2); }
    }
    if (this.stopping.signal.aborted) return;
    // 四个异步循环独立运行，慢浏览器或慢环境查询不阻塞心跳。
    await Promise.all([this.heartbeatLoop(), this.inventoryLoop(), this.taskLoop(), this.reportLoop()]);
    await Promise.allSettled([...this.pollingWorkers.values(), ...this.transferWorkers.values()]);
  }

  private async heartbeatLoop() {
    let backoff = 10_000;
    while (!this.stopping.signal.aborted) {
      try {
        const response = await this.central.heartbeat({ collectorId: this.collectorId, scriptVersion: SCRIPT_VERSION, sentAt: new Date().toISOString(), accounts: [],
          appliedRevision: this.configuration?.revision ?? 0, activeTaskIds: [...this.pollingWorkers.keys(), ...this.transferWorkers.keys()], adsPowerStatus: this.adsPowerStatus, environmentSyncError: this.inventoryError });
        if (!this.connectedAt) console.log('[agent] 已连接中心，采集端心跳正常');
        if (this.heartbeatFailed) this.inventoryRequested = true;
        this.heartbeatFailed = false;
        this.connectedAt = Date.now();
        for (const id of this.allowedTasks) if (!response.activeTaskIds.includes(id)) this.allowedTasks.delete(id);
        this.yieldForTransfer = new Set(response.yieldPollingTaskIds ?? []);
        for (const id of response.stoppedTransferIds ?? []) {
          if (!this.transferWorkers.has(id) || this.stoppedTransfers.has(id)) continue;
          this.stoppedTransfers.add(id);
          console.log('[agent] 中心已结束转账单，立即停止对应脚本：' + id);
        }
        for (const id of this.commands.keys()) if (!response.commands.some(command => command.id === id)) this.commands.delete(id);
        for (const command of response.commands) if (!this.completedCommands.has(command.id)) this.commands.set(command.id, command);
        this.updateRequested = [...this.commands.values()].some(command => command.kind === 'UPDATE_SCRIPT');
        for (const command of this.commands.values()) {
          if (command.kind === 'SYNC_ENVIRONMENTS') this.inventoryRequested = true;
          if (command.kind === 'UPDATE_SCRIPT') this.updateRequested = true;
        }
        if (!this.configuration || response.configRevision !== this.configuration.revision) {
          this.configuration = await this.central.configuration();
          console.log(this.configuration.settings.enabled ? '[agent] 配置已生效' : '[agent] 配置已生效（监控已关闭，暂停执行任务）');
          if (!this.configuration.settings.enabled) this.allowedTasks.clear();
        }
        backoff = 10_000;
      } catch (error) { this.heartbeatFailed = true; this.failed(error); backoff = Math.min(60_000, backoff * 2); }
      // 有转账脚本在跑时缩短心跳间隔：中心强制结束后，脚本最多 3 秒就能收到通知并停下；失败退避期间不缩短
      const 转账执行中 = this.transferWorkers.size > 0;
      await this.wait(转账执行中 && backoff <= 10_000 ? 3000 : backoff);
    }
  }

  private async receipt(command: AgentCommand, status: 'RUNNING' | 'SUCCEEDED' | 'FAILED', error?: string) {
    await this.central.request(`/agent-commands/${encodeURIComponent(command.id)}/receipt`, { sessionId: this.central.sessionId, status, error });
  }

  private async inventoryLoop() {
    // lastSync：上次成功同步的时间；retryAt：失败后最早重试时间。间隔每轮按当前设置计算。
    let lastSync = 0;
    let retryAt = 0;
    let backoff = 3000;
    while (!this.stopping.signal.aborted) {
      if (!this.inventoryRequested && (Date.now() < retryAt || Date.now() - lastSync < this.environmentSyncIntervalMs())) { await this.wait(1000); continue; }
      const commands = [...this.commands.values()].filter(command => command.kind === 'SYNC_ENVIRONMENTS');
      this.inventoryRequested = false;
      let localInventoryRead = false;
      try {
        for (const command of commands) await this.receipt(command, 'RUNNING');
        const profiles = await this.adsPower.listProfiles();
        localInventoryRead = true;
        this.adsPowerStatus = 'AVAILABLE';
        const { syncId } = await this.central.startInventory();
        const totalPages = Math.max(1, Math.ceil(profiles.length / 100));
        let committed = false;
        for (let page = 0; page < totalPages; page++) {
          const response = await this.central.inventoryPage(syncId, page, totalPages, profiles.slice(page * 100, (page + 1) * 100));
          committed = response.committed;
        }
        if (!committed) throw new Error('中心尚未确认完整环境清单');
        console.log(`[agent] 环境同步完成，共 ${profiles.length} 个`);
        this.inventoryError = null;
        for (const command of commands) {
          this.outbox.enqueue(`/agent-commands/${command.id}/receipt`, { sessionId: this.central.sessionId, status: 'SUCCEEDED' });
          this.completedCommands.add(command.id); this.commands.delete(command.id);
        }
        lastSync = Date.now(); retryAt = 0; backoff = 3000;
      } catch (error) {
        if (!localInventoryRead) this.adsPowerStatus = 'UNAVAILABLE';
        this.inventoryError = '环境同步失败，将自动重试'; this.failed(error);
        for (const command of commands) {
          this.outbox.enqueue(`/agent-commands/${command.id}/receipt`, { sessionId: this.central.sessionId, status: 'FAILED', error: this.inventoryError });
          this.completedCommands.add(command.id); this.commands.delete(command.id);
        }
        // 失败后清掉上次成功时间，退避到点就重试，不必等满一个同步间隔
        lastSync = 0; retryAt = Date.now() + backoff; backoff = Math.min(60_000, backoff * 2);
      }
      await this.wait(1000);
    }
  }

  private taskActive(task: AgentTask) {
    return !this.stopping.signal.aborted && Date.now() - this.connectedAt < 60_000 && this.allowedTasks.has(task.taskId) &&
      this.configuration?.revision === task.revision && this.configuration.settings.enabled;
  }

  private async execute(task: AgentTask) {
    const settings = task.settings;
    let result: Awaited<ReturnType<AdsPowerBrowserClient['monitor']>> = { status: 'ENV_UNAVAILABLE', tabs: [] };
    const active = () => this.taskActive(task);
    try {
      for (let attempt = 0; attempt <= settings.retryCount && active(); attempt++) {
        const monitorOptions: BrowserMonitorOptions = {
          isActive: active,
          shouldYieldToTransfer: () => this.yieldForTransfer.has(task.taskId),
          monitorAccount: task.monitorAccount !== false,
          fetchAppIds: task.fetchAppIds === true,
          tab3Url: settings.tab3Url,
          actionTimeoutSeconds: settings.actionTimeoutSeconds,
          loginMaxAttempts: settings.loginMaxAttempts,
          loginTimeoutMinutes: settings.loginTimeoutMinutes,
          requestLogin: () => this.central.login(task.taskId),
          // 密码错误 / 重试轮次用尽时通知中心（后者触发冷却）
          loginRejected: () => this.central.loginRejected(task.taskId),
          loginFailed: () => this.central.loginFailed(task.taskId),
          // 打码平台配置：由中心随任务下发，登录遇到验证码时自动截图识别
          打码平台: settings.captchaProvider,
          打码用户名: settings.captchaUsername,
          打码密码: settings.captchaPassword,
          sliderOffsetPx: settings.sliderOffsetPx,
        };

        result = await this.browser.monitor(task.profileId, [settings.tab1Url, settings.tab2Url], settings.navigationTimeoutSeconds,
          async entry => this.outbox.enqueue('/script-logs', { sessionId: this.central.sessionId, taskId: task.taskId, logs: [规范日志条目(entry)] }, true),
          monitorOptions);
        if (result.status !== 'ENV_UNAVAILABLE' || this.yieldForTransfer.has(task.taskId)) break;
        if (attempt < settings.retryCount) await this.wait(1000 * (attempt + 1));
      }
      const report: AgentTaskResult = { taskId: task.taskId, profileId: task.profileId, status: result.status,
        tabs: result.tabs.map(tab => ({ ...tab, url: monitoringLogUrl(tab.url) ?? '', title: tab.title?.slice(0, 200) })),
        completedAt: new Date().toISOString(), bindings: {},
        ...(result.yieldedForTransfer ? { yieldedForTransfer: true } : {}),
        ...(result.inspection ? { inspection: result.inspection } : {}),
        ...(result.appIdsAttempted ? { appIdsAttempted: true, ...(result.appIds ? { appIds: result.appIds } : {}), ...(result.appIdsError ? { appIdsError: result.appIdsError } : {}) } : {}),
        ...(result.error ? { error: '浏览器巡检失败，请查看本机日志' } : {}) };
      this.outbox.enqueue('/script-task-result', { ...report, externalId: report.profileId, profileId: undefined, sessionId: this.central.sessionId });
    } catch (error) {
      this.failed(error);
      this.outbox.enqueue('/script-task-result', { sessionId: this.central.sessionId, taskId: task.taskId, externalId: task.profileId,
        status: 'ENV_UNAVAILABLE', tabs: [], bindings: {}, completedAt: new Date().toISOString(), error: '浏览器巡检中断' });
    }
    finally { this.allowedTasks.delete(task.taskId); this.pollingWorkers.delete(task.taskId); }
  }

  private async executeTransfer(task: CollectorTransferTask) {
    // 进度心跳：本地节流，积压过多时只丢进度，绝不丢最终结果
    const progress = (message: string) => {
      this.outbox.enqueue('/transfers/' + encodeURIComponent(task.id) + '/progress',
        { sessionId: this.central.sessionId, logs: [{ at: new Date().toISOString(), message: message.slice(0, 200) }] }, true);
    };
    const settings = this.configuration?.settings;
    // 结束日志必须在结果之前入队：队列按顺序发送，结果一到中心这笔单就不再是“执行中”，之后的日志会被拒收
    const 结束 = (status: string, note?: string) => {
      const 名称: Record<string, string> = { SUCCEEDED: '成功', FAILED: '失败', UNKNOWN: '结果未知', NEEDS_MANUAL: '待人工处理' };
      progress(`★ 【任务结束】${名称[status] ?? status}${note ? '：' + note : ''}`);
    };
    try {
      const result = await this.browser.transfer(task, {
        // 转账一旦开始就不受监控开关影响；只有采集端会话失效或中心已结束这张单才算不活跃
        isActive: () => !this.stopping.signal.aborted && !this.stoppedTransfers.has(task.id),
        authorizeSubmission: () => this.central.authorizeSubmission(task.id),
        日志: progress,
        // 转账页未登录时按转账单向中心取登录凭据，登录后继续
        requestLogin: () => this.central.transferLogin(task.id),
        loginRejected: () => this.central.transferLoginRejected(task.id),
        // 扫码确认：二维码走上报队列，中心发到 TG 群；入队早于 /result，中心只在单子还在执行中时才收
        上报二维码: (image, expiresText, waitMinutes) => this.outbox.enqueue('/transfers/' + encodeURIComponent(task.id) + '/qr',
          { sessionId: this.central.sessionId, image, expiresText, waitMinutes }),
        打码平台: settings?.captchaProvider,
        打码用户名: settings?.captchaUsername,
        打码密码: settings?.captchaPassword,
        登录超时分钟: settings?.loginTimeoutMinutes,
        最大重试轮数: settings?.loginMaxAttempts,
        滑块补偿像素: settings?.sliderOffsetPx,
        扫码等待分钟: settings?.qrWaitMinutes,
      });
      结束(result.status, result.note);
      // 截图不随 /result 上报：截图校验失败（422）会让整条被丢弃，连带丢掉结果。
      // 顺序：先 /result 再截图——中心只在单子离开“执行中”之后才收截图，结果先到才能保证截图被接受。
      const { screenshot, ...report } = result;
      this.outbox.enqueue('/transfers/' + encodeURIComponent(task.id) + '/result', { ...report, sessionId: this.central.sessionId });
      if (screenshot) {
        this.outbox.enqueue('/transfers/' + encodeURIComponent(task.id) + '/screenshot',
          { sessionId: this.central.sessionId, result: report.status, image: screenshot });
      }
    } catch {
      结束('UNKNOWN', '转账执行中断，禁止重试，请核对真实结果');
      this.outbox.enqueue('/transfers/' + encodeURIComponent(task.id) + '/result', {
        sessionId: this.central.sessionId, status: 'UNKNOWN', note: '转账执行中断，禁止重试，请核对真实结果',
      });
    } finally { this.transferWorkers.delete(task.id); this.stoppedTransfers.delete(task.id); }
  }
  private async claimPolling(limit: number) {
    const available = Math.min(20, limit) - this.pollingWorkers.size;
    if (available <= 0) return;
    for (const task of await this.central.claim(available)) {
      if (this.pollingWorkers.has(task.taskId)) continue;
      this.allowedTasks.add(task.taskId);
      this.pollingWorkers.set(task.taskId, Promise.resolve().then(() => this.execute(task)));
    }
  }

  private async claimTransfers() {
    const available = MAX_CONCURRENT_TRANSFERS - this.transferWorkers.size;
    for (let i = 0; i < available; i++) {
      const { transfer } = await this.central.claimTransfer();
      if (!transfer || this.transferWorkers.has(transfer.id)) break;
      this.transferWorkers.set(transfer.id, Promise.resolve().then(() => this.executeTransfer(transfer)));
    }
  }

  private async taskLoop() {
    while (!this.stopping.signal.aborted) {
      try {
        if (this.updateRequested && !this.pollingWorkers.size && !this.transferWorkers.size && !this.outbox.size) {
          for (const command of this.commands.values()) if (command.kind === 'UPDATE_SCRIPT') await this.receipt(command, 'RUNNING');
          console.log('[agent] 已完成当前任务，通知启动器检查更新'); process.exitCode = 75; this.stop(); break;
        }
        if (!this.updateRequested && this.configuration?.settings.enabled && this.outbox.size < 500) {
          const claims = await Promise.allSettled([
            this.claimPolling(this.configuration.settings.maxConcurrentAccounts), this.claimTransfers(),
          ]);
          for (const claim of claims) if (claim.status === 'rejected') this.failed(claim.reason);
        }
      } catch (error) { this.failed(error); }
      await this.wait(5000);
    }
  }

  private async reportLoop() {
    let backoff = 1000;
    while (!this.stopping.signal.aborted) {
      try { await this.outbox.flush(this.central); backoff = 1000; }
      catch (error) { this.failed(error); backoff = Math.min(60_000, backoff * 2); }
      await this.wait(backoff);
    }
  }
}
