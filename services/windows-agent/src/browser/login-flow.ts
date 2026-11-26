import type { Page, BrowserContext } from 'playwright-core';
import { 检测验证码类型, 处理点选验证码, 处理滑块验证码 } from './captcha-handler.js';
import type { 打码平台类型 } from './captcha-solver.js';
import { 读取登录证据, 是否已登录, 是支付宝业务域, 读取登录阻塞, 自动填写登录表单 } from './alipay-session.js';

/**
 * 检查是否已成功登录
 */
async function 检查是否已登录本地(上下文: BrowserContext, 页面: Page, 记录日志: (消息: string) => Promise<void>): Promise<boolean> {
  if (!是支付宝业务域(页面.url())) return false;

  const 证据 = await 读取登录证据(上下文, 'https://b.alipay.com');
  if (是否已登录(证据)) {
    const 剩余时间 = 证据.会话剩余毫秒 ? `，会话剩余约 ${Math.round(证据.会话剩余毫秒 / 60_000)} 分钟` : '';
    await 记录日志('已登录 Cookie 校验通过' + 剩余时间);
    return true;
  }
  return false;
}

/**
 * 处理验证码（点选或滑块）：截图提交打码平台，按识别结果点击或拖动
 */
async function 处理验证码本地(
  页面: Page,
  记录日志: (消息: string) => Promise<void>,
  选项: { 是否活跃?: () => boolean; 打码平台?: 打码平台类型; 打码用户名?: string; 打码密码?: string; 滑块补偿像素?: number }
): Promise<boolean> {
  const 题型 = await 检测验证码类型(页面);
  if (题型 === '点选') return await 处理点选验证码(页面, 记录日志, 选项);
  if (题型 === '滑块') return await 处理滑块验证码(页面, 记录日志, 选项);
  return false;
}

/**
 * 验证码通过后，等页面跳转到业务域，或验证码容器消失；最多等 5 秒。
 * 避免把“正在消失的验证码”当成新验证码再次进入识别流程。
 */
async function 等待验证码通过后稳定(页面: Page, 是否活跃?: () => boolean): Promise<void> {
  const 截止时间 = Date.now() + 5000;
  while (Date.now() < 截止时间 && 是否活跃?.() !== false) {
    if (是支付宝业务域(页面.url())) return;
    if ((await 读取登录阻塞(页面)) !== '验证码') return;
    await 页面.waitForTimeout(300);
  }
}

/**
 * 核心登录流程
 *
 * 流程结构：
 * 外层循环：控制刷新重试次数（默认3次）
 * 内层循环：控制单次登录的轮询等待（默认3分钟超时）
 */
