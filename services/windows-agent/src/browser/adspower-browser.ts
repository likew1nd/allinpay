import { executeTransferPage, 需要重开浏览器 } from './transfer.js';
import type { CollectorTransferTask } from '../../../../contracts/transfer-collector.js';
import { chromium, type Browser } from 'playwright-core';

import { fetchAdsPower } from './adspower-request.js';
import { monitoringLogUrl, type MonitoringLogWriter } from './monitoring-log.js';

// 新的中文登录模块
import { 执行登录流程 } from './login-flow.js';
import type { 打码平台类型 } from './captcha-solver.js';
import { 是支付宝业务域, 是支付宝登录页, 读取登录阻塞, 读取登录证据, 是否已登录 } from './alipay-session.js';
import { 执行限制巡检, 读取资金数据, type 指纹记录 } from './post-login-inspection.js';
import type { AccountInspection } from '../contracts.js';
import { parseAlipayAppIds, type AppIdRowText } from './app-id-parser.js';

export interface BrowserMonitorOptions {
  isActive?: () => boolean;
  shouldYieldToTransfer?: () => boolean;
  monitorAccount?: boolean;
  fetchAppIds?: boolean;
  tab3Url?: string;
  actionTimeoutSeconds?: number;
  loginTimeoutMinutes?: number;
  loginMaxAttempts?: number;
  /** 打码平台配置：由中心随任务下发，登录遇到验证码时自动截图识别 */
  打码平台?: 打码平台类型;
  打码用户名?: string;
  打码密码?: string;
  /** 滑块识别结果的固定补偿像素 */
  sliderOffsetPx?: number;
  /** 请求登录凭据的回调 */
  requestLogin?: () => Promise<{
    status: 'ready' | 'missing' | 'cooldown' | 'blocked' | 'stopped';
    loginAccount?: string;
    password?: string;
    onRejected?: () => Promise<void>;
  }>;
  /** 页面提示账号或密码错误时通知中心 */
  loginRejected?: () => Promise<void>;
  /** 登录重试轮次全部用尽仍未成功时通知中心（触发冷却） */
  loginFailed?: () => Promise<void>;
}

/** 转账执行选项：登录凭据回调和进度日志 */
export interface BrowserTransferOptions {
  isActive?: () => boolean;
  authorizeSubmission?: () => Promise<void>;
  requestLogin?: BrowserMonitorOptions['requestLogin'];
  /** 转账页提示账号或密码错误时通知中心 */
  loginRejected?: () => Promise<void>;
  登录超时分钟?: number;
  最大重试轮数?: number;
  打码平台?: 打码平台类型;
  打码用户名?: string;
  打码密码?: string;
  /** 滑块识别结果的固定补偿像素（转账页登录时使用） */
  滑块补偿像素?: number;
  /** 扫码确认最多等待的分钟数（脚本设置） */
  扫码等待分钟?: number;
  /** 扫码确认页出现时上报二维码截图、页面标注的有效期原文和等待分钟数（只调用一次） */
  上报二维码?: (图片: string, 有效期文案: string | undefined, 等待分钟: number) => void;
  /** 进度日志（含 3 秒心跳），由调用方带上转账单号后上报 */
  日志?: (消息: string) => void;
}

// 浏览器监控识别出的账号登录态，中心直连 AdsPower 后不再从外部契约导入
type ScriptAccountStatus =
  | 'LOGGED_IN'
  | 'LOGIN_REQUIRED'
  | 'QR_LOGIN_REQUIRED'
  | 'CAPTCHA_REQUIRED'
  | 'PAGE_ERROR'
  | 'ENV_UNAVAILABLE'
  | 'UNKNOWN';

export interface BrowserTabSnapshot {
  tab: 'home' | 'riskManage';
  url: string;
  loaded: boolean;
  loginState: ScriptAccountStatus | 'UNKNOWN';
  title?: string;
  observedAt: string;
}

export interface BrowserMonitorResult {
  yieldedForTransfer?: boolean;
  status: ScriptAccountStatus;
  tabs: BrowserTabSnapshot[];
  /** 登录后巡检结果（资金、限制、司法）；没有执行或失败的项不出现 */
  inspection?: AccountInspection;
  appIdsAttempted?: boolean;
  appIds?: string[];
  appIdsError?: string;
  error?: string;
}

