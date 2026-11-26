import type { Prisma } from '@prisma/client';
import type { AgentTaskResultDto } from './dto/agent-runtime.dto';

type Inspection = NonNullable<AgentTaskResultDto['inspection']>;
type RestrictionResult = Inspection['restriction'];

/** 账号当前已记录的限制标记，用于本轮只查到其中一项时，仍能按完整状态计算账号状态。 */
export interface CurrentRestrictionFlags { restrictionActive: boolean; judicialActive: boolean }

/**
 * 把采集端的登录后巡检结果换算成账号更新字段。
 *
 * - 资金：只覆盖读到的项，读不到（null）保持原值，避免页面偶发读取失败把旧数据清空。
 *   可用余额只写 balance，不写 balanceAt：转账逻辑要求 balanceAt 存在且足够新才会使用余额，
 *   这里不更新它，巡检数据就只用于展示，不会被转账等其他逻辑当作实时余额。
 * - 限制标记：商家限制与司法限制各记一个布尔值，两项可以同时为真，界面据此显示两个标签。
 * - 账号状态（businessStatus，单值）：按生效后的标记计算，司法优先；两项本轮都查询成功且都没有限制才恢复为正常，
 *   只查成功一项且无限制时，状态保持不变。
 * - 截图：命中且这次截到图时保存并记录时间；没有限制时不清空，保留最后一次命中的截图。
 */
export function buildInspectionUpdate(
  inspection: Inspection | undefined,
  now: Date,
  current: CurrentRestrictionFlags = { restrictionActive: false, judicialActive: false },
): Prisma.AccountUpdateInput {
  const data: Prisma.AccountUpdateInput = {};
  if (!inspection) return data;
  const { funds, restriction, judicial } = inspection;

  if (funds) {
    if (funds.availableBalance !== null) data.balance = funds.availableBalance;
    if (funds.unavailableBalance !== null) data.unavailableBalance = funds.unavailableBalance;
    if (funds.pendingBalance !== null) data.pendingBalance = funds.pendingBalance;
    // 额度：“不限额”记为标记并清空数值，避免界面残留旧数字；读不到（既不是数字也不是不限额）保持原值
    if (funds.receiptUnlimited) { data.receiptUnlimited = true; data.receiptLimit = null; }
    else if (funds.receiptQuota !== null) { data.receiptUnlimited = false; data.receiptLimit = funds.receiptQuota; }
    if (funds.paymentUnlimited) { data.paymentUnlimited = true; data.paymentLimit = null; }
    else if (funds.paymentQuota !== null) { data.paymentUnlimited = false; data.paymentLimit = funds.paymentQuota; }
  }

  if (restriction) data.restrictionActive = restriction.limited;
  if (judicial) data.judicialActive = judicial.limited;

  const restrictionActive = restriction ? restriction.limited : current.restrictionActive;
  const judicialActive = judicial ? judicial.limited : current.judicialActive;
  if (judicialActive) data.businessStatus = 'JUDICIAL';
  else if (restrictionActive) data.businessStatus = 'RESTRICTED';
  else if (restriction && judicial) data.businessStatus = 'NORMAL';

  applyEvidence(data, restriction, 'restrictionImage', 'restrictionImageAt', now);
  applyEvidence(data, judicial, 'judicialImage', 'judicialImageAt', now);
  return data;
}

function applyEvidence(
  data: Prisma.AccountUpdateInput,
  item: RestrictionResult,
  imageKey: 'restrictionImage' | 'judicialImage',
  atKey: 'restrictionImageAt' | 'judicialImageAt',
  now: Date,
) {
  if (item?.limited && item.image) { data[imageKey] = item.image; data[atKey] = now; }
}
