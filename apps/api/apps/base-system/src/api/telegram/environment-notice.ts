import { randomUUID } from 'node:crypto';
import { Prisma, TelegramBot, TelegramTarget } from '@prisma/client';
import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { hash, incidentHeading } from '../notification/notification.types';
import { noticeTargets } from './channel-notice-targets';
import { accountWhere, readScope } from './telegram-policy';
import { activeTemplate, envPresets, fillEnvTemplate, perEnvironment, previousSummary } from './environment-template';
import { BadRequestException } from '@nestjs/common';

export const summaryPrefix = 'telegram.environment.summary.targets.';
export const alertPrefix = 'telegram.environment.alert.targets.';
export const intervalKey = 'telegram.environment.interval';
const lastSummaryKey = 'telegram.environment.last-summary';
const fields = {
  id: true, collectorId: true, collector: { select: { name: true } }, name: true, externalId: true, profileNo: true,
  status: true, businessStatus: true, restrictionActive: true, judicialActive: true,
  balance: true, balanceAt: true, unavailableBalance: true, pendingBalance: true,
} satisfies Prisma.AccountSelect;
export type Environment = Prisma.AccountGetPayload<{ select: typeof fields }>;
const login = { HEALTHY: '已登录', AUTH_EXPIRED: '登录已失效', CAPTCHA_REQUIRED: '需要验证码', DEGRADED: '采集异常', PASSWORD_REJECTED: '密码错误', ENV_UNAVAILABLE: '环境不可用', UNKNOWN: '未知' };
const stamp = (date: Date) => date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
const short = (name: string) => name.replace(/[\r\n]+/g, ' ').slice(0, 120);
function accountFields(row: Environment) {
  const states = [row.restrictionActive && '账号限制', row.judicialActive && '司法限制'].filter(Boolean);
  const business = states.join('、') || ({ NORMAL: '正常', UNKNOWN: '未知', RESTRICTED: '账号限制', JUDICIAL: '司法限制' })[row.businessStatus];
  const money = [row.balance, row.unavailableBalance, row.pendingBalance].map(value => value?.toFixed(2) ?? '—');
  return { BH: short(row.profileNo || row.externalId), HJ: short(row.name || '—'), DL: login[row.status], ZH: business, KY: money[0], BKY: money[1], DJS: money[2] };
}
interface Entry { id: string; collector?: string; detail?: string; pending?: boolean; rank?: number }
const clock = (date: Date) => date.toISOString().slice(11, 16);
function summaryEntry(row: Environment, rowTemplate: string | undefined, at: Date): Entry {
  const restricted = row.restrictionActive || row.judicialActive || ['RESTRICTED', 'JUDICIAL'].includes(row.businessStatus);
  const loginIssue = row.status !== 'HEALTHY' && row.status !== 'UNKNOWN';
  const pending = row.status === 'UNKNOWN' || row.businessStatus === 'UNKNOWN';
  const f = accountFields(row);
  const money = (value: string) => value.replace(/\B(?=(\d{3})+\.)/g, ',');
  if (rowTemplate) {
    const rank = restricted ? 3 : loginIssue ? 2 : pending ? 1 : 0;
    return { id: row.id, rank, detail: fillEnvTemplate(rowTemplate, { ...f, ZT: ['🟢','⚪','🟠','🔴'][rank],
      DL: row.status === 'AUTH_EXPIRED' ? '已掉线' : f.DL, KY: money(f.KY), BKY: money(f.BKY), DJS: money(f.DJS),
      CJD: short(row.collector?.name || '未分配采集端'), SJ: stamp(at), CJSJ: row.balanceAt ? stamp(row.balanceAt) : '—' }) };
  }
  if (!restricted && !loginIssue) return { id: row.id, pending };
  const hasBalance = [row.balance, row.unavailableBalance, row.pendingBalance].some(value => value != null);
  const balance = row.status === 'HEALTHY' && hasBalance
    ? '可用 ' + money(f.KY) + ' · 不可用 ' + money(f.BKY) + ' · 待结算 ' + money(f.DJS)
    : '余额未更新' + (row.balanceAt ? ' · 最近成功采集 ' + clock(row.balanceAt) + ' UTC' : ' · 暂无成功采集记录');
  return { id: row.id, detail: [(restricted ? '🔴' : '🟠') + ' #' + f.BH + '｜' + f.HJ,
    '登录：' + (row.status === 'AUTH_EXPIRED' ? '已掉线' : f.DL) + ' · 账号：' + f.ZH, balance].join('\n') };
}
interface Digest { collectorId?: string | null; collector?: string; entries: Entry[]; template?: string; perRow?: boolean }
// 把快照与环境 ID 一起排队，发送前剔除已移出该群范围的环境；投递成功才用最终正文替换。
export function digestParts(rows: Environment[], template = envPresets.summary[0].template, at = new Date()): Digest[] {
  const perRow = perEnvironment(template);
  if (!rows.length) return [];
  const entries = rows.map(row => {
    const entry = summaryEntry(row, perRow ? template : undefined, at);
    if (!perRow) entry.collector = short(row.collector?.name || '未分配采集端');
    return entry;
  });
  const priority = (entry: Entry) => entry.rank ?? (entry.detail?.startsWith('🔴') ? 2 : entry.detail ? 1 : 0);
  entries.sort((a, b) => priority(b) - priority(a));
  return [{ template, perRow, entries }];
}
export async function renderSummary(db: Prisma.TransactionClient, target: TelegramTarget, payload: string, at: Date) {
  const part: Digest = JSON.parse(payload);
  const allowed = await db.account.findMany({ where: { ...accountWhere([readScope(target.scope)]), ...(part.collectorId !== undefined && { collectorId: part.collectorId }), profilePresent: true, id: { in: part.entries.map(row => row.id) } }, select: { id: true } });
  const ids = new Set(allowed.map(row => row.id));
  return renderDigest(part, at, part.entries.filter(row => ids.has(row.id)));
}

