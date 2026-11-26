export interface MonitoringLogEntry {
  at: string;
  message: string;
  url?: string;
}

export const MONITORING_LOG_LIMIT = 200;
export type MonitoringLogWriter = (entry: MonitoringLogEntry) => Promise<void>;

/** 日志只记录网址位置，移除认证信息及可能携带凭据的查询参数和片段。 */
export function monitoringLogUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return `${url.origin}${url.pathname}`.slice(0, 1000);
  } catch {
    return undefined;
  }
}

export function readMonitoringLogs(value: unknown): MonitoringLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is MonitoringLogEntry =>
    entry !== null && typeof entry === 'object' &&
    typeof entry.at === 'string' && Number.isFinite(Date.parse(entry.at)) &&
    typeof entry.message === 'string' && entry.message.length <= 200,
  ).slice(-MONITORING_LOG_LIMIT).map(entry => {
    const url = typeof entry.url === 'string' ? monitoringLogUrl(entry.url) : undefined;
    return { at: entry.at, message: entry.message, ...(url ? { url } : {}) };
  });
}
