import { createHash } from 'node:crypto';
import type { Locator, Page } from 'playwright-core';
import type { AccountFundsInspection, RestrictionInspection } from '../contracts.js';

type 日志函数 = (消息: string, 地址?: string) => Promise<void>;

const 企业账户卡片 = '.ant-card[class*="widget-enterprise-account"]';
const 额度卡片 = '.quota-manage-card';
/** 资金相关的限制类型；“限制社交功能”等与资金无关的限制不算账号限制。 */
const 资金限制类型 = ['限制提现', '限制支出', '限制收款'];
/** 压缩质量逐级下降的目标体积；降到最低质量仍超过时照常上传。 */
const 单张截图上限字节 = 280_000;
/** 限制内容没变化时，超过这个时间也重新截图上传一次，防止此前的上传丢失后图片一直缺失。 */
const 强制重新截图毫秒 = 24 * 60 * 60 * 1000;
// ───────────────────────── 纯函数（不依赖浏览器，便于单测）─────────────────────────

/** 把页面金额文本转成不带千分位的数字字符串；隐藏状态的 ******、空值、非数字一律返回 null。 */
export function 解析金额(文本: string | null | undefined): string | null {
  if (!文本) return null;
  const 清理后 = 文本.replace(/[,，\s¥￥元]/g, '');
  return /^\d{1,16}(\.\d{1,2})?$/.test(清理后) ? 清理后 : null;
}

/** 额度处没有配置上限时页面显示“不限额”，它不是数字，需要单独识别。 */
export function 是不限额(文本: string | null | undefined): boolean {
  return Boolean(文本) && 文本!.replace(/\s/g, '').includes('不限额');
}

export interface 限制表行 {
  /** 限制类型单元格文本；表头里找不到该列时为整行文本 */
  类型: string;
  /** 状态单元格文本；表头里找不到该列时为整行文本 */
  状态: string;
  /** 整行内容（不含“操作”列），用于判断限制内容有没有变化 */
  内容: string;
}

/** 商家限制行：限制类型属于提现/支出/收款，且状态为待处理或不可解限。 */
export function 是账号限制行(行: 限制表行): boolean {
  return 资金限制类型.some(类型 => 行.类型.includes(类型)) && /待处理|不可解限/.test(行.状态);
}

/** 司法限制行：状态为待处理。 */
export function 是司法限制行(行: 限制表行): boolean {
  return 行.状态.includes('待处理');
}

export function 命中账号限制(行: 限制表行[]): boolean {
  return 行.some(是账号限制行);
}

export function 命中司法限制(行: 限制表行[]): boolean {
  return 行.some(是司法限制行);
}

/**
 * 限制内容指纹：只对命中行的文字内容计算，不看截图像素，所以渲染差异、滚动位置不会影响判断。
 * 命中行排序后再计算，行顺序变化不算内容变化；无关的行（如社交限制）变化也不会改变指纹。
 */
export function 计算限制指纹(行: 限制表行[], 是命中行: (行: 限制表行) => boolean): string {
  const 内容 = 行.filter(是命中行).map(项 => 项.内容).sort().join('\n');
  return createHash('sha256').update(内容).digest('hex');
}

/** 是否需要重新截图：没有记录、内容变了，或距上次截图超过 24 小时。 */
export function 需要重新截图(上次: 指纹记录 | undefined, 当前指纹: string, 现在: number): boolean {
  if (!上次) return true;
  if (上次.指纹 !== 当前指纹) return true;
  return 现在 - 上次.时间 >= 强制重新截图毫秒;
}

export interface 指纹记录 { 指纹: string; 时间: number }
export type 限制页签 = 'Personal' | 'JudicialFreeze';
/** 指纹由调用方按环境保存，本模块不持有状态。 */
export interface 指纹存储 {
  读取(页签: 限制页签): 指纹记录 | undefined;
  保存(页签: 限制页签, 记录: 指纹记录 | undefined): void;
}

// ───────────────────────────── 标签 1：资金数据 ─────────────────────────────

