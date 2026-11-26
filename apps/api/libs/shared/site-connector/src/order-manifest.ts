export const ORDER_BUCKET_PREFIX_LENGTH = 12;
export const MAX_ORDER_BUCKETS = 20_000;

export type OrderBucket = { prefix: string; count: number; digest: string | null };
export type OrderManifest = { version: 1; typeNamesDigest: string; buckets: OrderBucket[] };

export function orderBucketRange(prefix: string) {
  return {
    gte: prefix,
    lte: prefix.length < ORDER_BUCKET_PREFIX_LENGTH ? prefix : prefix.padEnd(30, '9'),
  };
}

export function orderManifest(typeNamesDigest: string, buckets: OrderBucket[]): OrderManifest | undefined {
  if (buckets.length > MAX_ORDER_BUCKETS || buckets.some(({ prefix, count, digest }) =>
    !/^\d{1,12}$/.test(prefix) || !Number.isSafeInteger(count) || count <= 0 ||
    (digest !== null && !/^[0-9a-f]{64}$/.test(digest)))) return undefined;
  return { version: 1, typeNamesDigest, buckets };
}

export function changedOrderBuckets(current: OrderManifest, previous?: OrderManifest): string[] | undefined {
  if (!previous || previous.typeNamesDigest !== current.typeNamesDigest) return undefined;
  const before = new Map(previous.buckets.map(bucket => [bucket.prefix, bucket]));
  const after = new Map(current.buckets.map(bucket => [bucket.prefix, bucket]));
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter(prefix => {
    const oldBucket = before.get(prefix);
    const newBucket = after.get(prefix);
    return !oldBucket?.digest || !newBucket || oldBucket.digest !== newBucket.digest || oldBucket.count !== newBucket.count;
  });
  // 单轮差异过大时沿用流式全量发布，控制内存及发布事务时长。
  const affected = changed.reduce((sum, prefix) => sum + (before.get(prefix)?.count ?? 0) + (after.get(prefix)?.count ?? 0), 0);
  return changed.length <= 64 && affected <= 10_000 ? changed : undefined;
}