export function renderDigest(part: Digest, at: Date, entries = part.entries) {
  if (!entries.length) return null;
  if (part.perRow) return entries.map(row => row.detail).join('\n\n');
  const abnormal = entries.flatMap(row => row.detail ? [row.detail] : []);
  const pending = entries.filter(row => row.pending).length;
  const healthy = entries.length - abnormal.length - pending;
  return fillEnvTemplate(part.template ?? previousSummary, { CJD: part.collector ?? [...new Set(entries.map(row => row.collector))].join('、'), SJ: clock(at) + ' UTC', ZS: String(entries.length), YC: String(abnormal.length), MX: abnormal.join('\n\n'),
    DQR: pending ? '⚪ ' + pending + ' 个环境：状态待确认' : '',
    ZC: healthy ? '🟢 ' + (healthy < entries.length ? '其余 ' : '') + healthy + ' 个环境：已登录，账号正常' : '' }).replace(/\n{3,}/g, '\n\n');
}
export async function scheduleEnvironmentSummary(db: PrismaService, bot: TelegramBot, now: Date) {
  await db.$transaction(async tx => {
    const interval = await tx.systemSetting.findUnique({ where: { key: intervalKey } });
    const last = await tx.systemSetting.findUnique({ where: { key: lastSummaryKey } });
    if (last && now.getTime() - Number(last.value) < Number(interval?.value ?? 15) * 60000) return;
    const ids = await noticeTargets(tx, summaryPrefix);
    if (!ids?.length) return;
    // 通过条件更新领取本轮任务，重启和租约交接都沿用持久化时间。
    const value = String(now.getTime());
    const claimed = last ? await tx.systemSetting.updateMany({ where: { key: lastSummaryKey, value: last.value }, data: { value } }) : await tx.systemSetting.createMany({ data: [{ key: lastSummaryKey, value }], skipDuplicates: true });
    if (!claimed.count) return;
    await queueEnvironment(tx, bot, now, ids, await activeTemplate(tx, 'summary'), false);
  });
}
export async function queueEnvironment(tx: Prisma.TransactionClient, bot: TelegramBot, now: Date, ids: string[], template: string, manual: boolean, requireAll = manual) {
    let messages = 0, recipients = 0;
    const batch = manual ? randomUUID() : String(now.getTime());
    const targets = await tx.telegramTarget.findMany({ where: { id: { in: ids }, botId: bot.botId!, enabled: true, verified: true, archived: false } });
    if (requireAll && targets.length !== ids.length) throw new BadRequestException('接收群已停用或失效，请重新选择');
    for (const target of targets) {
      const destination = { botId: bot.botId!, epoch: bot.dispatchEpoch, targetId: target.id, chatId: target.chatId, threadKey: target.threadKey, createdAt: now };
      const rows = await tx.account.findMany({ where: { ...accountWhere([readScope(target.scope)]), profilePresent: true }, select: fields, orderBy: [{ collectorId: 'asc' }, { profileNo: 'asc' }, { id: 'asc' }] });
      const deliveries = digestParts(rows, template, now).map((part, index) => ({ ...destination, id: randomUUID(), kind: manual ? 'ENV_SUMMARY_TEST' : 'ENV_SUMMARY', text: JSON.stringify(part), dedupeKey: hash('env-summary:' + bot.dispatchEpoch + ':' + batch + ':' + target.id + ':' + index) }));
      if (deliveries.length) { await tx.telegramDelivery.createMany({ data: deliveries, skipDuplicates: true }); recipients++; messages += deliveries.length; }
    }
    return { messages, targets: recipients };
}
export async function renderEnvironmentAlert(db: Prisma.TransactionClient, id: string, eventType: string, title: string, phase: string, time: Date) {
  if (phase === 'RECOVER') return null;
  const restriction = eventType === 'ACCOUNT_RESTRICTION';
  const judicial = eventType === 'ACCOUNT_JUDICIAL';
  const row = await db.account.findFirst({ where: { id, profilePresent: true }, select: { ...fields, restrictionImage: restriction, judicialImage: judicial } });
  if (!row) return null;
  return formatEnvironmentAlert(row, restriction ? row.restrictionImage : judicial ? row.judicialImage : null, eventType, title, phase, time);
}