interface 资金原始文本 {
  可用余额: string | null;
  不可用余额: string | null;
  待结算金额: string | null;
  收款额度: string | null;
  付款额度: string | null;
}

function 读取资金原始文本(页面: Page): Promise<资金原始文本> {
  return 页面.evaluate(() => {
    const 规整 = (文本: string | null | undefined) => (文本 || '').replace(/\s/g, '').replace(/（/g, '(').replace(/）/g, ')');
    const 卡片 = document.querySelector('.ant-card[class*="widget-enterprise-account"]');
    const 取金额 = (标签: string): string | null => {
      if (!卡片) return null;
      for (const 元素 of Array.from(卡片.querySelectorAll('[class*="widget-data-detail-item-label"]'))) {
        // 必须整串相等：“可用余额”是“不可用余额”的子串，不能用包含匹配
        if (规整(元素.textContent) !== 标签) continue;
        const 容器 = 元素.closest('.ant-space-vertical');
        const 数据 = 容器 && 容器.querySelector('[class*="widget-data-detail-item-data"]');
        return 数据 ? (数据.textContent || '').trim() : null;
      }
      return null;
    };
    const 取额度 = (类型: string): string | null => {
      const 元素 = document.querySelector('.quota-manage-card .quota-card[data-aspm-param*="quotaCardType=' + 类型 + '"] .remain-amount');
      return 元素 ? (元素.textContent || '').trim() : null;
    };
    return {
      可用余额: 取金额('可用余额(元)'),
      不可用余额: 取金额('不可用余额(元)'),
      待结算金额: 取金额('待结算金额(元)'),
      收款额度: 取额度('RECEIVE'),
      付款额度: 取额度('PAY'),
    };
  });
}

/**
 * 读取首页资金数据：可用余额、不可用余额、待结算金额，以及额度管理里的当日可收款额度和当日可用付款额度。
 * 金额默认以 ****** 隐藏，读不到数字时点击“支付宝企业账户”旁的显示按钮；已经显示时不点，避免反向隐藏。
 */
export async function 读取资金数据(页面: Page, 记录日志: 日志函数, 等待毫秒 = 15_000): Promise<AccountFundsInspection | undefined> {
  try {
    await 页面.waitForSelector(`${企业账户卡片} [class*="widget-data-detail-item-label"]`, { state: 'attached', timeout: 等待毫秒 });
  } catch {
    // 失败时附带页面概况，日志里就能看出是页面没渲染完还是布局不同
    const 概况 = await 页面.evaluate(() => ({
      卡片: document.querySelectorAll('.ant-card').length,
      企业账户卡片: document.querySelectorAll('.ant-card[class*="widget-enterprise-account"]').length,
      金额标签: document.querySelectorAll('[class*="widget-data-detail-item-label"]').length,
      加载状态: document.readyState,
      路径: location.pathname,
    })).catch(() => undefined);
    await 记录日志('资金巡检：未找到账户金额区域，已跳过' + (概况
      ? `（路径 ${概况.路径}，加载状态 ${概况.加载状态}，卡片 ${概况.卡片} 个，企业账户卡片 ${概况.企业账户卡片} 个，金额标签 ${概况.金额标签} 个）`
      : ''));
    return undefined;
  }

  let 原始 = await 读取资金原始文本(页面);
  if (解析金额(原始.可用余额) === null) {
    const 显示按钮 = 页面.locator(`${企业账户卡片} [class*="widget-enterprise-account-title"] .anticon[aria-label^="eye"]`).first();
    if (await 显示按钮.count()) {
      await 显示按钮.click({ timeout: 等待毫秒 }).catch(() => undefined);
      await 记录日志('资金巡检：已点击显示按钮');
      const 截止时间 = Date.now() + 等待毫秒;
      while (Date.now() < 截止时间) {
        原始 = await 读取资金原始文本(页面);
        if (解析金额(原始.可用余额) !== null) break;
        await 页面.waitForTimeout(500);
      }
    } else {
      await 记录日志('资金巡检：金额处于隐藏状态且未找到显示按钮');
    }
  }

  // 额度管理在页面下方，先滚动到可视区再等数字渲染
  await 页面.locator(额度卡片).first().scrollIntoViewIfNeeded({ timeout: 等待毫秒 }).catch(() => undefined);
  await 页面.waitForSelector(`${额度卡片} .quota-card .remain-amount`, { state: 'attached', timeout: 等待毫秒 }).catch(() => undefined);
  原始 = await 读取资金原始文本(页面);

  const 收款不限额 = 是不限额(原始.收款额度);
  const 付款不限额 = 是不限额(原始.付款额度);
  const 资金: AccountFundsInspection = {
    availableBalance: 解析金额(原始.可用余额),
    unavailableBalance: 解析金额(原始.不可用余额),
    pendingBalance: 解析金额(原始.待结算金额),
    receiptQuota: 收款不限额 ? null : 解析金额(原始.收款额度),
    paymentQuota: 付款不限额 ? null : 解析金额(原始.付款额度),
    ...(收款不限额 ? { receiptUnlimited: true } : {}),
    ...(付款不限额 ? { paymentUnlimited: true } : {}),
  };
  // “不限额”也算读到了；读不到的项（null 且不是不限额）中心保持原值
  const 已读取 = [资金.availableBalance, 资金.unavailableBalance, 资金.pendingBalance, 资金.receiptQuota, 资金.paymentQuota]
    .filter(值 => 值 !== null).length + (收款不限额 ? 1 : 0) + (付款不限额 ? 1 : 0);
  await 记录日志(`资金巡检：已读取 ${已读取}/5 项${收款不限额 || 付款不限额 ? '（含不限额）' : ''}`);
  return 已读取 > 0 ? 资金 : undefined;
}

