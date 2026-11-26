import { Redis, Cluster } from 'ioredis';

import { RedisConfig } from '@lib/config/redis.config';

export class RedisUtility {
  static get memoryMode(): boolean {
    if (process.env.REDIS_DISABLED !== 'Y') return false;
    if (
      process.env.NODE_ENV !== 'development' &&
      process.env.NODE_ENV !== 'test'
    ) {
      throw new Error(
        'REDIS_DISABLED is only supported in development and test',
      );
    }
    return true;
  }
  static get instance(): Redis | Cluster {
    return this._instance as Redis | Cluster;
  }
  private static _instance: Redis | Cluster | MemoryRedis;
  private static initializing: Promise<Redis | Cluster | MemoryRedis> | null =
    null;

  private static async createInstance(): Promise<
    Redis | Cluster | MemoryRedis
  > {
    if (this.memoryMode) {
      return new MemoryRedis();
    }

    const [config] = await Promise.all([RedisConfig()]);
    if (config.mode === 'cluster') {
      this._instance = new Redis.Cluster(
        config.cluster.map((node) => ({
          host: node.host,
          port: node.port,
          password: node.password,
        })),
        {
          redisOptions: {
            password: config.cluster[0].password,
            db: config.standalone.db,
          },
        },
      );
    } else {
      this._instance = new Redis({
        host: config.standalone.host,
        port: config.standalone.port,
        password: config.standalone.password,
        db: config.standalone.db,
      });
    }
    return this._instance;
  }

  public static async client(): Promise<Redis | Cluster | MemoryRedis> {
    if (!this._instance) {
      if (!this.initializing) {
        this.initializing = this.createInstance();
      }
      this._instance = await this.initializing;
      this.initializing = null;
    }
    return this._instance;
  }
}

/** Small development fallback for environments without a local Redis service. */
export class MemoryRedis {
  private readonly sets = new Map<string, Set<string>>();
  private readonly hashes = new Map<string, Map<string, string>>();
  private readonly values = new Map<string, string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  private clear(key: string) {
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
    const deleted = [
      this.sets.delete(key),
      this.hashes.delete(key),
      this.values.delete(key),
    ];
    return deleted.some(Boolean) ? 1 : 0;
  }

  async del(key: string) {
    return this.clear(key);
  }

  async sadd(key: string, ...members: string[]) {
    const set = this.sets.get(key) ?? new Set<string>();
    const before = set.size;
    members.forEach((member) => set.add(member));
    this.sets.set(key, set);
    return set.size - before;
  }

  async smembers(key: string) {
    return [...(this.sets.get(key) ?? new Set<string>())];
  }

  async srem(key: string, ...members: string[]) {
    const set = this.sets.get(key);
    if (!set) return 0;
    const removed = members.reduce(
      (count, member) => count + (set.delete(member) ? 1 : 0),
      0,
    );
    if (set.size === 0) this.sets.delete(key);
    return removed;
  }

  async hgetall(key: string) {
    return Object.fromEntries(
      this.hashes.get(key) ?? new Map<string, string>(),
    );
  }

  async hset(key: string, field: string, value: string) {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    const isNew = !hash.has(field);
    hash.set(field, value);
    this.hashes.set(key, hash);
    return isNew ? 1 : 0;
  }

  async hdel(key: string, ...fields: string[]) {
    const hash = this.hashes.get(key);
    if (!hash) return 0;
    const removed = fields.reduce(
      (count, field) => count + (hash.delete(field) ? 1 : 0),
      0,
    );
    if (hash.size === 0) this.hashes.delete(key);
    return removed;
  }

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, mode?: 'EX' | 'PX', ttl?: number) {
    this.clear(key);
    this.values.set(key, value);
    if (mode && ttl !== undefined) {
      await this.expire(key, mode === 'EX' ? ttl : ttl / 1000);
    }
    return 'OK';
  }

  async expire(key: string, seconds: number) {
    if (!this.sets.has(key) && !this.hashes.has(key) && !this.values.has(key))
      return 0;
    clearTimeout(this.timers.get(key));
    if (seconds <= 0) return this.clear(key);
    const timer = setTimeout(() => this.clear(key), seconds * 1000);
    timer.unref();
    this.timers.set(key, timer);
    return 1;
  }

  async info() {
    return 'memory-redis development fallback';
  }
}
