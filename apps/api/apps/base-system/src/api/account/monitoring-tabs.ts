export type MonitoringTabKey = 'tab1' | 'tab2' | 'tab3';

export interface MonitoringTabBinding {
  targetId: string;
  /** 尚未完成首次导航时为空，下轮继续在同一标签尝试。 */
  targetUrl: string | null;
}

export type MonitoringTabBindings = Partial<Record<MonitoringTabKey, MonitoringTabBinding>>;
export type MonitoringTabWriter = (bindings: MonitoringTabBindings) => Promise<void>;

export function readMonitoringTabBindings(value: unknown): MonitoringTabBindings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: MonitoringTabBindings = {};
  for (const key of ['tab1', 'tab2', 'tab3'] as const) {
    const binding = (value as Record<string, unknown>)[key];
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) continue;
    const { targetId, targetUrl } = binding as Record<string, unknown>;
    if (typeof targetId !== 'string' || !targetId || targetId.length > 256) continue;
    if (targetUrl !== null && typeof targetUrl !== 'string') continue;
    result[key] = { targetId, targetUrl };
  }
  return result;
}
