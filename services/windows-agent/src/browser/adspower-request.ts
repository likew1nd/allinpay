import { setTimeout as delay } from 'node:timers/promises';

interface RequestQueue {
  tail: Promise<void>;
  nextAt: number;
  pending: number;
  cleanup?: NodeJS.Timeout;
}

const queues = new Map<string, RequestQueue>();

/** 同一 AdsPower 地址的启动、分页同步共享每秒一次的请求额度。 */
export async function fetchAdsPower(endpoint: string, path: string, options: RequestInit): Promise<Response> {
  const key = new URL(endpoint).origin;
  let queue = queues.get(key);
  if (!queue) {
    queue = { tail: Promise.resolve(), nextAt: 0, pending: 0 };
    queues.set(key, queue);
  }
  clearTimeout(queue.cleanup);
  queue.pending += 1;
  const previous = queue.tail;
  let release!: () => void;
  queue.tail = new Promise<void>(resolve => { release = resolve; });
  try {
    await previous;
    options.signal?.throwIfAborted();
    const wait = queue.nextAt - Date.now();
    if (wait > 0) await delay(wait, undefined, { signal: options.signal ?? undefined });
    options.signal?.throwIfAborted();
    queue.nextAt = Date.now() + 1000;
    return await fetch(new URL(path, endpoint).toString(), options);
  } finally {
    queue.pending -= 1;
    release();
    if (queue.pending === 0) {
      queue.cleanup = setTimeout(() => {
        if (queues.get(key) === queue && queue.pending === 0) queues.delete(key);
      }, Math.max(0, queue.nextAt - Date.now()));
      queue.cleanup.unref();
    }
  }
}
