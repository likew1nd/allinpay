import { isIP } from 'node:net';
import { fetchAdsPower } from './adspower-request';

import { BadRequestException } from '@nestjs/common';

export interface AdsPowerProfile {
  externalId: string;
  profileNo: string;
  name: string;
  groupName: string;
}

export class AdsPowerFailure extends Error {}

export function normalizeAdsPowerEndpoint(value: string): string {
  const input = value.trim();
  try {
    const url = new URL(input.includes('://') ? input : `http://${input}`);
    const explicitPort = /:(\d{1,5})\/?$/.exec(input);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // 只接受用户明确配置的 IP 和端口，不接受任意 URL 路径或重定向。
    if (!['http:', 'https:'].includes(url.protocol) || !isIP(host) || !explicitPort || Number(explicitPort[1]) < 1 ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    return `${url.protocol}//${url.hostname}:${Number(explicitPort[1])}`;
  } catch {
    throw new BadRequestException('请输入有效的 IP:端口，例如 127.0.0.1:50325');
  }
}

export async function listAdsPowerProfiles(endpoint: string, apiKey: string): Promise<AdsPowerProfile[]> {
  const profiles = new Map<string, AdsPowerProfile>();
  const signal = AbortSignal.timeout(60_000);
  for (let page = 1; page <= 1000; page += 1) {

    let response: Response;
    try {
      response = await fetchAdsPower(endpoint, '/api/v2/browser-profile/list', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ page, limit: 100, sort_type: 'profile_no', sort_order: 'asc' }),
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      });
    } catch {
      throw new AdsPowerFailure('无法连接 AdsPower API，请检查 IP、端口、API 服务和访问权限');
    }
    if (response.status === 401 || response.status === 403)
      throw new AdsPowerFailure('AdsPower API 认证失败，请检查 API Key 和访问权限');
    if (!response.ok) throw new AdsPowerFailure('AdsPower API 请求失败，请检查服务状态');
    let payload: { code?: number; data?: { list?: Record<string, unknown>[] } };
    try { payload = await response.json() as typeof payload; }
    catch { throw new AdsPowerFailure('AdsPower API 返回格式无效，请确认地址和客户端版本'); }
    // 外部错误消息和环境密码都不写入数据库或日志。
    if (payload?.code !== 0 || !Array.isArray(payload.data?.list))
      throw new AdsPowerFailure('AdsPower 环境查询失败，请检查 API Key、接口权限和客户端版本');
    const list = payload.data.list;
    if (list.length > 100) throw new AdsPowerFailure('AdsPower 环境分页格式无效');
    for (const item of list) {
      if (!item || typeof item.profile_id !== 'string' || !item.profile_id || item.profile_id.length > 128 ||
        profiles.has(item.profile_id)) throw new AdsPowerFailure('AdsPower 环境列表无效或分页重复，请重试');
      const text = (key: string, max = 191) => {
        const value = item[key];
        if (value === undefined || value === null) return '';
        if (!['string', 'number'].includes(typeof value) || String(value).length > max)
          throw new AdsPowerFailure('AdsPower 环境字段格式无效');
        return String(value);
      };
      profiles.set(item.profile_id, {
        externalId: item.profile_id,
        profileNo: text('profile_no'),
        name: text('name'),
        groupName: text('group_name'),
      });
    }
    if (list.length < 100) return [...profiles.values()];
  }
  throw new AdsPowerFailure('AdsPower 环境数量超过同步上限，请联系管理员');
}
