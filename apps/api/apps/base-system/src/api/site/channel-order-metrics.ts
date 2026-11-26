import { Prisma, SiteOrderStatus } from '@prisma/client';

import { readOrderSnapshots, storedOrderRun } from './order-snapshot';
import { SnapshotQueryCache } from './snapshot-query-cache';

type ChannelOrderTotals = {
  code: string;
  status: SiteOrderStatus;
  m5: bigint;
  m15: bigint;
  m30: bigint;
  m60: bigint;
  day: bigint;
  receivedCount: bigint;
  receivedAmount: Prisma.Decimal | null;
  m5Amount: Prisma.Decimal | null;
  m15Amount: Prisma.Decimal | null;
  m30Amount: Prisma.Decimal | null;
  m60Amount: Prisma.Decimal | null;
  dayAmount: Prisma.Decimal | null;
};

export type ChannelOrderMetrics = {
  today: { amount: string; count: number } | null;
  successRates: (number | null)[];
  windows: ({ count: number; amount: string } | null)[];
};

type OrderScope = {
  site: { id: string; activeSyncId: string | null; timezone: string };
  codes?: string[];
  snapshot?: { id: string; windowStart: Date; windowEnd: Date; metadata: Prisma.JsonValue } | null;
};
const recentWindows = { m5: 5, m15: 15, m30: 30, m60: 60 } as const;
const recentKeys = Object.keys(recentWindows) as (keyof typeof recentWindows)[];
const rateKeys = [...recentKeys, 'day'] as const;

function siteDayStart(now: Date, timezone: string) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format;
  const today = date(now);
  // 按本地日期找边界，不假设每天都是 24 小时或午夜一定存在。
  let low = now.getTime() - 36 * 3600_000;
  let high = now.getTime();
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (date(middle) === today) high = middle;
    else low = middle;
  }
  return new Date(high);
}

function orderWindows(snapshot: { windowStart: Date; windowEnd: Date }, now: Date, timezone: string) {
  const end = new Date(Math.min(+now, +snapshot.windowEnd));
  const start = (key: (typeof rateKeys)[number]) => key === 'day'
    ? siteDayStart(now, timezone)
    : new Date(+end - recentWindows[key] * 60_000);
  const starts = Object.fromEntries(rateKeys.map((key) => [key, start(key)])) as Record<(typeof rateKeys)[number], Date>;
  return { end, starts, covers: (key: (typeof rateKeys)[number]) => snapshot.windowStart <= starts[key] && starts[key] < end };
}

function successRate(success: bigint, unpaid: bigint) {
  const samples = success + unpaid;
  return samples ? Number(success) / Number(samples) : null;
}

type SummaryRow = {
  total: bigint;
  success: bigint;
  unpaid: bigint;
  amount: Prisma.Decimal | null;
  todayTotal: bigint;
  todaySuccess: bigint;
  todayUnpaid: bigint;
  todayAmount: Prisma.Decimal | null;
} & Record<`${keyof typeof recentWindows}${'Success' | 'Unpaid'}`, bigint>;

export class OrderMetricsCache {
  readonly summaries = new SnapshotQueryCache<SummaryRow[]>();
  readonly channels = new SnapshotQueryCache<ChannelOrderTotals[]>();
}

