import type { EnvironmentProfile } from '../../../contracts/collector-agent.js';
import { fetchAdsPower } from './browser/adspower-request.js';

export class AdsPowerClient {
  constructor(private readonly endpoint: string, private readonly apiKey: string) {}

  async listProfiles(): Promise<EnvironmentProfile[]> {
    const profiles = new Map<string, EnvironmentProfile>();
    const signal = AbortSignal.timeout(60_000);
    for (let page = 1; page <= 1000; page++) {
      let response: Response;
      try { response = await fetchAdsPower(this.endpoint, '/api/v2/browser-profile/list', {
        method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ page, limit: 100, sort_type: 'profile_no', sort_order: 'asc' }), redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      }); } catch { throw new Error('无法连接本机 AdsPower API'); }
      if (!response.ok) throw new Error(`AdsPower 请求失败（HTTP ${response.status}）`);
      let payload: { code?: number; data?: { list?: Record<string, unknown>[] } };
      try { payload = await response.json() as typeof payload; } catch { throw new Error('AdsPower 返回格式无效'); }
      if (payload.code !== 0 || !Array.isArray(payload.data?.list) || payload.data.list.length > 100) throw new Error('AdsPower 环境列表格式无效');
      const list = payload.data.list;
      for (const item of list) {
        if (!item || typeof item.profile_id !== 'string' || !item.profile_id || item.profile_id.length > 128 || profiles.has(item.profile_id)) throw new Error('AdsPower 环境 ID 无效或重复');
        const text = (key: string) => {
          const value = item[key];
          if (value === undefined || value === null) return '';
          if (!['string', 'number'].includes(typeof value) || String(value).length > 191) throw new Error('AdsPower 环境字段格式无效');
          return String(value);
        };
        profiles.set(item.profile_id, { externalId: item.profile_id, profileNo: text('profile_no'), name: text('name'), groupName: text('group_name') });
      }
      if (list.length < 100) return [...profiles.values()];
    }
    throw new Error('AdsPower 环境数量超过同步上限');
  }
}
