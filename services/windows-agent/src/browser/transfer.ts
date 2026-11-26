import type { Frame, Page } from 'playwright-core';
import type { CollectorTransferTask, CollectorTransferReport } from '../../../../contracts/transfer-collector.js';
import { 关闭旋转验证码, 处理旋转验证码, 旋转验证码可见 } from './captcha-handler.js';
import type { 打码平台类型 } from './captcha-solver.js';


export const TRANSFER_URL = 'https://b.alipay.com/page/bizfund/transfer/toAccount/fillin';

/** 第一阶段单个周期时长：到不了“下一步”就刷新重来 */
export const 阶段一周期毫秒 = 90_000;
/** 付款提交后普通结果页最多观察五分钟，扫码确认有独立限时。 */
const 结果等待毫秒 = 300_000;
/** 第一阶段累计耗时上限：超过就放弃当前浏览器，由调用方关闭并重新拉起（钱没动，可无限重来） */
export const 阶段一重开毫秒 = 8 * 60_000;
/** 供操作员查看的步骤日志。 */
export const 阶段标记 = { 已到达下一步: '[#到达下一步]', 已点击下一步: '[#已点击下一步]' } as const;
/** 第一阶段耗时过长，要求调用方重开浏览器重新执行（付款之前才会返回它） */
export class 需要重开浏览器 extends Error {}
/** 心跳日志间隔 */
export const 心跳间隔毫秒 = 3000;
/** 扫码确认：二维码发出后最多等待的时长，到点仍未完成验证就回报失败（二维码本身有效期 30 分钟） */
export const 默认扫码等待分钟 = 8;
export const 扫码等待毫秒 = 默认扫码等待分钟 * 60_000;
/** 实际时长取脚本设置的 qrWaitMinutes：1~25 分钟（二维码有效期 30 分钟，留出余量），缺省或非法值回到默认 */
export const 规范扫码等待分钟 = (值: number | undefined): number => typeof 值 === 'number' && Number.isInteger(值) && 值 >= 1 && 值 <= 25 ? 值 : 默认扫码等待分钟;
/** 二维码截图体积上限（JPEG 字节）：比终态截图宽松，二维码必须清晰可扫；base64 后约 533KB，中心 DTO 上限 700KB */
export const 二维码截图上限字节 = 400_000;

// ───────────────────────── 纯函数：页面状态判断（可脱离浏览器单测） ─────────────────────────

export type 页面状态 =
  | '登录页'
  | '结果页'
  | '验证码'
  | '重复转账提醒'
  | '安全校验'
  | '确认信息加载中'
  | '确认信息'
  | '页面错误'
  | '填表页'
  | '未知';

export interface 页面快照 {
  url: string;
  验证码可见: boolean;
  /** 可见弹窗的标题列表（必须已过滤隐藏的弹窗，安全校验关闭后 DOM 仍留在页面里） */
  弹窗标题: string[];
  密码框架存在: boolean;
  错误文案: string;
  填表可见: boolean;
  /** 支付宝“您已转账过一笔相同金额的订单，请确认是否需要再次转账”确认框是否可见（需点“继续转账”） */
  重复转账提醒?: boolean;
}

