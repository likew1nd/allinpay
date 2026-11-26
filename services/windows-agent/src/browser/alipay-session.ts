import type { BrowserContext, Frame, Page } from 'playwright-core';

/**
 * 登录证据（Cookie 检查结果）
 */
export interface 登录证据 {
  /** 业务域下能读到的 Cookie 名集合 */
  Cookie名称集合: Set<string>;
  /** 命中的已登录 Cookie 名 */
  已匹配Cookie: string[];
  /** 会话剩余毫秒数（从 auth_jwt 读取），null 表示无效或过期 */
  会话剩余毫秒: number | null;
}

/**
 * 登录阻塞类型
 */
export type 登录阻塞类型 = '验证码' | '人工验证' | '密码错误' | '可重试' | '已拒绝' | null;

/**
 * 内部检测脚本返回的类型（英文字符串）
 */
type 内部阻塞类型 = 'captcha' | 'verification' | 'rejected' | 'retryable' | null;

/**
 * 自动登录结果
 */
export type 自动登录结果 = '已登录' | '等待中' | '遇到验证码' | '无法登录';

/**
 * 已登录时才存在的 Cookie 标记
 * 依据 2026-11-07 实测：登录时全部存在，退出后全部消失
 */
const 已登录Cookie标记 = ['LoginForm', 'alipay', 'CLUB_ALIPAY_COM', 'iw.userid', 'ali_apache_tracktmp'];

/**
 * 判断网址是否为支付宝登录页
 */