export async function summarizeOrders(
  tx: Prisma.TransactionClient,
  scopes: OrderScope[],
  now: Date,
  filter: Prisma.Sql = Prisma.sql`TRUE`,
  cache?: OrderMetricsCache,
) {
  const byId = await readOrderSnapshots(tx, scopes.flatMap(({ site, snapshot }) =>
    site.activeSyncId && snapshot === undefined ? [site.activeSyncId] : []));
  const results = await Promise.all(scopes.map(async ({ site, codes, snapshot = site.activeSyncId ? byId.get(site.activeSyncId) : undefined }) => {
    if (!snapshot) return null;
    const { end, starts, covers } = orderWindows(snapshot, now, site.timezone);
    const { day } = starts;
    const hasToday = covers('day');
    const orderToday = hasToday ? Prisma.sql`occurred_at >= ${day} AND occurred_at < ${end}` : Prisma.sql`FALSE`;
    const paidToday = hasToday ? Prisma.sql`paid_at >= ${day} AND paid_at < ${end} AND occurred_at < ${end}` : Prisma.sql`FALSE`;
    const recentCounts = Prisma.join(recentKeys.map((key) => Prisma.sql`
      COUNT(CASE WHEN occurred_at >= ${starts[key]} AND occurred_at < ${end} AND status = 'SUCCESS' THEN 1 END) AS ${Prisma.raw(`${key}Success`)},
      COUNT(CASE WHEN occurred_at >= ${starts[key]} AND occurred_at < ${end} AND status = 'FAILED' THEN 1 END) AS ${Prisma.raw(`${key}Unpaid`)}`));
    const channelFilter = codes ? Prisma.sql`AND channel_code IN (${Prisma.join(codes)}) AND occurred_at < ${end}` : Prisma.empty;
    const load = () => tx.$queryRaw<SummaryRow[]>`
      SELECT COUNT(*) AS total,
        COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) AS success,
        COUNT(CASE WHEN status = 'FAILED' THEN 1 END) AS unpaid,
        SUM(CASE WHEN status = 'SUCCESS' THEN amount END) AS amount,
        COUNT(CASE WHEN ${orderToday} THEN 1 END) AS todayTotal,
        COUNT(CASE WHEN ${orderToday} AND status = 'SUCCESS' THEN 1 END) AS todaySuccess,
        COUNT(CASE WHEN ${orderToday} AND status = 'FAILED' THEN 1 END) AS todayUnpaid,
        SUM(CASE WHEN ${paidToday} AND status = 'SUCCESS' THEN COALESCE(real_amount, amount) END) AS todayAmount,
        ${recentCounts}
      FROM epay_order
      WHERE site_id = ${site.id} AND sync_run_id = ${storedOrderRun(snapshot.id, snapshot.metadata)}
        AND (${filter}) ${channelFilter}`;
    // 截止时间在快照内固定，站点本地跨日时重新计算今日指标。
    const [row] = await (cache?.summaries.get(
      [site.id, snapshot.id, end, day, codes?.slice().sort(), filter.sql, filter.values], load,
    ) ?? load());
    return { row, covers };
  }));

  function summarize(today: boolean) {
    let total = 0n;
    let success = 0n;
    let unpaid = 0n;
    let amount = new Prisma.Decimal(0);
    for (const result of results) {
      if (!result) continue;
      const { row } = result;
      total += today ? row.todayTotal : row.total;
      success += today ? row.todaySuccess : row.success;
      unpaid += today ? row.todayUnpaid : row.unpaid;
      amount = amount.add((today ? row.todayAmount : row.amount) ?? 0);
    }
    return {
      amount: amount.toFixed(2),
      total: Number(total),
      success: Number(success),
      unpaid: Number(unpaid),
    };
  }

  return {
    today: results.length > 0 && results.every((result) => result?.covers('day')) ? summarize(true) : null,
    cumulative: summarize(false),
    successRates: rateKeys.map((key) => {
      let success = 0n;
      let unpaid = 0n;
      for (const result of results) {
        if (!result?.covers(key)) return null;
        success += key === 'day' ? result.row.todaySuccess : result.row[`${key}Success`];
        unpaid += key === 'day' ? result.row.todayUnpaid : result.row[`${key}Unpaid`];
      }
      return successRate(success, unpaid);
    }),
  };
}