interface ApiPayload {
  code?: number;
  msg?: string;
  data?: Record<string, unknown>;
}

/** 页面内只读的登录态识别脚本，只返回摘要字段，不回传页面全文。 */
/**
 * 判定页面登录态。抽成纯函数便于单测，注入脚本复用同一份逻辑字符串，
 * 避免脚本和测试各写一套判定。
 */
export function resolveLoginState(url: string, text: string): ScriptAccountStatus {
  try {
    const address = new URL(url);
    if (address.protocol === 'https:' && /^(?:auth|authe[a-z0-9]+|authsa[0-9]+)\.alipay\.com$/.test(address.hostname) && /^\/login(?:\/|$)/.test(address.pathname)) return 'LOGIN_REQUIRED';
  } catch { return 'UNKNOWN'; }
  if (/(安全验证|安全校验|滑块验证|拖动.{0,8}滑块|请完成验证|依次点击|按顺序点击|点击图中|captcha)/i.test(text)) return 'CAPTCHA_REQUIRED';
  return 'LOGGED_IN';
}

const LOGIN_SCRIPT = `(() => {
  const text = (document.body?.innerText || '').slice(0, 12000);
  const url = location.href;
  const loginState = (${resolveLoginState.toString()})(url, text);
  return {
    url,
    title: document.title,
    loaded: document.readyState === 'complete',
    loginState
  };
})()`;

async function readAlipayApplicationRows(parseRows: typeof parseAlipayAppIds, timeoutMs: number) {
  const clean = (value: string) => (value || '').replace(/\s+/g, '');
  const visible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const label = '网页/移动应用';
  // 管理页为异步渲染，load 完成并不代表入口已挂载。
  const entryDeadline = Date.now() + timeoutMs;
  let matches: Element[] = [];
  do {
    matches = [...document.querySelectorAll('body *')].filter(element => visible(element) && clean((element as HTMLElement).innerText) === label);
    if (matches.length) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  } while (Date.now() < entryDeadline);
  if (!matches.length) throw new Error('未找到“网页/移动应用”入口');
  const leaf = matches.find(element => ![...element.children].some(child => clean((child as HTMLElement).innerText) === label)) || matches[0];
  let target: Element = leaf;
  for (let element: Element | null = leaf, depth = 0; element && element !== document.body && depth < 6; element = element.parentElement, depth += 1) {
    const style = getComputedStyle(element);
    if (element.matches('button,a,[role="tab"],[role="button"]') || typeof (element as HTMLElement).onclick === 'function' || style.cursor === 'pointer') {
      target = element;
      break;
    }
  }
  (target as HTMLElement).click();
  const selectors = ['tr', '[role="row"]', '.ant-table-row', '.el-table__row', '.ant-list-item', '.next-table-row'];
  const readRows = () => [...new Set(selectors.flatMap(selector => [...document.querySelectorAll(selector)]))]
    .filter(visible)
    .map(row => {
      const cells = [...row.querySelectorAll('td,[role="cell"],.ant-table-cell,.next-table-cell')];
      const text = ((cells[0] ?? row) as HTMLElement).innerText || '';
      return { firstColumnText: text, linkedText: [...row.querySelectorAll('a')].map(link => (link as HTMLElement).innerText || '') };
    });
  // 点击后的其他文字变化不代表应用列表已经返回，复用同一解析器判断数据就绪。
  const rowsDeadline = Date.now() + timeoutMs;
  let rows = readRows();
  while (!parseRows(rows).length && Date.now() < rowsDeadline) {
    await new Promise(resolve => setTimeout(resolve, 200));
    rows = readRows();
  }
  return rows;
}

export const buildAppIdRowsScript = (timeoutMs: number) => `(${readAlipayApplicationRows.toString()})(${parseAlipayAppIds.toString()}, ${timeoutMs})`;

/**
 * 中心直连 AdsPower 的浏览器客户端。
 *
 * AdsPower 返回的调试地址固定是 127.0.0.1，部署在另一台机器时中心连不上，
 * 因此这里按采集端配置的主机改写地址，只保留它分配的端口。
 */
