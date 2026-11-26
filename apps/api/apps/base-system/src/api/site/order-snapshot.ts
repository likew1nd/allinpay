import { BadRequestException } from '@nestjs/common';
import { EpayOrder, EpaySyncRun, Prisma } from '@prisma/client';
import { ulid } from 'ulid';

import { ORDER_BUCKET_PREFIX_LENGTH, orderBucketRange } from '../../../../../libs/shared/site-connector/src/order-manifest';
import type { OrderManifest } from '../../../../../libs/shared/site-connector/src/order-manifest';
import type { OrderData } from '../../../../../libs/shared/site-connector/src/site-data';
import { mapOrderStatus, ORDER_MAPPING } from './order-mapping';

export type OrderPublication = {
  manifest: OrderManifest;
  delta?: { baselineId: string; buckets: string[]; orders: OrderData[] };
};

export function storedOrderRun(id: string, metadata?: Prisma.JsonValue) {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata) && typeof metadata.orderRunId === 'string') {
    return metadata.orderRunId;
  }
  return id;
}

export async function readOrderSnapshots(tx: Prisma.TransactionClient, ids: string[]) {
  const snapshots = ids.length ? await tx.epaySyncRun.findMany({
    where: { id: { in: ids } },
    select: { id: true, windowStart: true, windowEnd: true, metadata: true },
  }) : [];
  return new Map(snapshots.map(snapshot => [snapshot.id, snapshot]));
}

export function orderRecord(row: OrderData, siteId: string, syncRunId: string): Prisma.EpayOrderCreateManyInput {
  return {
    ...row,
    siteId,
    syncRunId,
    id: ulid(),
    occurredAt: new Date(row.occurredAt),
    paidAt: row.paidAt ? new Date(row.paidAt) : null,
    status: mapOrderStatus(row.sourceStatus),
    sourceVersion: ORDER_MAPPING,
  };
}

function sameOrder(previous: EpayOrder, current: OrderData) {
  return previous.merchantId === current.merchantId && previous.paymentTypeId === current.paymentTypeId &&
    previous.paymentTypeName === current.paymentTypeName && previous.channelCode === current.channelCode &&
    previous.subchannelCode === current.subchannelCode && previous.amount.equals(current.amount) &&
    (previous.realAmount?.toFixed(2) ?? undefined) === current.realAmount && previous.sourceStatus === current.sourceStatus &&
    previous.occurredAt.getTime() === Date.parse(current.occurredAt) &&
    (previous.paidAt?.getTime() ?? null) === (current.paidAt ? Date.parse(current.paidAt) : null);
}

export async function publishOrderDelta(
  tx: Prisma.TransactionClient, run: EpaySyncRun, previous: Pick<EpaySyncRun, 'id' | 'metadata' | 'orderCount'>,
  publication: OrderPublication & { delta: NonNullable<OrderPublication['delta']> },
) {
  const { delta, manifest } = publication;
  const orderRunId = storedOrderRun(previous.id, previous.metadata);
  const buckets = new Set(delta.buckets);
  const expected = manifest.buckets.reduce((total, bucket) => total + (buckets.has(bucket.prefix) ? bucket.count : 0), 0);
  const byId = new Map(delta.orders.map(order => [order.externalId, order]));
  if (byId.size !== expected || byId.size !== delta.orders.length || delta.orders.some(order =>
    !buckets.has(order.externalId.slice(0, ORDER_BUCKET_PREFIX_LENGTH)) ||
    new Date(order.occurredAt) < run.windowStart || new Date(order.occurredAt) >= run.windowEnd)) {
    throw new BadRequestException('增量订单与源库校验结果不符');
  }

  const stored = delta.buckets.length ? await tx.epayOrder.findMany({
    where: {
      siteId: run.siteId, syncRunId: orderRunId,
      OR: delta.buckets.map(prefix => ({ externalId: orderBucketRange(prefix) })),
    },
  }) : [];
  const removed: string[] = [];
  for (const order of stored) {
    const next = byId.get(order.externalId);
    if (next && sameOrder(order, next)) byId.delete(order.externalId);
    else removed.push(order.id);
  }
  if (previous.orderCount - removed.length + byId.size !== run.expectedCount) {
    throw new BadRequestException('增量同步后的订单数量与源库不符');
  }
  for (let i = 0; i < removed.length; i += 500) {
    const deleted = await tx.epayOrder.deleteMany({ where: {
      siteId: run.siteId, syncRunId: orderRunId, id: { in: removed.slice(i, i + 500) },
    } });
    if (deleted.count !== Math.min(500, removed.length - i)) {
      throw new BadRequestException('增量同步基准已变化');
    }
  }
  const added = Array.from(byId.values());
  for (let i = 0; i < added.length; i += 500) {
    await tx.epayOrder.createMany({ data: added.slice(i, i + 500).map(row => orderRecord(row, run.siteId, orderRunId)) });
  }
  return orderRunId;
}