export async function channelOrderMetrics(
  tx: Prisma.TransactionClient,
  site: { id: string; activeSyncId: string | null; timezone: string },
  codes: string[],
  now = new Date(),
  cache?: OrderMetricsCache,
) {
  const metrics = new Map<string, ChannelOrderMetrics>();
  const { activeSyncId } = site;
  if (!activeSyncId || !codes.length) return metrics;
  const snapshot = await tx.epaySyncRun.findUnique({
    where: { id: activeSyncId },
    select: { windowStart: true, windowEnd: true, metadata: true },
  });
  if (!snapshot) return metrics;

  const { end, starts: { m5, m15, m30, m60, day }, covers } = orderWindows(snapshot, now, site.timezone);
  const hasToday = covers('day');
  const lower = hasToday && day < m60 ? day : m60;
  const received = hasToday
    ? Prisma.sql`status = 'SUCCESS' AND paid_at >= ${day} AND paid_at < ${end}`
    : Prisma.sql`FALSE`;

  const load = () => tx.$queryRaw<ChannelOrderTotals[]>`
    SELECT channel_code AS code, status,
      COUNT(CASE WHEN occurred_at >= ${m5} THEN 1 END) AS m5,
      COUNT(CASE WHEN occurred_at >= ${m15} THEN 1 END) AS m15,
      COUNT(CASE WHEN occurred_at >= ${m30} THEN 1 END) AS m30,
      COUNT(CASE WHEN occurred_at >= ${m60} THEN 1 END) AS m60,
      COUNT(CASE WHEN occurred_at >= ${day} THEN 1 END) AS day,
      COUNT(CASE WHEN ${received} THEN 1 END) AS receivedCount,
      SUM(CASE WHEN ${received} THEN COALESCE(real_amount, amount) END) AS receivedAmount,
      SUM(CASE WHEN status = 'SUCCESS' AND paid_at >= ${m5} AND paid_at < ${end} THEN COALESCE(real_amount, amount) END) AS m5Amount,
      SUM(CASE WHEN status = 'SUCCESS' AND paid_at >= ${m15} AND paid_at < ${end} THEN COALESCE(real_amount, amount) END) AS m15Amount,
      SUM(CASE WHEN status = 'SUCCESS' AND paid_at >= ${m30} AND paid_at < ${end} THEN COALESCE(real_amount, amount) END) AS m30Amount,
      SUM(CASE WHEN status = 'SUCCESS' AND paid_at >= ${m60} AND paid_at < ${end} THEN COALESCE(real_amount, amount) END) AS m60Amount,
      SUM(CASE WHEN ${received} THEN COALESCE(real_amount, amount) END) AS dayAmount
    FROM epay_order
    WHERE site_id = ${site.id} AND sync_run_id = ${storedOrderRun(activeSyncId, snapshot.metadata)}
      AND channel_code IN (${Prisma.join(codes)}) AND status IN ('SUCCESS', 'FAILED')
      AND occurred_at < ${end}
      AND (occurred_at >= ${lower} OR (${received}))
    GROUP BY channel_code, status`;
  const totals = await (cache?.channels.get(
    [site.id, activeSyncId, end, day, codes.slice().sort()], load,
  ) ?? load());

  const success = new Map<string, ChannelOrderTotals>();
  const failed = new Map<string, ChannelOrderTotals>();
  for (const row of totals)
    (row.status === SiteOrderStatus.SUCCESS ? success : failed).set(row.code, row);

  for (const code of codes) {
    const paid = success.get(code);
    const unpaid = failed.get(code);
    metrics.set(code, {
      today: hasToday
        ? { amount: paid?.receivedAmount?.toFixed(2) ?? '0.00', count: Number(paid?.receivedCount ?? 0n) }
        : null,
      successRates: rateKeys.map((key) => covers(key) ? successRate(paid?.[key] ?? 0n, unpaid?.[key] ?? 0n) : null),
      windows: rateKeys.map((key) => {
        if (!covers(key)) return null;
        const count = (paid?.[key] ?? 0n) + (unpaid?.[key] ?? 0n);
        const amount = key === 'day' ? paid?.dayAmount : paid?.[`${key}Amount`];
        return { count: Number(count), amount: amount?.toFixed(2) ?? '0.00' };
      }),
    });
  }
  return metrics;
}