export class AdsPowerBrowserClient {
  /** 各环境上次截图时的限制内容指纹，键为“环境ID:页签”，只在内存中保存，Agent 重启后会重新截图一次。 */
  private readonly 限制指纹 = new Map<string, 指纹记录>();
  /**
   * 环境互斥：同一个 AdsPower 环境同一时间只允许一个浏览器任务（监控或转账）。
   * 监控和转账共用同一个环境，任何一方收尾时都会 stop 整个环境，会把另一方正在使用的浏览器一起关掉。
   * 中心已经在领取时做了互斥，这里是采集端自己的最后一道保险：中心状态过期、任务租约交叉、
   * 采集端重启后遗留任务等情况都不应该导致两个任务同时操作同一个环境。
   */
  private readonly 环境占用 = new Map<string, Promise<void>>();

  private async 独占环境<T>(profileId: string, 用途: string, 日志: (消息: string) => void, 工作: () => Promise<T>): Promise<T> {
    let 提示过 = false;
    while (this.环境占用.has(profileId)) {
      if (!提示过) { 日志(`环境正在被另一个任务使用，等待其结束后再开始（${用途}）`); 提示过 = true; }
      await this.环境占用.get(profileId)!.catch(() => undefined);
    }
    let 释放!: () => void;
    this.环境占用.set(profileId, new Promise<void>(resolve => { 释放 = resolve; }));
    try { return await 工作(); }
    finally { this.环境占用.delete(profileId); 释放(); }
  }

  constructor(private readonly endpoint: string, private readonly apiKey: string) {}

  async monitor(profileId: string, urls: [string, string], timeoutSeconds: number, onLog?: MonitoringLogWriter, options: BrowserMonitorOptions = {}): Promise<BrowserMonitorResult> {
    return this.独占环境(profileId, '监控', 消息 => { void onLog?.({ at: new Date().toISOString(), message: 消息 }); },
      () => this.执行监控(profileId, urls, timeoutSeconds, onLog, options));
  }

