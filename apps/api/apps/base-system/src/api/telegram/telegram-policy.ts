import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface TelegramScope { all: boolean; siteIds: string[]; collectorIds: string[]; accountIds: string[] }
export const EMPTY_SCOPE: TelegramScope = { all: false, siteIds: [], collectorIds: [], accountIds: [] };
export function readScope(value: unknown): TelegramScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('业务范围格式错误');
  const input = value as Record<string, unknown>;
  if (typeof input.all !== 'boolean' || Object.keys(input).some(key => !['all', 'siteIds', 'collectorIds', 'accountIds'].includes(key))) throw new BadRequestException('业务范围字段错误');
  return { all: input.all, siteIds: readIds(input.siteIds), collectorIds: readIds(input.collectorIds), accountIds: readIds(input.accountIds) };
}
export function readIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 1000 || value.some(id => typeof id !== 'string' || !id || id.length > 191)) throw new BadRequestException('允许范围必须为编号列表');
  return [...new Set(value as string[])];
}
export function accountWhere(scopes: TelegramScope[]): Prisma.AccountWhereInput {
  return { AND: scopes.filter(scope => !scope.all).map(scope => ({ OR: [
    { id: { in: scope.accountIds } }, { collectorId: { in: scope.collectorIds } },
    { bindings: { some: { enabled: true, siteId: { in: scope.siteIds } } } },
  ] })) };
}
export function collectorWhere(scopes: TelegramScope[]): Prisma.CollectorWhereInput {
  return { AND: scopes.filter(scope => !scope.all).map(scope => ({ id: { in: scope.collectorIds } })) };
}
export function adjustmentWhere(scopes: TelegramScope[]): Prisma.AdjustmentRecordWhereInput {
  return { AND: scopes.filter(scope => !scope.all).map(scope => ({ siteId: { in: scope.siteIds } })) };
}
export function parseCommand(text: string, botUsername: string) {
  const match = /^\/([a-z0-9_]{1,32})(?:@([a-zA-Z0-9_]+))?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!match || (match[2] && match[2].toLowerCase() !== botUsername.toLowerCase())) return null;
  return { name: match[1], args: (match[3]?.trim() ?? '').split(/\s+/).filter(Boolean) };
}
export const ACTIONS = [
  { key: 'help', name: '帮助', command: 'help', permission: '', confirm: false, parameter: '' },
  { key: 'status.read', name: '运行概况', command: 'status', permission: 'account:read', confirm: false, parameter: '' },
  { key: 'account.read', name: '查询账号', command: 'account', permission: 'account:read', confirm: false, parameter: '账号ID或环境编号' },
  { key: 'incident.read', name: '当前异常', command: 'alerts', permission: 'notification:read', confirm: false, parameter: '' },
  { key: 'incident.ack', name: '确认告警', command: 'ack', permission: 'notification:update', confirm: true, parameter: '事件ID' },
  { key: 'incident.mute', name: '静默提醒', command: 'mute', permission: 'notification:update', confirm: true, parameter: '事件ID 分钟' },
  { key: 'account.monitoring.pause', name: '暂停账号巡检', command: 'monitor_pause', permission: 'account:update', confirm: true, parameter: '账号ID或环境编号' },
  { key: 'account.monitoring.resume', name: '恢复账号巡检', command: 'monitor_resume', permission: 'account:update', confirm: true, parameter: '账号ID或环境编号' },
] as const;
export const commandNameValid = (name: string) => /^[a-z0-9_]{1,32}$/.test(name) && !['bind', 'connect'].includes(name);
export function safeTelegramError(error: unknown): string {
  // Telegram URL 包含 Token，禁止返回原始异常或网络请求内容。
  const code = (error as { error_code?: number })?.error_code;
  return ({ 400: '请求无效或话题不可用', 401: 'Bot 凭据失效', 403: 'Bot 无发送权限或已被移出群', 409: 'Bot 接收冲突，请检查其他部署', 429: 'Telegram 发送频率受限' } as Record<number, string>)[code ?? 0] ?? 'Telegram 网络请求失败，结果可能不确定';
}