// ─────────────────────────── 标签 2：限制与司法查询 ───────────────────────────

type 页签键 = 限制页签;

interface 表格快照 {
  行: 限制表行[];
  无数据: boolean;
  加载中: boolean;
}

function 读取表格快照(页面: Page, 页签: 页签键): Promise<表格快照> {
  return 页面.evaluate((键: string) => {
    const 规整 = (文本: string | null | undefined) => (文本 || '').replace(/\s/g, '');
    const 面板 = document.querySelector('.ant-tabs-tabpane-active[id$="-panel-' + 键 + '"]');
    if (!面板) return { 行: [], 无数据: false, 加载中: true };
    const 表头 = Array.from(面板.querySelectorAll('thead th')).map(单元 => 规整(单元.textContent));
    const 类型列 = 表头.indexOf('限制类型');
    const 状态列 = 表头.indexOf('状态');
    const 行 = Array.from(面板.querySelectorAll('tbody tr.ant-table-row')).map(行元素 => {
      const 单元格 = Array.from(行元素.querySelectorAll('td'));
      const 整行 = 规整(行元素.textContent);
      return {
        类型: 类型列 >= 0 && 单元格[类型列] ? 规整(单元格[类型列].textContent) : 整行,
        状态: 状态列 >= 0 && 单元格[状态列] ? 规整(单元格[状态列].textContent) : 整行,
        // 整行内容去掉“操作”列（按钮文字），用于判断限制内容是否变化
        内容: 单元格.filter((_, 序号) => 表头[序号] !== '操作').map(单元 => 规整(单元.textContent)).join('|'),
      };
    });
    return {
      行,
      无数据: !!面板.querySelector('tbody tr.ant-table-placeholder'),
      加载中: !!面板.querySelector('.ant-spin-spinning'),
    };
  }, 页签);
}

/** 切到指定页签，并等表格加载完（有记录或明确显示暂无数据）。超时返回 undefined。 */
async function 打开页签并读取(页面: Page, 页签: 页签键, 等待毫秒: number): Promise<限制表行[] | undefined> {
  const 标签 = 页面.locator(`.ant-tabs-tab[data-node-key="${页签}"]`).first();
  await 标签.waitFor({ state: 'visible', timeout: 等待毫秒 });
  if (!((await 标签.getAttribute('class')) ?? '').includes('ant-tabs-tab-active')) await 标签.click({ timeout: 等待毫秒 });
  await 页面.waitForSelector(`.ant-tabs-tabpane-active[id$="-panel-${页签}"]`, { state: 'attached', timeout: 等待毫秒 });

  const 截止时间 = Date.now() + 等待毫秒;
  while (Date.now() < 截止时间) {
    const 快照 = await 读取表格快照(页面, 页签);
    if (!快照.加载中 && (快照.行.length > 0 || 快照.无数据)) return 快照.行;
    await 页面.waitForTimeout(500);
  }
  return undefined;
}