export function formatEnvironmentAlert(row: Environment, image: string | null, eventType: string, title: string, phase: string, time: Date) {
  const f = accountFields(row);
  const context = [
    incidentHeading(eventType, title, phase),
    `环境：#${f.BH}｜${f.HJ}`, `采集端：${short(row.collector?.name ?? '未分配')}`,
  ];
  const guidance: Record<string, string> = {
    ACCOUNT_LOGIN_REQUIRED: '请打开该环境，重新登录后检查巡检结果。',
    ACCOUNT_PASSWORD_REJECTED: '巡检已关闭。请核对账号密码后重新启用巡检。',
    ACCOUNT_CAPTCHA_REQUIRED: '请在该环境完成验证码校验，再检查登录状态。',
    ACCOUNT_ENV_UNAVAILABLE: '环境打开失败。请检查采集端连接和环境启动记录。',
    ACCOUNT_COLLECTION_FAILED: '页面数据采集失败。请查看采集记录和页面状态。',
  };
  if (eventType === 'ACCOUNT_RESTRICTION' || eventType === 'ACCOUNT_JUDICIAL') {
    const label = eventType === 'ACCOUNT_JUDICIAL' ? '司法图片' : '限制图片';
    context.push(`可用余额：${f.KY}　不可用余额：${f.BKY}`, `余额采集：${row.balanceAt ? stamp(row.balanceAt) : '暂无记录'}`,
      image ? label + '（附图）' : label + '：暂无截图');
  } else context.push(`登录状态：${f.DL}`, guidance[eventType] ?? title);
  context.push(`发生时间：${stamp(time)}`);
  return { image, text: context.join('\n') };
}
