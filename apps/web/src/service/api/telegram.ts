import { request } from '../request';

export interface TelegramScope { all: boolean; siteIds: string[]; collectorIds: string[]; accountIds: string[] }
export interface TelegramConfig {
  version: number; enabled: boolean; hasToken: boolean; username: string | null; state: string;
  lastError: string | null; menuError: string | null; heartbeatAt: string | null; eventTypes: Record<string, string>;
}
export interface NoticeTemplate { name: string; template: string }
export interface TelegramChannelNoticeConfig { enabled: boolean; intervalMinutes: number; targetIds: string[] | null; template: string; presets: NoticeTemplate[]; savedTemplates: NoticeTemplate[] }
export interface TelegramTarget {
  id: string; version: number; name: string; chatId: string; threadKey: number; enabled: boolean;
  verified: boolean; scope: TelegramScope; lastError: string | null;
}
export interface TelegramNoticeRecipient { targetId: string; repeatIntervalMinutes: number }
export type TelegramNoticeRoute = { key: string; label: string; icon: string } & (
  | { kind: 'direct'; targetIds: string[] | null; inheritsRestrictionTargets?: boolean }
  | { kind: 'event'; targetIds: string[]; repeatIntervalMinutes: number | null; recipients: TelegramNoticeRecipient[] }
);
export interface TelegramBinding {
  id: string; version: number; sysUserId: string; telegramUserId: string; displayName: string | null;
  enabled: boolean; allowedTargetIds: string[]; scope: TelegramScope;
}
export interface TelegramCommand {
  id: string; version: number; name: string; description: string; actionKey: string; enabled: boolean;
  allowedTargetIds: string[]; allowedBindingIds: string[]; confirmRequired: boolean; defaults: { minutes?: number };
}
export interface TelegramAction { key: string; name: string; command: string; permission: string; confirm: boolean; parameter: string }
export interface TelegramRecord {
  id: string; targetId: string | null; status: string; kind?: string; actionKey?: string; createdAt: string;
  text?: string; result?: string; error?: string; attempts?: number;
}
export interface NotificationIncident {
  id: string; eventType: string; entityType: string; entityId: string; title: string;
  occurredAt: string; recoveredAt: string | null; acknowledgedAt: string | null;
}
export interface TelegramOptions {
  sites: { id: string; name: string }[]; collectors: { id: string; name: string }[]; accounts: { id: string; profileNo: string | null }[];
}
export const emptyTelegramScope = (): TelegramScope => ({ all: false, siteIds: [], collectorIds: [], accountIds: [] });
export const fetchTelegramConfig = () => request<TelegramConfig>({ url: '/telegram/config' });
export const saveTelegramConfig = (data: { version: number; enabled: boolean; token?: string; replaceBot: boolean }) => request<TelegramConfig>({ url: '/telegram/config', method: 'patch', data });
export const fetchTelegramChannelNotice = () => request<TelegramChannelNoticeConfig>({ url: '/telegram/channel-notice' });
export type EnvironmentKind = 'summary';
export interface EnvironmentNoticeConfig { intervalMinutes: number; summaryTargetIds: string[]; summaryTemplate: string; presets: Record<EnvironmentKind, NoticeTemplate[]>; savedTemplates: Record<EnvironmentKind, NoticeTemplate[]> }
export const fetchEnvironmentNotice = () => request<EnvironmentNoticeConfig>({ url: '/telegram/environment-notice' });
export const saveEnvironmentNotice = ({ intervalMinutes, summaryTemplate }: EnvironmentNoticeConfig) => request<EnvironmentNoticeConfig>({ url: '/telegram/environment-notice', method: 'put', data: { intervalMinutes, summaryTemplate } });
export const editEnvironmentTemplate = (kind: EnvironmentKind, name: string, template?: string) => request<NoticeTemplate[]>({ url: '/telegram/environment-notice/templates', method: template === undefined ? 'delete' : 'post', data: { kind, name, template } });
export const testEnvironmentNotice = (kind: EnvironmentKind, template: string) => request<{ messages: number; targets: number }>({ url: '/telegram/environment-notice/test', method: 'post', data: { kind, template } });
export const saveTelegramChannelNotice = ({ enabled, intervalMinutes, template }: TelegramChannelNoticeConfig) => request<TelegramChannelNoticeConfig>({ url: '/telegram/channel-notice', method: 'put', data: { enabled, intervalMinutes, template } });
export const saveTelegramChannelNoticeTemplate = (data: { name: string; template: string }) => request<TelegramChannelNoticeConfig>({ url: '/telegram/channel-notice/templates', method: 'post', data });
export const deleteTelegramChannelNoticeTemplate = (name: string) => request<TelegramChannelNoticeConfig>({ url: '/telegram/channel-notice/templates', method: 'delete', data: { name } });
export const testTelegramChannelNotice = (template: string) => request<{ messages: number; targets: number }>({ url: '/telegram/channel-notice/test', method: 'post', data: { template } });
export const testTelegramConnection = () => request<{ success: boolean; message: string }>({ url: '/telegram/connection-test', method: 'post' });
export const fetchTelegramTargets = () => request<TelegramTarget[]>({ url: '/telegram/targets' });
export const saveTelegramTarget = (id: string, data: Pick<TelegramTarget, 'version' | 'name' | 'enabled' | 'scope'>) => request({ url: `/telegram/targets/${id}`, method: 'patch', data });
export const deleteTelegramTarget = (id: string) => request({ url: `/telegram/targets/${id}`, method: 'delete' });
export const testTelegramTarget = (id: string) => request({ url: `/telegram/targets/${id}/test`, method: 'post' });
export const fetchTelegramNoticeRoutes = () => request<TelegramNoticeRoute[]>({ url: '/telegram/notification-routes' });
export const saveTelegramNoticeRoute = (key: string, data: { targetIds: string[] } | { recipients: TelegramNoticeRecipient[]; repeatIntervalMinutes: number | null }) => request({ url: `/telegram/notification-routes/${key}`, method: 'put', data });
export const testTelegramNoticeRoute = (key: string) => request<{ messages: number; targets: number; ids: string[] }>({ url: `/telegram/notification-routes/${key}/test`, method: 'post' });
export const revokeTelegramNoticeTest = (ids: string[]) => request<{ cancelled: number; revoked: number; failed: number; sending: number }>({ url: '/telegram/notification-routes/revoke-test', method: 'post', data: { ids } });
export const createTelegramCode = (kind: 'bind' | 'connect') => request<{ command: string; expiresAt: string }>({ url: kind === 'bind' ? '/telegram/me/binding-code' : '/telegram/connect-code', method: 'post' });
export const fetchTelegramBindings = () => request<TelegramBinding[]>({ url: '/telegram/bindings' });
export const saveTelegramBinding = (id: string, data: Pick<TelegramBinding, 'version' | 'enabled' | 'allowedTargetIds' | 'scope'>) => request({ url: `/telegram/bindings/${id}`, method: 'patch', data });
export const deleteTelegramBinding = (id: string) => request({ url: `/telegram/bindings/${id}`, method: 'delete' });
export const fetchTelegramCommands = () => request<TelegramCommand[]>({ url: '/telegram/commands' });
export const fetchTelegramActions = () => request<TelegramAction[]>({ url: '/telegram/actions' });
export function saveTelegramCommand(id: string | undefined, input: Omit<TelegramCommand, 'id'>) {
  // 列表返回值含只读元数据，保存时仅提交命令可编辑字段。
  const { version, name, description, actionKey, enabled, allowedTargetIds, allowedBindingIds, confirmRequired, defaults } = input;
  return request({
    url: id ? `/telegram/commands/${id}` : '/telegram/commands',
    method: id ? 'patch' : 'post',
    data: { version, name, description, actionKey, enabled, allowedTargetIds, allowedBindingIds, confirmRequired, defaults }
  });
}
export const deleteTelegramCommand = (id: string) => request({ url: `/telegram/commands/${id}`, method: 'delete' });
export const fetchTelegramOptions = (keyword = '') => request<TelegramOptions>({ url: '/telegram/options', params: { keyword } });
export const fetchTelegramRecords = (kind: 'deliveries' | 'executions', params: { current: number; size: number; status?: string; targetId?: string; from?: string; to?: string }) => request<{ records: TelegramRecord[]; total: number }>({ url: `/telegram/${kind}`, params });
export const retryTelegramDelivery = (id: string, confirmDuplicate: boolean) => request({ url: `/telegram/deliveries/${id}/retry`, method: 'post', data: { confirmDuplicate } });
export const fetchNotificationIncidents = (params: { current: number; size: number; status?: string }) => request<{ records: NotificationIncident[]; total: number }>({ url: '/notifications/incidents', params });
export const acknowledgeNotification = (id: string) => request({ url: `/notifications/incidents/${id}/ack`, method: 'post' });