/**
 * 截取结果区域为 JPEG data URL。按 70→50→35 逐级降低质量，直到不超过体积上限；
 * 降到最低质量仍超限时照常上传最后这张，不丢弃。
 */
async function 截取结果区域(页面: Page, 页签: 页签键, 等待毫秒: number): Promise<string | undefined> {
  const 面板 = 页面.locator(`.ant-tabs-tabpane-active[id$="-panel-${页签}"]`).first();
  const 表格 = 面板.locator('.ant-table-wrapper').first();
  const 目标: Locator = (await 表格.count()) ? 表格 : 面板;
  let 图片: Buffer | undefined;
  for (const 质量 of [70, 50, 35]) {
    图片 = await 目标.screenshot({ type: 'jpeg', quality: 质量, timeout: 等待毫秒 });
    if (图片.length <= 单张截图上限字节) break;
  }
  return 图片 ? `data:image/jpeg;base64,${图片.toString('base64')}` : undefined;
}

async function 巡检单项(
  页面: Page, 页签: 页签键, 名称: string, 是命中行: (行: 限制表行) => boolean, 指纹: 指纹存储, 记录日志: 日志函数, 等待毫秒: number,
): Promise<RestrictionInspection | undefined> {
  try {
    const 行 = await 打开页签并读取(页面, 页签, 等待毫秒);
    if (!行) {
      await 记录日志(`${名称}：表格加载超时，本轮不更新`);
      return undefined;
    }
    if (!行.some(是命中行)) {
      // 限制已解除：清掉指纹，之后再次出现限制时会重新截图
      指纹.保存(页签, undefined);
      await 记录日志(`${名称}：无生效限制`);
      return { limited: false };
    }

    // 内容没变化就不重复截图上传，中心没收到图片时会保留上一张
    const 当前指纹 = 计算限制指纹(行, 是命中行);
    if (!需要重新截图(指纹.读取(页签), 当前指纹, Date.now())) {
      await 记录日志(`${名称}：存在生效限制，内容未变化，沿用已有截图`);
      return { limited: true };
    }
    const image = await 截取结果区域(页面, 页签, 等待毫秒).catch(() => undefined);
    // 截图成功才记录指纹，失败则下一轮继续尝试
    if (image) 指纹.保存(页签, { 指纹: 当前指纹, 时间: Date.now() });
    await 记录日志(`${名称}：存在生效限制${image ? '，已截图' : '，截图失败'}`);
    return { limited: true, ...(image ? { image } : {}) };
  } catch {
    await 记录日志(`${名称}：读取失败，本轮不更新`);
    return undefined;
  }
}

/** 依次查询商家限制与司法限制；某一项失败不影响另一项，失败项不出现在结果里，中心保持原值。 */
export async function 执行限制巡检(
  页面: Page, 记录日志: 日志函数, 指纹: 指纹存储, 是否活跃?: () => boolean, 等待毫秒 = 15_000,
): Promise<{ restriction?: RestrictionInspection; judicial?: RestrictionInspection }> {
  const 结果: { restriction?: RestrictionInspection; judicial?: RestrictionInspection } = {};
  结果.restriction = await 巡检单项(页面, 'Personal', '商家限制查询', 是账号限制行, 指纹, 记录日志, 等待毫秒);
  if (是否活跃?.() === false) return 结果;
  结果.judicial = await 巡检单项(页面, 'JudicialFreeze', '司法限制查询', 是司法限制行, 指纹, 记录日志, 等待毫秒);
  return 结果;
}
