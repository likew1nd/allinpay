import { SiteOrderStatus } from '@prisma/client';

export const ORDER_MAPPING = 'epay-pro-2070-status-v2';

export function mapOrderStatus(source: string): SiteOrderStatus {
  // 与易支付 DailyReport 一致：正数均计成功，0（未支付）计失败。
  if (/^\d+$/.test(source))
    return Number(source) > 0
      ? SiteOrderStatus.SUCCESS
      : SiteOrderStatus.FAILED;
  return SiteOrderStatus.EXCLUDED;
}

export function summarizeOrderCounts(
  groups: readonly { sourceStatus: string; _count: { _all: number } }[],
) {
  let orderCount = 0;
  let successCount = 0;
  let failedCount = 0;
  let excludedCount = 0;
  for (const row of groups) {
    orderCount += row._count._all;
    const status = mapOrderStatus(row.sourceStatus);
    if (status === SiteOrderStatus.SUCCESS) successCount += row._count._all;
    else if (status === SiteOrderStatus.FAILED) failedCount += row._count._all;
    else excludedCount += row._count._all;
  }
  return {
    orderCount,
    successCount,
    failedCount,
    processingCount: 0,
    excludedCount,
    successRate:
      successCount + failedCount
        ? successCount / (successCount + failedCount)
        : null,
    failureRate:
      successCount + failedCount
        ? failedCount / (successCount + failedCount)
        : null,
  };
}