  private async 执行监控(profileId: string, urls: [string, string], timeoutSeconds: number, onLog?: MonitoringLogWriter, options: BrowserMonitorOptions = {}): Promise<BrowserMonitorResult> {
    const timeoutMs = timeoutSeconds * 1000;
    const actionTimeoutMs = (options.actionTimeoutSeconds ?? 15) * 1000;
    const log = async (message: string, address?: string) => {
      const url = address ? monitoringLogUrl(address) : undefined;
      try {
        await onLog?.({ at: new Date().toISOString(), message, ...(url ? { url } : {}) });
      } catch {
        // 日志写入失败不能改变浏览器巡检结果。
      }
    };
    let browser: Browser | undefined;
    let startRequested = false;
    let result: BrowserMonitorResult = { status: 'ENV_UNAVAILABLE', tabs: [] };
    let appIdsAttempted = false;
    let appIds: string[] | undefined;
    let appIdsError: string | undefined;
    try {
      if (options.isActive?.() === false) throw new Error('巡检任务已停止');
      await log('启动本轮浏览器环境');
      if (options.isActive?.() === false) throw new Error('巡检任务已停止');
      // 请求失败或调试连接失败时，环境仍可能已经启动，必须尝试关闭。
      startRequested = true;
      const wsEndpoint = await this.start(profileId, timeoutMs);
      if (options.isActive?.() === false) throw new Error('巡检任务已停止');
      browser = await connectWithRetry(wsEndpoint, timeoutMs);
      await log('已连接本轮浏览器环境');
      // 浏览器被手动关闭或崩溃时 CDP 连接会断开：把后续操作的活跃检查变成 false，立刻中断本轮，
      // 外层 catch 会按“环境不可用”处理，agent-runtime 会按重试次数重新拉起浏览器再巡检
      let 浏览器已断开 = false;
      if (typeof browser.on === 'function') browser.on('disconnected', () => { 浏览器已断开 = true; });
      const 原活跃检查 = options.isActive;
      options = { ...options, isActive: () => 原活跃检查?.() !== false && !浏览器已断开 };
      const context = browser.contexts()[0];
      if (!context) throw new Error('浏览器环境没有可用上下文');
      const snapshots: BrowserTabSnapshot[] = [];
      const inspection: AccountInspection = {};
      let loginAttempted = false;
      let loginSucceeded = false;
      let passwordRejected = false; // 标记密码错误
      const targets: Array<{ key: 'tab1' | 'tab2' | 'tab3'; target: string }> = [
        ...(options.monitorAccount === false ? [] : urls.map((target, index) => ({ key: index === 0 ? 'tab1' as const : 'tab2' as const, target }))),
        ...(options.fetchAppIds && options.tab3Url ? [{ key: 'tab3' as const, target: options.tab3Url }] : []),
      ];
      let yieldedForTransfer = false;
      for (const { key, target } of targets) {
        if (options.isActive?.() === false) throw new Error('巡检任务已停止');
        // 首页余额和风险状态共同构成付款前的账号快照，已开始读取就做完整再交接。
        if (key !== 'tab2' && options.shouldYieldToTransfer?.()) {
          yieldedForTransfer = true;
          break;
        }
        const page = await context.newPage();
        await log('打开本轮新标签页', target);
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        await page.waitForLoadState('load', { timeout: timeoutMs }).catch(() => undefined);
        let blocker = null;
        let info = await page.evaluate(LOGIN_SCRIPT) as { url: string; title: string; loaded: boolean; loginState: ScriptAccountStatus };
        if (options.requestLogin && (是支付宝登录页(page.url()) || 是支付宝业务域(page.url()))) blocker = await 读取登录阻塞(page);
        if (info.loginState === 'LOGIN_REQUIRED' && loginSucceeded) {
          await log('登录后返回监控网址', target);
          await page.goto(target, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
          await page.waitForLoadState('load', { timeout: timeoutMs }).catch(() => undefined);
          info = await page.evaluate(LOGIN_SCRIPT) as typeof info;
        }
        // 使用新的中文登录流程
        if (info.loginState === 'LOGIN_REQUIRED' && options.requestLogin && !loginAttempted && !loginSucceeded) {
          loginAttempted = true;
          await log('开始执行登录流程');

          loginSucceeded = await 执行登录流程(
            context,
            page,
            timeoutMs,
            log,
            {
              是否活跃: options.isActive,
              请求登录凭据: options.requestLogin,
              标记密码错误: async () => {
                passwordRejected = true; // 设置密码错误标志
                await options.loginRejected?.();
              },
              触发冷却: options.loginFailed,
              登录超时分钟: options.loginTimeoutMinutes,
              最大重试轮数: options.loginMaxAttempts,
              打码平台: options.打码平台,
              打码用户名: options.打码用户名,
              打码密码: options.打码密码,
              滑块补偿像素: options.sliderOffsetPx,
            }
          );

          // 刷新页面状态
          info = await page.evaluate(LOGIN_SCRIPT) as typeof info;
        }
        // 第一标签已确认登录，第二标签共享同一会话，标记已登录避免重复走登录流程
        if (info.loginState === 'LOGGED_IN' && !loginSucceeded) loginSucceeded = true;
        if (blocker === '验证码') info.loginState = 'CAPTCHA_REQUIRED';
        if (loginSucceeded && info.loginState === 'LOGIN_REQUIRED' && options.isActive?.() !== false) {
          await log('登录后返回监控网址', target);
          await page.goto(target, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
          await page.waitForLoadState('load', { timeout: timeoutMs }).catch(() => undefined);
          info = await page.evaluate(LOGIN_SCRIPT) as typeof info;
        }
        await log('页面状态：' + loginStateMessage(info.loginState), info.url);
        // 登录后巡检：只在已登录且停留在目标页时执行，失败只记日志，不改变登录态结果
        if (info.loginState === 'LOGGED_IN' && sameDocument(page.url(), target) && options.isActive?.() !== false) {
          try {
            if (key === 'tab1') {
              const funds = await 读取资金数据(page, log, actionTimeoutMs);
              if (funds) inspection.funds = funds;
            } else if (key === 'tab2') {
              Object.assign(inspection, await 执行限制巡检(page, log, {
                读取: 页签 => this.限制指纹.get(`${profileId}:${页签}`),
                保存: (页签, 记录) => {
                  if (记录) this.限制指纹.set(`${profileId}:${页签}`, 记录);
                  else this.限制指纹.delete(`${profileId}:${页签}`);
                },
              }, options.isActive, actionTimeoutMs));
            }
          } catch {
            await log('登录后巡检异常，本轮已跳过');
          }
        }
        if (key === 'tab3') {
          appIdsAttempted = true;
          if (info.loginState !== 'LOGGED_IN' || !sameDocument(page.url(), target)) {
            appIdsError = '网页/移动应用页面未登录或未加载';
          } else {
            try {
              await log('等待“网页/移动应用”入口并读取应用列表');
              const rows = await page.evaluate(buildAppIdRowsScript(actionTimeoutMs)) as AppIdRowText[];
              await log('已执行“网页/移动应用”入口点击');
              appIds = parseAlipayAppIds(rows);
              if (!appIds.length) appIdsError = '应用列表中未找到可识别的 APPID';
              await log(appIdsError ? 'APPID 列表读取失败：未找到可识别的应用编号' : `APPID 列表读取完成：${appIds.length} 个`);
            } catch (error) {
              appIdsError = error instanceof Error ? error.message.slice(0, 500) : 'APPID 列表读取失败';
              await log(appIdsError.includes('未找到“网页/移动应用”入口')
                ? 'APPID 列表读取失败：等待“网页/移动应用”入口超时，未执行点击'
                : appIdsError.includes('Execution context was destroyed')
                  ? 'APPID 列表读取失败：页面跳转中断读取，请等待页面稳定后重试'
                  : 'APPID 列表读取失败：请检查网页/移动应用列表页面');
            }
          }
        } else {
          snapshots.push({
            tab: key === 'tab1' ? 'home' : 'riskManage',
            url: info.url,
            loaded: info.loaded,
            loginState: info.loginState,
            title: info.title,
            observedAt: new Date().toISOString(),
          });
        }
      }
      await log(yieldedForTransfer ? '该环境有待领转账，结束本轮巡检并交还环境' : '本轮巡检完成');
      result = { ...(yieldedForTransfer ? { yieldedForTransfer } : {}), status: mergeStatus(snapshots, passwordRejected), tabs: snapshots, ...(Object.keys(inspection).length ? { inspection } : {}),
        ...(appIdsAttempted ? { appIdsAttempted: true, appIds, appIdsError } : {}) };
    } catch (error) {
      await log(/(closed|disconnected|Target page|Browser has been)/i.test(error instanceof Error ? error.message : '')
        ? '巡检中断：浏览器被关闭或连接断开，本轮将重新启动浏览器再试'
        : '巡检失败：浏览器或页面访问异常，请检查环境和网络');
      result = {
        status: 'ENV_UNAVAILABLE',
        tabs: [],
        ...(appIdsAttempted ? { appIdsAttempted: true, appIds, appIdsError } : {}),
        error: error instanceof Error ? error.message.slice(0, 500) : 'AdsPower 浏览器环境不可用',
      };
    } finally {
      if (startRequested) {
        try {
          // 关闭 AdsPower 环境才会退出浏览器；只关闭 CDP 连接不够。
          await this.stop(profileId, timeoutMs);
          await log('已关闭本轮浏览器环境');
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'AdsPower 停止请求失败';
          const cleanupError = '关闭浏览器失败：' + detail;
          result = { ...result, status: 'ENV_UNAVAILABLE', error: [result.error?.slice(0, 240), cleanupError.slice(0, 250)].filter(Boolean).join('；') };
          await log('关闭本轮浏览器失败，请检查 AdsPower 环境');
        } finally {
          await browser?.close().catch(() => undefined);
        }
      }
    }
    return result;
  }

  async transfer(task: CollectorTransferTask, options: BrowserTransferOptions = {}) {
    const 日志 = options.日志 ?? (() => undefined);
    // 转账期间整个环境归它独占，监控任务要等转账（含重开浏览器的间隔）完全结束才能开始
    return this.独占环境(task.payerExternalId, '转账', 日志, () => this.执行转账(task, options));
  }

  private async 执行转账(task: CollectorTransferTask, options: BrowserTransferOptions) {
    const 日志 = options.日志 ?? (() => undefined);
    // 申请提交许可前可以重开浏览器；开始申请后只能等待或核对付款结果。
    for (let 第几次 = 1; ; 第几次 += 1) {
      if (options.isActive?.() === false) return { status: 'FAILED' as const, note: '任务已被中心停止，未提交付款' };
      let browser: Browser | undefined;
      let 要重开 = false;
      // 请求许可前置位，即使确认响应丢失也不会重新付款。
      const 状态 = { 已提交: false, 已输入密码: false };
      try {
        日志(第几次 === 1 ? '启动付款环境，等待浏览器就绪' : `第 ${第几次} 次重新启动付款环境，等待浏览器就绪`);
        const endpoint = await this.start(task.payerExternalId, 30000);
        browser = await connectWithRetry(endpoint, 30000);
        const context = browser.contexts()[0];
        if (!context) throw new Error('浏览器上下文不存在');
        // 浏览器被手动关闭时 CDP 连接会断开，主动感知并让执行立即失败，而不是卡在等待里
        let 浏览器已断开 = false;
        if (typeof browser.on === 'function') browser.on('disconnected', () => { 浏览器已断开 = true; });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        return await executeTransferPage(page, task, {
          是否活跃: () => options.isActive?.() !== false && !浏览器已断开,
          确认提交: options.authorizeSubmission,
          打码平台: options.打码平台,
          打码用户名: options.打码用户名,
          打码密码: options.打码密码,
          日志,
          状态,
          上报二维码: options.上报二维码,
          扫码等待分钟: options.扫码等待分钟,
          // 填表前先看登录 Cookie：和监控共用同一套证据，缺失就先登录
          是否已登录: async () => 是否已登录(await 读取登录证据(context, 'https://b.alipay.com')),
          // 转账页未登录时先登录：复用巡检的登录流程，凭据按转账单向中心索取
          重新登录: options.requestLogin ? async 登录页 => 执行登录流程(context, 登录页, (options.登录超时分钟 ?? 3) * 60_000, async 消息 => 日志(消息), {
            是否活跃: () => options.isActive?.() !== false && !浏览器已断开,
            请求登录凭据: options.requestLogin,
            标记密码错误: options.loginRejected,
            登录超时分钟: options.登录超时分钟,
            最大重试轮数: options.最大重试轮数 ?? 2,
            打码平台: options.打码平台,
            打码用户名: options.打码用户名,
            打码密码: options.打码密码,
            滑块补偿像素: options.滑块补偿像素,
          }) : undefined,
        });
      } catch (错误) {
        if (状态.已提交) {
          日志('★ 申请提交许可后执行中断，请核对支付宝流水');
          return { status: 'UNKNOWN' as const, note: '提交阶段执行中断，可能已经付款；禁止重复付款，请核对支付宝账单' };
        }
        要重开 = true;
        日志(`★ 付款环境执行中断（${错误 instanceof 需要重开浏览器 ? '第一阶段耗时过长' : (错误 instanceof Error ? 错误.message.split('\n')[0].slice(0, 80) : '未知错误')}），将关闭浏览器后重新开始；${状态.已输入密码 ? '已输入支付密码但' : ''}付款尚未提交`);
      } finally {
        await this.stop(task.payerExternalId, 30000).catch(() => undefined);
        await browser?.close().catch(() => undefined);
      }
      if (要重开) await new Promise(resolve => setTimeout(resolve, Math.min(30_000, 3000 * 第几次)));
    }
  }
  private async stop(profileId: string, timeoutMs: number) {
    const response = await fetchAdsPower(this.endpoint, `/api/v1/browser/stop?user_id=${encodeURIComponent(profileId)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      redirect: 'error',
      // 取消任务也要清理；至少留出 30 秒，容纳同端点 1Hz 队列中的并发请求。
      signal: AbortSignal.timeout(Math.max(timeoutMs, 30_000)),
    });
    const payload = await response.json() as ApiPayload;
    if (!response.ok || payload.code !== 0) throw new Error(payload.msg || `AdsPower 停止环境失败（${response.status}）`);
  }
  private async start(profileId: string, timeoutMs: number) {
    const response = await fetchAdsPower(this.endpoint, `/api/v1/browser/start?user_id=${encodeURIComponent(profileId)}&open_tabs=1&ip_tab=0`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json() as ApiPayload;
    if (!response.ok || payload.code !== 0) throw new Error(payload.msg || `AdsPower 启动环境失败（${response.status}）`);
    const data = payload.data ?? {};
    const ws = data.ws && typeof data.ws === 'object' ? data.ws as Record<string, unknown> : {};
    const direct = [ws.puppeteer, ws.cdp, ws.selenium].find(value => typeof value === 'string' && value.length > 0);
    if (typeof direct === 'string') return rewriteHost(direct, this.endpoint);
    const debuggerAddress = typeof data.debugger_address === 'string' ? data.debugger_address : '';
    if (!debuggerAddress) throw new Error('AdsPower 未返回浏览器调试地址');
    const version = await fetch(`http://${rewriteHost(debuggerAddress, this.endpoint)}/json/version`, {
      signal: AbortSignal.timeout(timeoutMs),
    }).then(response => response.json()) as { webSocketDebuggerUrl?: unknown };
    if (typeof version.webSocketDebuggerUrl !== 'string' || !version.webSocketDebuggerUrl) throw new Error('AdsPower 调试地址不可用');
    return rewriteHost(version.webSocketDebuggerUrl, this.endpoint);
  }
}

/**
 * 把 AdsPower 返回的 127.0.0.1 调试地址换成采集端配置的主机。
 * 调试端口每次启动都会变，所以只替换主机，保留原端口和路径。
 */
export function rewriteHost(value: string, endpoint: string) {
  const host = new URL(endpoint).hostname;
  if (value.includes('://')) {
    const url = new URL(value);
    url.hostname = host;
    return url.toString();
  }
  return value.replace(/^[^:/]+/, host);
}

/** 校验当前页面是否仍在目标业务路径，忽略查询参数和锚点。 */
export function sameDocument(current: string, target: string) {
  if (current === target) return true;
  try {
    const a = new URL(current);
    const b = new URL(target);
    return a.origin === b.origin && a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '');
  } catch {
    return false;
  }
}

