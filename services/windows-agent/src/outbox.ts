import { mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AgentClient, AgentHttpError } from './agent-client.js';

interface PendingReport { path: string; body: unknown }

/** 仅保存结果摘要与脱敏日志，登录凭据从不进入待发送目录。 */
export class Outbox {
  private sequence = 0;
  constructor(private readonly directory: string) { mkdirSync(directory, { recursive: true }); }
  get size() { return readdirSync(this.directory).filter(name => name.endsWith('.json')).length; }
  enqueue(path: string, body: unknown, isLog = false) {
    if (isLog && this.size >= 500) return;
    const name = `${Date.now()}-${String(this.sequence++).padStart(10, '0')}-${randomUUID()}.json`;
    const pending = join(this.directory, name + '.tmp');
    writeFileSync(pending, JSON.stringify({ path, body } satisfies PendingReport), { mode: 0o600 });
    renameSync(pending, join(this.directory, name));
  }
  async flush(client: AgentClient) {
    for (const name of readdirSync(this.directory).filter(value => value.endsWith('.json')).sort().slice(0, 100)) {
      const filename = join(this.directory, name);
      let entry: PendingReport;
      try { entry = JSON.parse(readFileSync(filename, 'utf8')) as PendingReport; }
      catch { renameSync(filename, filename + '.invalid'); continue; }
      if (!/^\/(?:script-task-result|script-logs|transfers\/[a-zA-Z0-9-]+\/(?:result|progress|screenshot|qr)|agent-commands\/[a-zA-Z0-9-]+\/receipt)$/.test(entry.path)) {
        renameSync(filename, filename + '.invalid'); continue;
      }
      try { await client.request(entry.path, entry.body); }
      catch (error) {
        // 中心拒绝过期会话或已撤销任务时，不让旧结果覆盖新状态。
        if (!(error instanceof AgentHttpError) || ![404, 409, 422].includes(error.status)) throw error;
        if (entry.path.startsWith('/transfers/')) { renameSync(filename, filename + '.rejected'); continue; }
        // 422 是数据本身不合法，重试永远不会成功：留作 .invalid 供排查，并继续发送后面的记录，避免整个队列被堵死。
        if (error.status === 422) {
          console.error('[agent] 丢弃校验失败的上报，已保留为 .invalid：' + error.message);
          renameSync(filename, filename + '.invalid');
          continue;
        }
      }
      unlinkSync(filename);
    }
  }
}
