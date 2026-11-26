// 转账金额计算和状态流转：纯函数，不依赖数据库，便于测试。
// 金额全部按“分”做整数运算，避免小数误差。

// 余额新鲜阈值默认 10 分钟，可在脚本设置里修改（script_setting.balance_fresh_minutes）
export const DEFAULT_BALANCE_FRESH_MINUTES = 10;
export const BALANCE_FRESH_MS = DEFAULT_BALANCE_FRESH_MINUTES * 60_000;
/** 脚本设置里的分钟数换成毫秒；未配置或不合法时用默认值 */
export function balanceFreshMsOf(minutes?: number | null): number {
  const valid = typeof minutes === 'number' && Number.isInteger(minutes) && minutes > 0;
  return (valid ? (minutes as number) : DEFAULT_BALANCE_FRESH_MINUTES) * 60_000;
}
const CLOCK_SKEW_MS = 60_000;

export function toCents(value: string | number): number {
  const text = String(value).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) throw new Error(`金额格式无效：${text}`);
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('金额过大');
  return negative ? -cents : cents;
}

export function fromCents(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export interface TransferAmountRule {
  triggerBalance: string;
  reserveAmount: string;
  feeBuffer: string;
  minAmount: string;
  maxAmount: string;
  dailyLimit: string | null;
}

export type TransferSkipReason =
  | 'BALANCE_STALE'
  | 'BELOW_TRIGGER'
  | 'NOT_POSITIVE'
  | 'DAILY_LIMIT_REACHED'
  | 'BELOW_MIN';

export type TransferAmountResult = { amount: string } | { skip: TransferSkipReason };

// 候选金额 = min(余额 - 保留金额 - 手续费缓冲, 单笔最大, 当日剩余额度)。
// 低于单笔最小就不生成，也不拆单绕过限额；余额超过新鲜阈值（默认 10 分钟，脚本设置可改）没更新视为不新鲜，不触发。
export function computeTransferAmount(input: {
  rule: TransferAmountRule;
  balance: string;
  balanceAt: Date | null;
  now: Date;
  spentToday: string;
  /** 余额新鲜阈值（毫秒），缺省用默认值；转账服务按脚本设置传入 */
  freshMs?: number;
}): TransferAmountResult {
  const { rule, balanceAt, now } = input;
  if (!balanceAt) return { skip: 'BALANCE_STALE' };
  const age = now.getTime() - balanceAt.getTime();
  if (age > (input.freshMs ?? BALANCE_FRESH_MS) || age < -CLOCK_SKEW_MS) return { skip: 'BALANCE_STALE' };
  const balance = toCents(input.balance);
  if (balance < toCents(rule.triggerBalance)) return { skip: 'BELOW_TRIGGER' };
  const spendable = balance - toCents(rule.reserveAmount) - toCents(rule.feeBuffer);
  if (spendable <= 0) return { skip: 'NOT_POSITIVE' };
  let cap = Math.min(spendable, toCents(rule.maxAmount));
  if (rule.dailyLimit !== null) {
    const remaining = toCents(rule.dailyLimit) - toCents(input.spentToday);
    if (remaining <= 0) return { skip: 'DAILY_LIMIT_REACHED' };
    cap = Math.min(cap, remaining);
  }
  if (cap <= 0 || cap < toCents(rule.minAmount)) return { skip: 'BELOW_MIN' };
  return { amount: fromCents(cap) };
}

// PREPARING 已领取但不能付款；CLAIMED 已获一次性提交许可，亦包含升级前无法确认阶段的执行单。
export const EXECUTING_TRANSFER_STATUSES = ['PREPARING', 'CLAIMED'];
export const ACTIVE_TRANSFER_STATUSES: readonly string[] = [
  'READY',
  ...EXECUTING_TRANSFER_STATUSES,
  'NEEDS_MANUAL',
  'UNKNOWN',
];

const TRANSITIONS: Record<string, string[]> = {
  READY: ['PREPARING', 'CANCELLED'],
  PREPARING: ['CLAIMED', 'FAILED', 'NEEDS_MANUAL', 'UNKNOWN'],
  CLAIMED: ['SUCCEEDED', 'FAILED', 'NEEDS_MANUAL', 'UNKNOWN'],
  NEEDS_MANUAL: ['SUCCEEDED', 'FAILED', 'UNKNOWN'],
  UNKNOWN: ['SUCCEEDED', 'FAILED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransition(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// 同一资金账户同一时间最多一笔活动单：这些状态都会占着名额，不会因为余额仍然很高而再建一笔
export function isActiveTransfer(status: string): boolean {
  return ACTIVE_TRANSFER_STATUSES.includes(status);
}