/** 等调试端口就绪：连接失败时按短间隔重试，直到总时限用完。 */
export async function connectWithRetry(wsEndpoint: string, timeoutMs: number, attempts = 5): Promise<Browser> {
  const interval = Math.max(500, Math.min(3000, Math.floor(timeoutMs / (attempts * 2))));
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await chromium.connectOverCDP(wsEndpoint, { timeout: timeoutMs });
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('连接 AdsPower 调试端口失败');
}

function mergeStatus(tabs: BrowserTabSnapshot[], passwordRejected?: boolean): ScriptAccountStatus {
  if (passwordRejected) return 'PASSWORD_REJECTED' as ScriptAccountStatus;
  if (tabs.some(tab => tab.loginState === 'CAPTCHA_REQUIRED')) return 'CAPTCHA_REQUIRED';
  if (tabs.some(tab => tab.loginState === 'LOGIN_REQUIRED' || tab.loginState === 'QR_LOGIN_REQUIRED')) return 'LOGIN_REQUIRED';
  return tabs.length === 2 && tabs.every(tab => tab.loginState === 'LOGGED_IN') ? 'LOGGED_IN' : 'UNKNOWN';
}

function loginStateMessage(status: ScriptAccountStatus) {
  const messages: Partial<Record<ScriptAccountStatus | 'PASSWORD_REJECTED', string>> = {
    LOGGED_IN: '已登录', LOGIN_REQUIRED: '待登录', PASSWORD_REJECTED: '密码错误', QR_LOGIN_REQUIRED: '待扫码登录',
    CAPTCHA_REQUIRED: '需要人工验证', PAGE_ERROR: '页面异常',
    ENV_UNAVAILABLE: '浏览器环境不可用', UNKNOWN: '未知',
  };
  return messages[status] ?? messages.UNKNOWN;
}