export async function 执行登录流程(
  上下文: BrowserContext,
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
    登录超时分钟?: number;
    最大重试轮数?: number;
    /** 打码平台配置：未配置时遇到验证码只能等待人工处理 */
    打码平台?: 打码平台类型;
    打码用户名?: string;
    打码密码?: string;
    /** 滑块识别结果的固定补偿像素 */
    滑块补偿像素?: number;
    /** 页面提示账号或密码错误时通知中心（把凭据标记为被拒绝） */
    标记密码错误?: () => Promise<void>;
    /** 所有重试轮次用尽仍未登录时通知中心触发冷却 */
    触发冷却?: () => Promise<void>;
  }
): Promise<boolean> {

  const 登录超时毫秒 = Math.max(1, Math.min(60, 选项.登录超时分钟 ?? 3)) * 60 * 1000;
  const 最大重试轮数 = Math.max(1, Math.min(5, 选项.最大重试轮数 ?? 3));

  // 外层循环：每一轮 = 刷新网页 → 填表登录（只提交一次）→ 内层轮询
  外层: for (let 当前轮数 = 1; 当前轮数 <= 最大重试轮数; 当前轮数++) {
    if (选项.是否活跃?.() === false) return false;

    if (当前轮数 > 1) {
      await 记录日志(`登录等待超时，刷新页面重试（第 ${当前轮数}/${最大重试轮数} 轮）`);
      await 页面.reload({ waitUntil: 'domcontentloaded', timeout: 超时毫秒 }).catch(() => undefined);
      await 页面.waitForLoadState('load', { timeout: 超时毫秒 }).catch(() => undefined);
    }

    const 本轮截止时间 = Date.now() + 登录超时毫秒;

    // 填表登录：每一轮只提交一次账号密码
    if (选项.请求登录凭据) {
      const 填表结果 = await 自动填写登录表单(页面, 超时毫秒, 记录日志, 选项);
      if (填表结果 === '已登录') return true;
      // 缺凭据 / 被拒绝 / 冷却中 / 任务已停止：重试没有意义，也不属于“重试用尽”，不触发冷却
      if (填表结果 === '无法登录') return false;
    }

    // 内层循环：轮询等待登录完成
    内层: while (选项.是否活跃?.() !== false) {

      // 1. 优先检查是否已登录（Cookie 证据）
      if (await 检查是否已登录本地(上下文, 页面, 记录日志)) {
        return true;
      }

      // 2. 检查是否超时
      if (Date.now() >= 本轮截止时间) {
        break 内层;  // 退出内层，进入下一轮重试
      }

      // 3. 读取当前阻塞状态
      const 阻塞 = await 读取登录阻塞(页面);

      // 4. 处理密码错误：通知中心标记凭据，不触发冷却（修正凭据后才能继续）
      if (阻塞 === '已拒绝') {
        await 记录日志('页面提示账号或密码错误，已停止自动登录');
        await 选项.标记密码错误?.().catch((错误: unknown) => 记录日志(`通知中心标记密码错误失败：${错误 instanceof Error ? 错误.message : '未知错误'}`).catch(() => undefined));
        return false;
      }

      // 5. 处理验证码：自动截图提交打码平台；未配置或识别失败时进入下一轮轮询
      if (阻塞 === '验证码') {
        const 已解决 = await 处理验证码本地(页面, 记录日志, 选项);
        if (已解决) {
          // 验证码刚通过时页面还在跳转、验证码容器还在消失，立刻回主循环会把它当成新验证码重复处理
          await 等待验证码通过后稳定(页面, 选项.是否活跃);
          continue 内层; // 重新检查登录状态
        }
        // 验证码无法处理时，若出现关闭按钮就刷新重试
        const 关闭按钮 = 页面.locator('img.close-button.captcha[src*="close-button"]');
        if (await 关闭按钮.isVisible().catch(() => false)) {
          await 记录日志('检测到验证码关闭按钮，刷新页面重试');
          break 内层; // 退出内层，刷新重试
        }
      }

      // 6. 人工验证（扫码/短信）只能人工完成：提示一次后等待状态变化
      if (阻塞 === '人工验证') {
        await 记录日志('请在采集端页面完成人工验证');
        while (选项.是否活跃?.() !== false && Date.now() < 本轮截止时间) {
          await 页面.waitForTimeout(1000);
          const 状态 = await 读取登录阻塞(页面);
          if (状态 !== '人工验证') break;
        }
        if (Date.now() >= 本轮截止时间) return false;
        continue 内层;
      }

      // 7. 等待2秒后重新检查
      await 页面.waitForTimeout(2000);
    }
  }

  // 任务被停止不算“重试用尽”，不触发冷却
  if (选项.是否活跃?.() === false) return false;

  // 所有轮次都用尽仍未登录 → 触发冷却（只在这里触发一次）
  await 记录日志(`登录重试 ${最大重试轮数} 轮均未成功，通知中心触发冷却`);
  await 选项.触发冷却?.().catch((错误: unknown) => 记录日志(`通知中心触发冷却失败：${错误 instanceof Error ? 错误.message : '未知错误'}`).catch(() => undefined));
  return false;
}