export function 判断页面状态(快照: 页面快照): 页面状态 {
  if (/^https:\/\/(?:auth|authe[a-z0-9]+|authsa[0-9]+)\.alipay\.com\//.test(快照.url)) return '登录页';
  if (/\/transfer\/(?:toAccount\/result|detail)/.test(快照.url)) return '结果页';
  if (快照.验证码可见) return '验证码';
  if (快照.重复转账提醒) return '重复转账提醒';
  if (快照.弹窗标题.some(标题 => /安全校验/.test(标题))) return '安全校验';
  if (快照.弹窗标题.some(标题 => /确认信息/.test(标题))) return 快照.密码框架存在 ? '确认信息' : '确认信息加载中';
  if (快照.错误文案) return '页面错误';
  if (快照.填表可见) return '填表页';
  return '未知';
}

/** 页面提示这类文案时，刷新也不会好，直接放弃本单（钱没动） */
export function 是不可恢复错误(文案: string): boolean {
  return /(收款.{0,6}(不存在|异常|受限|被限制)|账户.{0,4}(不存在|已注销|被冻结|受限)|余额不足|超(过|出).{0,6}限额|无权限|未开通)/.test(文案);
}

/** 备注最多 20 字，且金额不足 1 元时支付宝不允许填写 */
export function 规范备注(备注: string | null | undefined, 金额: string): string {
  const 文本 = (备注 ?? '').trim().slice(0, 20);
  return Number(金额) >= 1 ? 文本 : '';
}

/** 从确认弹窗文字里提取收款账号、付款账号和金额 */
export function 解析确认信息(文本: string): { 收款: string; 付款: string; 金额: string } {
  const 取 = (标签: string) => 文本.match(new RegExp(标签 + '\\s*\\n\\s*([^\\n]+)'))?.[1]?.trim() ?? '';
  const 金额 = 文本.match(/付款总额\s*\n\s*([\d,]+(?:\.\d+)?)\s*元/)?.[1]?.replace(/,/g, '') ?? '';
  return { 收款: 取('收款账号'), 付款: 取('付款账号'), 金额 };
}

/** 脱敏账号（如 268***@qq.com、177****2088）能否对上完整账号：星号段当作任意字符，其余必须逐段一致 */
export function 脱敏账号匹配(脱敏: string, 完整: string): boolean {
  const 压缩 = (值: string) => 值.replace(/\s+/g, '').toLowerCase();
  const a = 压缩(脱敏);
  const b = 压缩(完整);
  if (!a || !b) return false;
  if (!a.includes('*')) return a === b;
  const 模式 = new RegExp('^' + a.split(/\*+/).map(段 => 段.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return 模式.test(b);
}

/**
 * 核对确认弹窗和任务是否一致。只核对账号、金额和付款账号，不核对姓名：
 * 企业账号显示成“****司 312934990@qq.com”，个人账号显示成“*健 17705582088”，姓名不可靠。
 * 返回空数组表示全部一致，否则返回不一致的项目名。
 */
export function 核对确认信息(
  信息: { 收款: string; 付款: string; 金额: string },
  任务: Pick<CollectorTransferTask, 'amount' | 'payee' | 'payerLoginAccount'>,
): string[] {
  const 不符: string[] = [];
  const 压缩 = (值: string) => 值.replace(/\s+/g, '');
  // 收款文本形如“*健 17705582088”或“****司 312934990@qq.com”，按空白拆开后逐段比对，兼容脱敏显示
  const 收款命中 = 压缩(信息.收款).toLowerCase().includes(压缩(任务.payee.account).toLowerCase())
    || 信息.收款.split(/\s+/).some(段 => 脱敏账号匹配(段, 任务.payee.account));
  if (!收款命中) 不符.push('收款账号');
  if (Number(信息.金额) !== Number(任务.amount) || !信息.金额) 不符.push('金额');
  if (任务.payerLoginAccount && !压缩(信息.付款).toLowerCase().includes(压缩(任务.payerLoginAccount).toLowerCase())) 不符.push('付款账号');
  return 不符;
}

// ───────────────────────── 进度日志（3 秒心跳） ─────────────────────────

export type 转账日志写入 = (消息: string) => void;

/**
 * 当前步骤 + 心跳：任何时候都在“做某件事”或“等某个东西”，每 3 秒报一次，
 * 脚本卡住时能直接看到卡在哪个步骤、等了多久、页面现在是什么状态。
 * 日志里只写页面状态描述，不写账号、姓名、密码。
 */
export class 进度播报 {
  private 步骤 = '准备';
  private 步骤开始 = Date.now();
  private 阶段 = '准备';
  private 开始 = Date.now();
  private 页面 = '';
  private 定时器?: NodeJS.Timeout;
  constructor(private readonly 写入: 转账日志写入) {}

  启动() { this.定时器 = setInterval(() => this.心跳(), 心跳间隔毫秒); this.定时器.unref(); }
  停止() { if (this.定时器) clearInterval(this.定时器); this.定时器 = undefined; }
  设置阶段(阶段: string) { this.阶段 = 阶段; }
  设置页面(描述: string) { this.页面 = 描述; }
  设置步骤(步骤: string) {
    if (步骤 === this.步骤) return;
    this.步骤 = 步骤;
    this.步骤开始 = Date.now();
    this.发送();
  }
  /** 一次性事件单独记录，保留周期结束原因和核对提示。 */
  事件(消息: string) {
    const 总计 = Math.round((Date.now() - this.开始) / 1000);
    this.写入(`[${this.阶段}|${Math.floor(总计 / 60)}m${String(总计 % 60).padStart(2, '0')}s] ★ ${消息}`);
  }
  private 心跳() { this.发送(); }
  private 发送() {
    const 已等 = Math.round((Date.now() - this.步骤开始) / 1000);
    const 总计 = Math.round((Date.now() - this.开始) / 1000);
    const 页面 = this.页面 ? `；页面：${this.页面}` : '';
    this.写入(`[${this.阶段}|${Math.floor(总计 / 60)}m${String(总计 % 60).padStart(2, '0')}s] ${this.步骤}（已等 ${已等} 秒）${页面}`);
  }
  结束(消息: string) { this.停止(); this.写入(消息); }
}

// ───────────────────────── 浏览器操作 ─────────────────────────

export interface 转账执行状态 {
  /** 已进入提交许可请求阶段，之后的异常不能重开浏览器付款。 */
  已提交: boolean;
  /** 已把支付密码填进输入框（仅用于日志说明） */
  已输入密码: boolean;
}

export interface 转账执行选项 {
  /** 登录页处理：由调用方接入现有登录流程，登上返回 true */
  重新登录?: (页面: Page) => Promise<boolean>;
  /** 读取 Cookie 判断当前是否已登录（和监控用同一套证据）；缺省时只靠页面是否被跳到登录页判断 */
  是否已登录?: () => Promise<boolean>;
  /** 任务是否仍被允许（不可逆点之前才检查） */
  是否活跃?: () => boolean;
  确认提交?: () => Promise<void>;
  /** 打码平台配置：由中心随配置下发，转账页出现验证码时自动截图识别（账号密码只在内存中使用） */
  打码平台?: 打码平台类型;
  打码用户名?: string;
  打码密码?: string;
  日志?: 转账日志写入;
  /** 与调用方共享的执行状态，浏览器被关闭导致本函数来不及返回时，调用方靠它判断是否可以重开 */
  状态?: 转账执行状态;
  /** 扫码确认最多等待的分钟数（脚本设置），缺省或非法值用默认 8 分钟 */
  扫码等待分钟?: number;
  /** 出现扫码确认页时上报二维码截图（JPEG data URL）、页面标注的有效期原文和等待分钟数；只会调用一次 */
  上报二维码?: (图片: string, 有效期文案: string | undefined, 等待分钟: number) => void;
}

/** 页面或浏览器已被关闭：刷新、重试都没有意义，必须交给调用方处理（重开浏览器或按未知结束） */
export class 浏览器已丢失 extends Error {}
const 是浏览器丢失 = (错误: unknown) =>
  错误 instanceof 浏览器已丢失 || (错误 instanceof Error && /(Target (page, context or browser has been|closed)|browser has been closed|Browser closed|has been closed|Connection closed|Protocol error.*closed|Target closed)/i.test(错误.message));

const 取页面快照 = async (页面: Page): Promise<页面快照> => {
  const url = 页面.url();
  const 验证码可见 = await 旋转验证码可见(页面);
  const 主文档 = await 页面.evaluate(() => {
    const 可见 = (元素: Element) => (元素 as HTMLElement).offsetParent !== null;
    // Modal.confirm 的标题类名是 ant-modal-confirm-title，普通弹窗才是 ant-modal-title
    const 弹窗标题 = [...document.querySelectorAll('.ant-modal')].filter(可见)
      .map(弹窗 => (弹窗.querySelector('.ant-modal-title,.ant-modal-confirm-title') as HTMLElement | null)?.innerText?.trim() ?? '');
    const 重复转账提醒 = [...document.querySelectorAll('.ant-modal-confirm')]
      .some(弹窗 => 可见(弹窗) && /转账过一笔相同金额|相同金额的订单|再次转账/.test((弹窗 as HTMLElement).innerText));
    const 错误 = [...document.querySelectorAll('.ant-message-error,.ant-message-notice-error,.ant-form-item-explain-error')]
      .filter(可见).map(元素 => (元素 as HTMLElement).innerText.trim()).filter(Boolean).join('；').slice(0, 120);
    return { 弹窗标题, 错误, 重复转账提醒, 填表可见: !!document.querySelector('#payeeAccount') && 可见(document.querySelector('#payeeAccount')!) };
  }).catch(() => ({ 弹窗标题: [] as string[], 错误: '', 重复转账提醒: false, 填表可见: false }));
  const 密码框架存在 = !!查找密码框架(页面);
  return { url, 验证码可见, 弹窗标题: 主文档.弹窗标题, 密码框架存在, 错误文案: 主文档.错误, 填表可见: 主文档.填表可见, 重复转账提醒: 主文档.重复转账提醒 };
};

/** 支付密码在跨域 iframe（pcauth-site）里，每次都重新查找，不缓存旧句柄 */
const 查找密码框架 = (页面: Page): Frame | undefined =>
  页面.frames().find(帧 => /^https:\/\/pcauth-site\.alipay\.com\//.test(帧.url()));

/** 扫码确认页（pcauth iframe 里的“请以下用户打开支付宝App扫码验证身份”）：输入支付密码后支付宝可能要求管理员扫码 */
export function 是扫码确认页(文本: string): boolean {
  return /扫码验证身份|二维码发送验证通知/.test(文本);
}

/** 取二维码有效截止时间原文（如“24日14时38分”），取不到返回 undefined；只用于群消息展示 */
export function 解析扫码有效期(文本: string): string | undefined {
  return 文本.replace(/\s+/g, '').match(/请于(\d{1,2}日\d{1,2}时\d{1,2}分)前完成验证/)?.[1];
}

/** 扫码确认的共享状态：二维码只上传一次，等待时间从第一次出现算起，页面反复进出也不重新计时 */
export interface 扫码状态 { 起点: number; 已上传: boolean; 尝试: number }

/** 当前是否停在扫码确认页：只读页面文字，不做任何点击 */
async function 识别扫码页(页面: Page): Promise<{ 有效期?: string } | undefined> {
  const 帧 = 查找密码框架(页面);
  if (!帧) return undefined;
  const 文本 = await 帧.evaluate(() => document.body?.innerText ?? '').catch(() => '');
  return 是扫码确认页(文本) ? { 有效期: 解析扫码有效期(文本) } : undefined;
}

/**
 * 截取二维码：优先截 iframe 元素，失败退回整页。JPEG 质量不低于 70（二维码必须能扫），
 * 超限就换下一个候选，绝不为了压体积而降到扫不出；全部失败返回 undefined。
 */
async function 截取二维码截图(页面: Page): Promise<string | undefined> {
  const 框 = 页面.locator('#security-iframe').first();
  const 候选 = [
    () => 框.screenshot({ type: 'jpeg', quality: 85, scale: 'css', timeout: 5000 }),
    () => 框.screenshot({ type: 'jpeg', quality: 70, scale: 'css', timeout: 5000 }),
    () => 页面.screenshot({ type: 'jpeg', quality: 70, scale: 'css', timeout: 5000 }),
  ];
  for (const 截 of 候选) {
    if (页面.isClosed()) return undefined;
    const 图片 = await 截().catch(() => undefined);
    if (图片 && 图片.length <= 二维码截图上限字节) return `data:image/jpeg;base64,${图片.toString('base64')}`;
  }
  return undefined;
}

const 格式化剩余 = (毫秒: number) => {
  const 秒 = Math.max(0, Math.ceil(毫秒 / 1000));
  return `${Math.floor(秒 / 60)}:${String(秒 % 60).padStart(2, '0')}`;
};

/**
 * 扫码确认：截取二维码上报（中心发到 TG 群），然后等人扫码，最多等 扫码等待毫秒。
 * - 返回 SUCCEEDED / FAILED：详情页给出了明确结果；返回 UNKNOWN：任务被中心结束或浏览器被关；
 * - 返回 FAILED + QR_TIMEOUT：等满仍无结果。已点过“下一步”，按需求判失败；二维码仍可能被晚扫，
 *   由中心在群里提示作废，并靠人工核对流水兜底。页面保持原样交给上层截终态截图，随后调用方关闭浏览器；
 * - 返回 undefined：扫码页已消失（跳走或刷新），回到常规结果判断。
 */
export async function 等待扫码完成(页面: Page, 选项: 转账执行选项, 播报: 进度播报, 扫码: 扫码状态, 有效期: string | undefined): Promise<CollectorTransferReport | undefined> {
  const 等待分钟 = 规范扫码等待分钟(选项.扫码等待分钟);
  if (!扫码.起点) {
    扫码.起点 = Date.now();
    播报.事件(`出现扫码确认页，截取二维码发送到 TG 群，最多等待 ${等待分钟} 分钟${有效期 ? `（二维码有效期至 ${有效期}）` : ''}`);
  }
  // 截图失败最多再试两次（共 3 次），之后不再重试，只按超时规则等待
  if (!扫码.已上传 && 扫码.尝试 < 3) {
    扫码.尝试 += 1;
    const 图片 = await 截取二维码截图(页面);
    if (!图片) 播报.事件(`二维码截图失败（第 ${扫码.尝试} 次），暂无法发到 TG 群`);
    else if (!选项.上报二维码) { 扫码.已上传 = true; 播报.事件('未接入二维码上报，无法发到 TG 群'); }
    else { 选项.上报二维码(图片, 有效期, 等待分钟); 扫码.已上传 = true; 播报.事件('二维码已提交上报，等待扫码'); }
  }
  while (Date.now() - 扫码.起点 < 等待分钟 * 60_000) {
    if (选项.是否活跃?.() === false) return { status: 'UNKNOWN', note: '已点击“下一步”后任务被中心结束或浏览器被关闭，可能已经付款；禁止重复付款，请核对支付宝账单' };
    播报.设置页面('扫码确认页，等待扫码');
    播报.设置步骤(`等待扫码，剩余 ${格式化剩余(等待分钟 * 60_000 - (Date.now() - 扫码.起点))}`);
    await 页面.waitForTimeout(3000);
    const url = 页面.url();
    if (/\/transfer\/detail/.test(url)) {
      const 结果 = await 取详情结果(页面);
      if (结果.成功) return { status: 'SUCCEEDED', note: '扫码验证通过，支付宝页面确认转账成功' };
      if (结果.失败) return { status: 'FAILED', note: `支付宝详情页显示失败：${结果.文本}` };
      continue;
    }
    if (/\/transfer\/toAccount\/result/.test(url)) continue;
    if (!await 识别扫码页(页面)) { 播报.事件('扫码确认页已消失，回到常规结果判断'); return undefined; }
  }
  播报.事件(`扫码确认等待满 ${等待分钟} 分钟仍未完成，本笔按失败结束`);
  return { status: 'FAILED', failureCode: 'QR_TIMEOUT', note: `扫码确认超时（${等待分钟} 分钟），已按失败结束；二维码请勿再扫，如有人晚扫请核对支付宝流水` };
}

const 页面状态描述 = (状态: 页面状态, 快照: 页面快照) =>
  状态 === '确认信息加载中' ? '确认信息已出现，支付密码控件尚未加载'
    : 状态 === '页面错误' ? `页面提示：${快照.错误文案}`
      : 状态;

/** 支付宝提示“已转账过相同金额的订单”：点“继续转账”即可进入后续步骤，此时尚未提交付款 */
async function 点击继续转账(页面: Page): Promise<void> {
  const 按钮 = 页面.locator('.ant-modal-confirm .ant-modal-confirm-btns button.ant-btn-primary').filter({ hasText: /继\s*续\s*转\s*账/ }).first();
  // 点击失败不影响循环，下一轮仍会看到这个弹窗并重试
  await 按钮.click({ timeout: 5000 }).catch(() => undefined);
}

async function 点击立即转账(页面: Page): Promise<void> {
  const 按钮 = 页面.locator('button.ant-btn-primary', { hasText: '立即转账' }).first();
  // 点击超时不代表没点到：验证码弹出后会盖住按钮，所以超时只当作已发出，交给状态循环判断
  await 按钮.click({ timeout: 5000 }).catch(() => undefined);
}

async function 填写表单(页面: Page, 任务: CollectorTransferTask, 播报: 进度播报, 处理验证码填表: () => Promise<void>) {
  播报.设置步骤('关闭经营助手气泡');
  const 气泡 = 页面.locator('[class*=closeIcon]').first();
  if (await 气泡.isVisible().catch(() => false)) await 气泡.click({ timeout: 3000 }).catch(() => undefined);

  播报.设置步骤('填写收款账号');
  await 处理验证码填表();
  await 页面.locator('#payeeAccount').fill(任务.payee.account, { timeout: 8000 });
  await 页面.locator('#payeeAccount').blur();
  await 页面.waitForTimeout(1200);

  播报.设置步骤('填写转账金额');
  await 处理验证码填表();
  await 页面.locator('#money').fill(任务.amount, { timeout: 8000 });
  await 页面.locator('#money').blur();
  await 页面.waitForTimeout(1000);

  const 备注 = 规范备注(任务.remark, 任务.amount);
  if (备注) {
    播报.设置步骤('填写转账备注');
    await 处理验证码填表();
    await 页面.locator('#remark').fill(备注, { timeout: 8000 }).catch(() => undefined);
  }

  // 读回只做记录，不再作废周期：输入框读回的值常带格式（大小写、千分位、空格），把它当硬条件会让每个周期都死在这里。
  // 真正的把关在“确认信息”弹窗里核对收款账号和金额，那里显示的是支付宝最终采用的值。
  const 实际 = await 页面.evaluate(() => ({
    账号: (document.querySelector('#payeeAccount') as HTMLInputElement | null)?.value ?? '',
    金额: (document.querySelector('#money') as HTMLInputElement | null)?.value ?? '',
  }));
  const 账号一致 = 实际.账号.replace(/\s+/g, '').toLowerCase() === 任务.payee.account.replace(/\s+/g, '').toLowerCase();
  const 金额一致 = Number(实际.金额.replace(/[^\d.]/g, '')) === Number(任务.amount);
  if (!账号一致 || !金额一致) {
    const 脱敏 = (值: string) => 值.replace(/\d{4,}/g, m => m.slice(0, 3) + '****');
    播报.事件(`表单读回与任务不一致（${账号一致 ? '' : `账号=“${脱敏(实际.账号)}”（${实际.账号.length}位） `}${金额一致 ? '' : `金额=“${实际.金额}” `}），重新填写一次`);
    if (!账号一致) { await 页面.locator('#payeeAccount').fill(任务.payee.account, { timeout: 8000 }); await 页面.locator('#payeeAccount').blur(); await 页面.waitForTimeout(1200); }
    if (!金额一致) { await 页面.locator('#money').fill(任务.amount, { timeout: 8000 }); await 页面.locator('#money').blur(); await 页面.waitForTimeout(1000); }
  }

  播报.设置步骤('等待“立即转账”按钮可点击');
  await 页面.locator('button.ant-btn-primary', { hasText: '立即转账' }).first().waitFor({ state: 'visible', timeout: 15_000 });
  for (let i = 0; i < 30; i += 1) {
    if (await 页面.locator('button.ant-btn-primary', { hasText: '立即转账' }).first().isEnabled().catch(() => false)) break;
    await 处理验证码填表();
    await 页面.waitForTimeout(500);
  }
}

class 本周期作废 extends Error {}
class 放弃本单 extends Error {}

/** 解析安全校验账号项的 data-aspm-param（形如 account={&quot;...&quot;}），只取需要的字段 */
export function 解析账号参数(原始: string): { displayLogonId?: string } {
  if (!原始) return {};
  const 还原 = 原始.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const 片段 = 还原.match(/account=(\{.+\})/)?.[1];
  if (!片段) return {};
  try { return JSON.parse(片段) as { displayLogonId?: string }; } catch { return {}; }
}

/**
 * 在安全校验的账号列表里找出与任务匹配的唯一一项，返回其下标；0 个或多个匹配返回 -1。
 * 只按登录名匹配，不看姓名：优先完整相等，其次脱敏匹配（268***@qq.com 这类）。
 */
export function 选择安全校验账号(列表: Array<{ displayLogonId?: string }>, 任务: Pick<CollectorTransferTask, 'payee'>): number {
  const 账号 = 任务.payee.account.replace(/\s+/g, '').toLowerCase();
  const 精确: number[] = [];
  const 脱敏: number[] = [];
  列表.forEach((项, 下标) => {
    const 登录名 = (项.displayLogonId ?? '').replace(/\s+/g, '').toLowerCase();
    if (!登录名) return;
    if (登录名 === 账号) 精确.push(下标);
    else if (登录名.includes('*') && 脱敏账号匹配(登录名, 账号)) 脱敏.push(下标);
  });
  if (精确.length === 1) return 精确[0];
  if (!精确.length && 脱敏.length === 1) return 脱敏[0];
  return -1;
}

/** 选择安全校验里与任务匹配的账号并确定；没有唯一匹配时放弃本单（付款尚未提交） */
async function 处理安全校验(页面: Page, 任务: CollectorTransferTask, 播报: 进度播报): Promise<void> {
  播报.设置步骤('安全校验出现，匹配收款账号');
  await 页面.waitForTimeout(800);
  const 列表 = await 页面.evaluate(() => [...document.querySelectorAll('.payeeRadio___RA1ha')]
    .map(元素 => 元素.getAttribute('data-aspm-param') ?? ''));
  const 账号列表 = 列表.map(解析账号参数);
  const 下标 = 选择安全校验账号(账号列表, 任务);
  if (下标 < 0) throw new 放弃本单(`安全校验里没有唯一匹配的收款账号（共 ${账号列表.length} 个候选）`);
  播报.设置步骤('已匹配账号，选中并确定');
  // 单选框本身会点击超时，点 label 才生效
  await 页面.locator('.payeeRadio___RA1ha').nth(下标).locator('label.ant-radio-wrapper').click({ timeout: 5000 });
  await 页面.waitForTimeout(600);
  await 页面.locator('.ant-modal-footer button.ant-btn-primary').filter({ hasText: /确\s*定/ }).first().click({ timeout: 5000 });
  播报.设置步骤('等待安全校验关闭');
  await 页面.locator('.ant-modal').filter({ hasText: '安全校验' }).first().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => undefined);
  await 页面.waitForTimeout(800);
}

/**
 * 确认信息：核对 → 找密码 iframe → 填密码 → 等“下一步”激活。全部成立才算到达第一阶段终点。
 * 收款账号、金额不一致说明表单被改动，本周期作废；付款账号只做警告（登录名可能保存成别的格式，
 * 且探测到确认弹窗里的付款账号是脱敏展示，误判会让每个周期都在这里被丢弃）。
 */
async function 到达下一步(页面: Page, 任务: CollectorTransferTask, 播报: 进度播报, 状态: 转账执行状态): Promise<Frame> {
  播报.设置步骤('确认信息已出现，核对收款账号与金额');
  const 弹窗文本 = await 页面.evaluate(() => {
    const 弹窗 = [...document.querySelectorAll('.ant-modal')]
      .find(元素 => (元素 as HTMLElement).offsetParent !== null && (元素 as HTMLElement).innerText.includes('确认信息'));
    return 弹窗 ? (弹窗 as HTMLElement).innerText : '';
  });
  const 信息 = 解析确认信息(弹窗文本);
  const 不符 = 核对确认信息(信息, 任务);
  const 致命 = 不符.filter(项 => 项 !== '付款账号');
  if (致命.length) {
    throw new 本周期作废(`确认信息与任务不一致：${致命.join('、')}（页面收款="${信息.收款.replace(/\d{4,}/g, m => m.slice(0, 3) + '****')}"，金额="${信息.金额}"）`);
  }
  if (不符.includes('付款账号')) 播报.事件('确认信息里的付款账号与环境登录名不一致，仅警告并继续（请核对环境的登录账号配置）');
  播报.事件('确认信息核对通过，准备填写支付密码');
  播报.设置步骤('等待支付密码控件');
  let 帧: Frame | undefined;
  for (let i = 0; i < 20 && !帧; i += 1) { 帧 = 查找密码框架(页面); if (!帧) await 页面.waitForTimeout(500); }
  if (!帧) throw new 本周期作废('支付密码控件没有加载出来');
  // 隐藏的占位 input 也是 password 类型，必须用 #password 精确定位
  const 密码 = 任务.paymentPassword ?? '';
  // 中心没有下发支付密码（环境没配置）：填空串永远激活不了“下一步”，刷新重来也没用，直接放弃本单（付款尚未提交）
  if (!密码) throw new 放弃本单('中心没有下发该环境的支付密码，请在环境凭据里配置支付密码');
  const 密码框 = 帧.locator('input#password');
  await 密码框.waitFor({ state: 'visible', timeout: 10_000 });
  const 按钮 = 帧.locator('button[type=submit]');
  const 等待激活 = async (次数: number) => {
    for (let i = 0; i < 次数; i += 1) {
      if (await 按钮.isEnabled().catch(() => false)) return true;
      await 页面.waitForTimeout(250);
    }
    return false;
  };
  播报.设置步骤('填写支付密码');
  await 密码框.fill(密码, { timeout: 8000 });
  状态.已输入密码 = true;
  await 页面.waitForTimeout(800);
  播报.设置步骤('等待“下一步”按钮激活');
  if (await 等待激活(8)) return 帧;
  // fill 没让按钮激活：多半是控件只认真实按键事件。清空后点击输入框，逐字键盘输入再试一次（日志只记有无内容，不记密码）
  播报.事件(`填写后“下一步”未激活，改用键盘逐字输入支付密码（输入框当前${(await 密码框.inputValue().catch(() => '')).length ? '有内容' : '为空'}）`);
  // 清空或聚焦失败时继续逐字输入，会把密码叠加在残留内容后面；多次输错支付密码有风险，宁可作废本周期重来
  try {
    await 密码框.fill('', { timeout: 8000 });
    await 密码框.click({ timeout: 5000 });
    if ((await 密码框.inputValue()).length) throw new Error('输入框仍有残留内容');
  } catch {
    throw new 本周期作废('清空支付密码框失败，为避免密码叠加输入已作废本周期');
  }
  await 密码框.pressSequentially(密码, { delay: 90, timeout: 20_000 });
  if (await 等待激活(20)) return 帧;
  throw new 本周期作废('填入支付密码后“下一步”没有激活');
}

/** 请求或点击超时都可能已经生效，禁止补点。 */
export async function 提交付款一次(帧: Frame, 状态: 转账执行状态, 选项: 转账执行选项) {
  if (状态.已提交 || !选项.确认提交) throw new Error('缺少有效的一次性提交许可');
  状态.已提交 = true;
  await 选项.确认提交();
  if (选项.是否活跃?.() === false) throw new Error('任务已停止');
  await 帧.locator('button[type=submit]').click({ timeout: 5000 });
}

const 取详情结果 = (页面: Page) => 页面.evaluate(() => {
  const 文本 = (document.body?.innerText ?? '').replace(/\s+/g, ' ');
  return { 成功: /转账成功/.test(文本), 失败: /(转账失败|交易失败|付款失败|已关闭)/.test(文本), 文本: 文本.slice(0, 80) };
}).catch(() => ({ 成功: false, 失败: false, 文本: '' }));

/** 终态截图单张体积上限（JPEG 字节）：base64 后约 270KB，中心 DTO 上限 400KB，留有余量 */
export const 终态截图上限字节 = 200_000;

/**
 * 截取当前页面视口为 JPEG data URL，作为转账结果的页面证据。
 * 质量 70→50→35 逐级降低直到不超过上限；页面已关闭、截图超时或任何异常都返回 undefined，
 * 绝不能因为截图失败而改变转账结果或阻塞回报。
 */
export async function 截取终态截图(页面: Page): Promise<string | undefined> {
  try {
    if (页面.isClosed()) return undefined;
    let 图片: Buffer | undefined;
    for (const 质量 of [70, 50, 35]) {
      图片 = await 页面.screenshot({ type: 'jpeg', quality: 质量, timeout: 5000 });
      if (图片.length <= 终态截图上限字节) break;
    }
    // 降到最低质量仍超限：丢弃而不是照传，超大请求会被中心拒绝并让上报队列卡住
    if (!图片 || 图片.length > 终态截图上限字节) return undefined;
    return `data:image/jpeg;base64,${图片.toString('base64')}`;
  } catch {
    return undefined;
  }
}

/**
 * 转账页自动化入口：执行完整流程，并在得到终态结果（成功、失败、结果未知）后截图。
 * 截图放在这里而不是外层：页面和浏览器会在调用方的 finally 里被关闭，只有这里还拿得到页面。
 * 抛出“浏览器已丢失 / 需要重开浏览器”的路径不是终态，不截图。
 */
export async function executeTransferPage(页面: Page, 任务: CollectorTransferTask, 选项: 转账执行选项 = {}): Promise<CollectorTransferReport> {
  const 结果 = await 执行转账页流程(页面, 任务, 选项);
  if (!['SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(结果.status)) return 结果;
  const 截图 = await 截取终态截图(页面);
  return 截图 ? { ...结果, screenshot: 截图 } : 结果;
}

/**
 * 转账页自动化：两个阶段。
 * 第一阶段（到达“下一步”）：90 秒一个周期，没到达就刷新重来，可无限重来。此阶段任何退出都发生在付款之前。
 * 第二阶段先向中心申请唯一的提交许可，再点击一次并等待结果。
 * 点过“下一步”之后绝不回报 FAILED（除非页面明确失败），拿不到明确结果只回报 UNKNOWN。
 */
async function 执行转账页流程(页面: Page, 任务: CollectorTransferTask, 选项: 转账执行选项): Promise<CollectorTransferReport> {
  const 播报 = new 进度播报(选项.日志 ?? (() => undefined));
  播报.启动();
  const 状态 = 选项.状态 ?? { 已提交: false, 已输入密码: false };
  let 周期 = 0;
  const 开始时间 = Date.now();
  const 扫码: 扫码状态 = { 起点: 0, 已上传: false, 尝试: 0 };
  try {
    // ───── 第一阶段 ─────
    let 帧: Frame | undefined;
    while (!帧) {
      if (选项.是否活跃?.() === false) {
        // 活跃检查为 false 可能是中心停止了任务，也可能是浏览器被关了；页面已关闭就让调用方判断是否重开
        if (页面.isClosed()) throw new 浏览器已丢失('页面已关闭');
        return { status: 'FAILED', note: '任务已被中心停止，未提交付款' };
      }
      // 累计耗时太长：当前浏览器可能已经不健康，交给调用方关闭重开。只在付款之前才会走到这里
      if (Date.now() - 开始时间 > 阶段一重开毫秒) {
        播报.事件(`第一阶段已耗时 ${Math.round((Date.now() - 开始时间) / 60000)} 分钟仍未到达“下一步”，关闭浏览器重新开始（付款尚未提交）`);
        throw new 需要重开浏览器('第一阶段耗时过长');
      }
      周期 += 1;
      播报.设置阶段(`阶段一|周期${周期}`);
      播报.设置步骤(周期 === 1 ? '打开转账页，等待表单出现' : '刷新页面，重新开始本周期');
      const 周期截止 = Date.now() + 阶段一周期毫秒;
      try {
        await 页面.goto(TRANSFER_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await 页面.locator('#payeeAccount').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
        帧 = await 运行第一阶段周期(页面, 任务, 选项, 播报, 周期截止, 状态);
      } catch (错误) {
        if (错误 instanceof 放弃本单) { 播报.事件(`放弃本单：${错误.message}`); return { status: 'FAILED', note: `${错误.message}，未提交付款` }; }
        // 浏览器或页面没了：刷新没有意义，交给调用方重开浏览器
        if (页面.isClosed() || 是浏览器丢失(错误)) throw new 浏览器已丢失(错误 instanceof Error ? 错误.message.split('\n')[0].slice(0, 100) : '浏览器已关闭');
        // 本周期作废、超时、页面导航中断等：刷新后重来。原因必须单独成一条日志，否则下一个周期的“刷新页面”会把它盖掉
        const 原因 = 错误 instanceof 本周期作废 ? 错误.message : `${错误 instanceof Error ? 错误.message.split('\n')[0].slice(0, 120) : '未知错误'}`;
        播报.事件(`第 ${周期} 周期结束，将刷新页面重来：${原因}`);
        播报.设置页面('本周期未能到达，准备刷新');
        await 页面.waitForTimeout(500).catch(() => undefined);
      }
    }

    // ───── 第二阶段 ─────
    播报.设置阶段('阶段二');
    if (选项.是否活跃?.() === false) return { status: 'FAILED', note: '任务已停止，未申请提交付款' };
    播报.设置步骤('等待中心确认提交许可');
    await 提交付款一次(帧, 状态, 选项);
    播报.事件(阶段标记.已点击下一步 + ' 已点击“下一步”，等待付款结果');
    let 截止 = Date.now() + 结果等待毫秒;
    while (Date.now() < 截止) {
      if (选项.是否活跃?.() === false || 页面.isClosed()) break;
      await 页面.waitForTimeout(1000);
      const url = 页面.url();
      if (/\/transfer\/detail/.test(url)) {
        播报.设置页面('转账详情页');
        const 结果 = await 取详情结果(页面);
        if (结果.成功) return { status: 'SUCCEEDED', note: '支付宝页面确认转账成功' };
        if (结果.失败) return { status: 'FAILED', note: `支付宝详情页显示失败：${结果.文本}` };
        continue;
      }
      if (/\/transfer\/toAccount\/result/.test(url)) { 播报.设置步骤('等待转账详情页'); continue; }
      const 扫码页 = await 识别扫码页(页面);
      if (扫码页) {
        const 结果 = await 等待扫码完成(页面, 选项, 播报, 扫码, 扫码页.有效期);
        if (结果) return 结果;
        // 扫码页跳转后给结果页完整的观察时间。
        截止 = Date.now() + 结果等待毫秒;
        continue;
      }
      const 密码帧 = 查找密码框架(页面);
      const 提示 = 密码帧 ? await 密码帧.locator('#password_help').innerText().catch(() => '') : '';
      if (/(密码.{0,6}(错误|不正确|有误)|输入有误)/.test(提示))
        return { status: 'FAILED', note: '支付密码被拒绝，请在中心核对支付密码' };
      播报.设置步骤('已提交，等待明确付款结果');
    }
    return { status: 'UNKNOWN', note: '已尝试提交付款，未取得明确结果；禁止重复付款，请核对支付宝账单' };
  } catch (错误) {
    // 付款之前的耗时超限或浏览器丢失：不是失败，交给调用方关闭浏览器重开
    if ((错误 instanceof 需要重开浏览器 || 错误 instanceof 浏览器已丢失) && !状态.已提交) throw 错误;
    // 兜底：已点过“下一步”只能是结果未知；否则钱不可能转出
    return 状态.已提交
      ? { status: 'UNKNOWN', note: '已尝试提交，未取得明确成功结果；禁止重复付款，请核对账单' }
      : { status: 'FAILED', note: '转账流程中断，未提交付款' };
  } finally {
    播报.停止();
  }
}

/**
 * 第一阶段单个周期：按页面状态推进，直到到达“下一步”。
 * 等待人工验证和推进表单时顺延截止时间，避免在操作过程中刷新页面。
 */
async function 运行第一阶段周期(页面: Page, 任务: CollectorTransferTask, 选项: 转账执行选项, 播报: 进度播报, 初始截止: number, 执行状态: 转账执行状态): Promise<Frame> {
  let 截止 = 初始截止;
  const 前进 = () => { 截止 = Math.max(截止, Date.now() + 阶段一周期毫秒); };
  let 已填表 = false;
  let 已确认登录 = false;
  let 上次变化 = Date.now();
  let 上个状态: 页面状态 | '' = '';
  let 需再点立即转账 = false;
  let 上次点继续转账 = 0;
  const 打码选项 = { 是否活跃: 选项.是否活跃, 打码平台: 选项.打码平台, 打码用户名: 选项.打码用户名, 打码密码: 选项.打码密码 };
  // 填表阶段的验证码：先尝试关闭，关不掉就直接打码，不让流程卡死
  const 填表时验证码 = async () => {
    if (!await 旋转验证码可见(页面)) return;
    播报.设置步骤('填表时出现验证码，正在关闭');
    if (await 关闭旋转验证码(页面, 2)) return;
    播报.设置步骤('验证码关不掉，改为直接打码');
    await 处理旋转验证码(页面, 步骤 => 播报.设置步骤(步骤), 打码选项);
  };

  while (Date.now() < 截止) {
    if (选项.是否活跃?.() === false) {
      if (页面.isClosed()) throw new 浏览器已丢失('页面已关闭');
      throw new 放弃本单('任务已被中心停止');
    }
    // 浏览器或页面被关闭：没有任何继续的意义，立刻交给调用方处理（付款前重开，点过“下一步”则按未知结束）
    if (页面.isClosed()) throw new 浏览器已丢失('页面已关闭');
    const 快照 = await 取页面快照(页面).catch(错误 => { if (是浏览器丢失(错误)) throw new 浏览器已丢失('页面已关闭'); return undefined; });
    if (!快照) { await 页面.waitForTimeout(500).catch(() => undefined); continue; }
    const 状态 = 判断页面状态(快照);
    播报.设置页面(页面状态描述(状态, 快照));
    if (状态 !== 上个状态) {
      播报.事件(`页面状态：${上个状态 || '起始'} → ${状态}${状态 === '页面错误' ? `（${快照.错误文案}）` : ''}`);
      上个状态 = 状态; 上次变化 = Date.now();
    }
    播报.设置阶段(`阶段一|剩余${Math.max(0, Math.round((截止 - Date.now()) / 1000))}秒`);

    switch (状态) {
      case '登录页': {
        播报.设置步骤('检测到未登录（页面在登录页），先登录再继续转账');
        const 已登录 = 选项.重新登录 ? await 选项.重新登录(页面).catch(() => false) : false;
        if (!已登录) throw new 放弃本单('转账页需要登录，自动登录未成功');
        播报.事件('登录成功，回到转账页重新开始填表');
        // 登录后回到转账页，本周期重新开始
        await 页面.goto(TRANSFER_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        已填表 = false;
        需再点立即转账 = false;
        前进();
        break;
      }
      case '验证码': {
        // 验证码出现就打码，可无限重复；每一轮都算作前进，会顺延本周期截止时间
        播报.设置步骤('验证码出现，开始打码');
        const 结果 = await 处理旋转验证码(页面, 步骤 => 播报.设置步骤(步骤), 打码选项);
        播报.事件(`验证码本轮结果：${结果}`);
        上次变化 = Date.now();
        前进();
        break;
      }
      case '安全校验': {
        // 多个支付宝账号时要选择与任务一致的收款账号，选完后需要再次点击“立即转账”
        await 处理安全校验(页面, 任务, 播报);
        播报.事件('安全校验已选择收款账号并确定，需要再次点击“立即转账”');
        需再点立即转账 = true;
        上次变化 = Date.now();
        前进();
        break;
      }
      case '重复转账提醒': {
        // 弹窗淡出需要一点时间，3 秒内不重复点击、不重复记日志
        if (Date.now() - 上次点继续转账 < 3000) {
          播报.设置步骤('已点击“继续转账”，等待弹窗关闭');
          break;
        }
        // 此时仍在第一阶段，付款尚未提交；真正提交仍须先取得中心的一次性提交许可
        播报.设置步骤('出现“已转账过相同金额”提醒，点击“继续转账”');
        await 点击继续转账(页面);
        上次点继续转账 = Date.now();
        播报.事件('支付宝提示已转账过相同金额的订单，已点击“继续转账”');
        上次变化 = Date.now();
        前进();
        break;
      }
      case '确认信息加载中': {
        播报.设置步骤('等待支付密码控件加载');
        await 页面.waitForTimeout(500);
        break;
      }
      case '确认信息': {
        const 帧 = await 到达下一步(页面, 任务, 播报, 执行状态);
        播报.事件(阶段标记.已到达下一步 + ' 已到达“下一步”，支付密码已填写，尚未提交付款');
        return 帧;
      }
      case '页面错误': {
        if (是不可恢复错误(快照.错误文案)) throw new 放弃本单(`页面提示：${快照.错误文案}`);
        throw new 本周期作废(`页面提示：${快照.错误文案}`);
      }
      case '结果页': {
        // 第一阶段不应该出现结果页：说明之前某次点击已经提交了，按未知处理由上层兜底
        throw new 放弃本单('第一阶段意外进入结果页，请核对支付宝账单');
      }
      case '填表页': {
        if (!已填表) {
          // 填表前先确认登录态：Cookie 证据不足说明会话已失效，转账页随后会被跳去登录页，先登录能少走一个周期
          if (选项.是否已登录 && 选项.重新登录 && !已确认登录) {
            播报.设置步骤('检测登录状态');
            const 已登录 = await 选项.是否已登录().catch(() => true);
            已确认登录 = true;
            if (!已登录) {
              播报.事件('登录 Cookie 缺失，判断为未登录，先登录再转账');
              if (!await 选项.重新登录(页面).catch(() => false)) throw new 放弃本单('环境未登录，自动登录未成功');
              播报.事件('登录成功，回到转账页重新开始填表');
              await 页面.goto(TRANSFER_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
              前进();
              break;
            }
          }
          await 填写表单(页面, 任务, 播报, 填表时验证码);
          已填表 = true;
          播报.设置步骤('点击“立即转账”');
          await 点击立即转账(页面);
          上次变化 = Date.now();
          前进();
          播报.事件('表单已填写并点击“立即转账”');
          播报.设置步骤('已点击“立即转账”，等待验证码、安全校验或确认信息');
        } else if (需再点立即转账) {
          播报.设置步骤('安全校验已完成，再次点击“立即转账”');
          await 点击立即转账(页面);
          需再点立即转账 = false;
          上次变化 = Date.now();
          前进();
          播报.事件('已再次点击“立即转账”');
          播报.设置步骤('已再次点击“立即转账”，等待确认信息');
        } else if (Date.now() - 上次变化 > 8000) {
          // 点击后约 6 秒验证码才会弹出，超过 8 秒仍无变化才认为点击没生效
          播报.设置步骤('点击后 8 秒无变化，再次点击“立即转账”');
          await 点击立即转账(页面);
          上次变化 = Date.now();
          播报.事件('点击后 8 秒页面无变化，已再次点击“立即转账”');
        }
        break;
      }
      default:
        播报.设置步骤('页面状态未知，等待页面稳定');
    }
    await 页面.waitForTimeout(500).catch(() => undefined);
  }
  throw new 本周期作废('本周期 90 秒内未到达“下一步”');
}
