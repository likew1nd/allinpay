import { resolve } from 'node:path';
import { AgentClient } from './agent-client.js';
import { AgentRuntime } from './agent-runtime.js';
import { AdsPowerClient } from './adspower.js';
import { AdsPowerBrowserClient } from './browser/adspower-browser.js';
export { SCRIPT_VERSION } from './agent-runtime.js';

export function createRuntime() {
  const root = required('CENTRAL_API_URL').replace(/\/+$/, '');
  const apiUrl = root.endsWith('/v1') ? root : `${root}/v1`;
  const collectorId = required('COLLECTOR_ID');
  const endpoint = required('ADSPOWER_ENDPOINT').replace(/\/+$/, '');
  const apiKey = required('ADSPOWER_API_KEY');
  // 环境同步间隔不再由本机环境变量决定，改为中心脚本设置里的“环境同步时间（分）”下发
  return new AgentRuntime(new AgentClient(apiUrl, collectorId, required('COLLECTOR_TOKEN')), new AdsPowerClient(endpoint, apiKey),
    new AdsPowerBrowserClient(endpoint, apiKey), collectorId, resolve(process.env.AGENT_STATE_DIR || '.agent-state'));
}
function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 未配置`);
  return value;
}
