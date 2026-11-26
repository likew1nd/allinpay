/** 同一已发布快照的聚合结果可复用，并合并同时到达的相同查询。 */
export class SnapshotQueryCache<T> {
  private readonly entries = new Map<string, Promise<T>>();

  get(keyParts: readonly unknown[], load: () => PromiseLike<T>): Promise<T> {
    const key = JSON.stringify(keyParts);
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }

    const result: Promise<T> = Promise.resolve().then(load).catch((error: unknown) => {
      if (this.entries.get(key) === result) this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, result);
    // 限制筛选条件和历史快照占用的进程内存。
    if (this.entries.size > 512) this.entries.delete(this.entries.keys().next().value!);
    return result;
  }
}