export function 是支付宝登录页(网址: string): boolean {
  try {
    const url = new URL(网址);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      /^(?:auth|authe[a-z0-9]+|authsa[0-9]+)\.alipay\.com$/.test(url.hostname) &&
      /^\/login(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}

/**
 * 判断网址是否为支付宝业务域
 */
export function 是支付宝业务域(网址: string): boolean {
  try {
    return new URL(网址).origin === 'https://b.alipay.com';
  } catch {
    return false;
  }
}

/**
 * 从 CDP 读取业务域 Cookie 作为登录证据
 * 只读取名称与 auth_jwt 过期时间，不返回值、不发额外请求
 */
export async function 读取登录证据(上下文: BrowserContext, 来源域: string): Promise<登录证据> {
  const 空证据: 登录证据 = { Cookie名称集合: new Set(), 已匹配Cookie: [], 会话剩余毫秒: null };

  try {
    // 复用当前页面，避免为了读 Cookie 新建标签
    const 页面 = 上下文.pages().find(p => !p.isClosed());
    if (!页面) return 空证据;

    const CDP会话 = await 上下文.newCDPSession(页面);
    try {
      const { cookies } = await CDP会话.send('Network.getCookies', { urls: [来源域] }) as { cookies?: { name: string; value: string }[] };
      const Cookie名称集合 = new Set((cookies ?? []).map(cookie => cookie.name));
      const 已匹配Cookie = 已登录Cookie标记.filter(name => Cookie名称集合.has(name));

      // 解析 auth_jwt 获取会话剩余时间
      let 会话剩余毫秒: number | null = null;
      const jwt = (cookies ?? []).find(cookie => cookie.name === 'auth_jwt')?.value;
      if (jwt) {
        const payload = jwt.split('.')[1];
        if (payload) {
          const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
          const parsed = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { exp?: unknown };
          if (typeof parsed.exp === 'number' && Number.isFinite(parsed.exp)) {
            const 剩余 = parsed.exp - Date.now();
            会话剩余毫秒 = 剩余 > 0 ? 剩余 : null;
          }
        }
      }

      return { Cookie名称集合, 已匹配Cookie, 会话剩余毫秒 };
    } finally {
      await CDP会话.detach().catch(() => undefined);
    }
  } catch {
    return 空证据;
  }
}

/**
 * 判断是否已登录（命中半数以上 Cookie 标记）
 */
export function 是否已登录(证据: 登录证据): boolean {
  return 证据.已匹配Cookie.length >= Math.ceil(已登录Cookie标记.length / 2);
}

/**
 * 检测页面登录阻塞状态的脚本
 * 在浏览器内执行，只返回阻塞类型，不返回页面全文
 */
const 检测阻塞脚本 = `(() => {
  // 可见性判定需与 Playwright 的 isVisible 对齐
  const 是否显示 = (元素) => {
    if (!元素) return false;
    const 样式 = getComputedStyle(元素);
    if (样式.display === 'none' || 样式.visibility === 'hidden' || 样式.visibility === 'collapse') return false;
    if (Number(样式.opacity) === 0 || 样式.pointerEvents === 'none') return false;
    if (元素.closest('[hidden]')) return false;
    const 位置 = 元素.getBoundingClientRect();
    if (!(位置.width > 0 && 位置.height > 0)) return false;
    // 已滚出视口的元素不视为当前验证码
    return 位置.bottom > 0 && 位置.right > 0 && 位置.top < innerHeight && 位置.left < innerWidth;
  };

  // 检查验证码容器
  for (const 元素 of document.querySelectorAll('.jshield-captcha-click-container.click, .jshield-captcha-puzzle-container.puzzle, .jshield-captcha-clickpuzzle-container.clickpuzzle')) {
    if (是否显示(元素)) return 'captcha';
  }

  const 文本 = document.body?.innerText || '';

  // 仅当页面没有登录表单时才把文案当作验证码信号，避免登录页残留文案误报
  if (!document.querySelector('#login #J-input-user')) {
    if (/(安全验证|安全校验|滑块验证|拖动.{0,8}滑块|请完成验证|依次点击|按顺序点击|点击图中|captcha)/i.test(文本)) {
      return 'captcha';
    }
  }

  if (/(账号或密码错误|账户名或密码错误|(?:账号名|账户名)或登录密码不正确|密码不正确|登录密码有误|密码错误)/.test(文本)) {
    return 'rejected';
  }
  if (/登录失败.{0,30}扫码登录/.test(文本)) {
    return 'retryable';
  }
  if (/(登录受限|请输入.{0,8}短信验证码|短信校验码|发送至.{0,30}验证码|请在手机.{0,12}确认|扫码完成验证)/.test(文本)) {
    return 'verification';
  }

  return null;
})()`;

/**
 * 读取页面登录阻塞状态
 * 只读取验证类型，不取回账号、密码或页面正文
 */
export async function 读取登录阻塞(页面: Page): Promise<登录阻塞类型> {
  const 所有帧结果 = await Promise.all(页面.frames().map(async (帧): Promise<内部阻塞类型> => {
    // 检查非主帧的可见性
    if (帧 !== 页面.mainFrame()) {
      const 元素 = await 帧.frameElement().catch(() => null);
      if (!元素) return null;
      try {
        if (!await 元素.isVisible()) return null;
      } finally {
        await 元素.dispose();
      }
    }
    return await 帧.evaluate(检测阻塞脚本).catch(() => null) as 内部阻塞类型;
  }));

  // 优先级：验证码 > 密码错误 > 其他
  if (所有帧结果.includes('captcha')) return '验证码';
  if (所有帧结果.includes('rejected' as any)) return '已拒绝';
  if (所有帧结果.includes('verification' as any)) return '人工验证';
  if (所有帧结果.includes('retryable' as any)) return '可重试';
  return null;
}

/**
 * 查找登录表单所在的 Frame
 */
async function 查找登录表单帧(页面: Page): Promise<Frame | undefined> {
  if (!是支付宝登录页(页面.url()) && !是支付宝业务域(页面.url())) return;

  for (const 帧 of 页面.frames()) {
    if (!是支付宝登录页(帧.url())) continue;
    if (帧 === 页面.mainFrame()) return 帧;

    const 元素 = await 帧.frameElement().catch(() => null);
    if (!元素) continue;
    try {
      if (await 元素.isVisible()) return 帧;
    } finally {
      await 元素.dispose();
    }
  }
}

/**
 * 自动填写登录表单（账号密码）
 */
export async function 自动填写登录表单(
  页面: Page,
  超时毫秒: number,
  记录日志: (消息: string) => Promise<void>,
  选项: {
    是否活跃?: () => boolean;
    请求登录凭据?: () => Promise<{
      status: 'ready' | 'missing' | 'cooldown' | 'blocked' | 'stopped';
      loginAccount?: string;
      password?: string;
      onRejected?: () => Promise<void>;
    }>;
  }
): Promise<自动登录结果> {
  const 活跃 = () => 选项.是否活跃?.() !== false;
  const 操作超时 = Math.min(超时毫秒, 15_000);
  let 登录凭据: any;

  try {
    if (!活跃()) return '等待中';

    const 初始帧 = await 查找登录表单帧(页面);
    if (!初始帧 || !选项.请求登录凭据) return '等待中';

    let 表单帧 = 初始帧;
    let 密码框 = 表单帧.locator('#login #password_rsainput');

    // 如果密码框不可见，切换到账密登录
    if (!await 密码框.isVisible()) {
      const 切换按钮 = 表单帧.getByText('账密登录', { exact: true });
      if (!活跃() || !await 切换按钮.isVisible()) {
        await 记录日志('未找到可用的账密登录入口，请检查当前登录页面');
        return '等待中';
      }
      await 切换按钮.click({ timeout: 操作超时 });
      await 密码框.waitFor({ state: 'visible', timeout: 操作超时 });
    }

    const 账号框 = 表单帧.locator('#login #J-input-user');
    const 提交按钮 = 表单帧.locator('#login #J-login-simulate-btn');

    // 验证表单结构和来源
    const 验证表单 = async () => {
      if ((!是支付宝登录页(页面.url()) && !是支付宝业务域(页面.url())) ||
          !是支付宝登录页(表单帧.url())) {
        return false;
      }

      const 表单信息 = await 表单帧.evaluate(`(() => {
        const 表单 = document.querySelector('#login');
        const 字段 = ['#J-input-user', '#password_rsainput', '#J-login-simulate-btn'].map(选择器 => document.querySelectorAll(选择器));
        const 可见 = 元素 => {
          if (!元素 || 元素.closest('[hidden]') || getComputedStyle(元素).visibility !== 'visible') return false;
          if (元素.checkVisibility && !元素.checkVisibility({ checkVisibilityCSS: true })) return false;
          const 位置 = 元素.getBoundingClientRect();
          return 位置.width > 0 && 位置.height > 0;
        };
        return {
          action: 表单?.action || '',
          valid: 表单?.getAttribute('method')?.toLowerCase() === 'post' &&
            字段.every(匹配 => 匹配.length === 1 && 表单 === 匹配[0].form && 可见(匹配[0]))
        };
      })()`) as { action: string; valid: boolean };

      return 表单信息.valid && 是支付宝登录页(表单信息.action);
    };

    if (!活跃() || !await 验证表单()) {
      await 记录日志('登录表单来源或结构不匹配，暂停自动登录');
      return '等待中';
    }

    // 请求登录凭据
    登录凭据 = await 选项.请求登录凭据();
    if (登录凭据.status !== 'ready') {
      const 状态消息 = {
        missing: '未设置浏览器登录账号或密码，请先编辑环境账号',
        cooldown: '自动登录处于冷却时间，暂不重复提交',
        blocked: '登录凭据曾被拒绝，请修正并保存环境账号信息后重试',
        stopped: '巡检任务已停止，取消自动登录',
      };
      await 记录日志(状态消息[登录凭据.status as keyof typeof 状态消息]);
      // 缺凭据、被拒绝、冷却中、任务已停止：本轮没有可用凭据，重试也没有意义，交给主流程直接结束
      return '无法登录';
    }

    // 填写账号密码并提交
    if (!活跃() || !await 验证表单()) return '等待中';

    await 记录日志('正在填写浏览器登录账号和密码');
    const 填写开始时间 = Date.now();

    await 账号框.fill(登录凭据.loginAccount, { timeout: 操作超时 });
    if (!活跃() || !await 验证表单()) return '等待中';

    await 密码框.fill(登录凭据.password, { timeout: 操作超时 });
    await 密码框.press('Tab', { timeout: 操作超时 });
    if (!活跃() || !await 验证表单()) return '等待中';

    await 记录日志(`账号密码填写完成（耗时 ${Date.now() - 填写开始时间} 毫秒）`);
    await 记录日志('提交浏览器登录');
    await 提交按钮.click({ timeout: 操作超时 });

    // 等待提交结果（最多15秒）
    const 等待截止 = Date.now() + 操作超时;
    while (Date.now() < 等待截止 && 活跃()) {
      const 阻塞 = await 读取登录阻塞(页面);

      // 遇到验证码，返回让外层处理
      if (阻塞 === '验证码') {
        return '遇到验证码';
      }

      // 密码错误
      if (阻塞 === '已拒绝') {
        if (登录凭据.onRejected) await 登录凭据.onRejected();
        await 记录日志('页面提示账号或密码错误，已暂停自动登录，请编辑账号信息');
        return '等待中';
      }

      // 需要人工验证
      if (阻塞 === '人工验证') {
        await 记录日志('登录需要额外确认，请按当前标签提示完成扫码、短信或手机验证');
        return '等待中';
      }

      // 已跳转到业务域
      if (是支付宝业务域(页面.url())) {
        await 记录日志('浏览器登录成功');
        return '已登录';
      }

      await 页面.waitForTimeout(250);
    }

    await 记录日志('提交后 15 秒内没有出现明确结果，继续等待验证码或登录跳转');
    return '等待中';

  } catch (错误) {
    await 记录日志('自动登录未完成，请检查登录页面或网络，稍后再试');
    return '等待中';
  } finally {
    // 清除内存中的密码
    if (登录凭据?.status === 'ready') {
      登录凭据.password = '';
    }
  }
}
