import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma, RestrictionChannelJob } from '@prisma/client';
import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { SiteChannelService } from '../site/site-channel.service';
import { queueNotification, type AccountChannelResult } from '../notification/notification.service';
import { readAppIds } from './app-ids';
import type { AgentTaskResultDto } from './dto/agent-runtime.dto';

type Tx = Prisma.TransactionClient;
type Action = 'CLOSE' | 'RESTORE';
const RESTRICTION = 'ACCOUNT_RESTRICTION';
const JUDICIAL = 'ACCOUNT_JUDICIAL';
const limitedAccounts: Prisma.AccountWhereInput = {
  OR: [{ restrictionActive: true }, { judicialActive: true }, { businessStatus: { in: ['RESTRICTED', 'JUDICIAL'] } }],
};
const accountFields = {
  id: true, name: true, externalId: true, businessStatus: true, restrictionActive: true, judicialActive: true,
  restrictionObservedAt: true, restrictionClearedAt: true, metadata: true,
  credentials: { select: { appId: true, appIds: true } },
} satisfies Prisma.AccountSelect;
type RestrictionAccount = Prisma.AccountGetPayload<{ select: typeof accountFields }>;
const isLimited = (account: RestrictionAccount) => account.restrictionActive || account.judicialActive ||
  account.businessStatus === 'RESTRICTED' || account.businessStatus === 'JUDICIAL';
const eventTypes = (account: RestrictionAccount) => [
  ...(account.restrictionActive || account.businessStatus === 'RESTRICTED' ? [RESTRICTION] : []),
  ...(account.judicialActive || account.businessStatus === 'JUDICIAL' ? [JUDICIAL] : []),
];
const appIdsOf = (account: RestrictionAccount) => readAppIds(account.credentials?.appIds, account.credentials?.appId);
const appIdConditions = (ids: string[]): Prisma.EpayChannelWhereInput[] =>
  ids.map(appId => ({ details: { path: '$.appId', equals: appId } }));

@Injectable()
export class RestrictionChannelService {
  private readonly logger = new Logger(RestrictionChannelService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly channels: SiteChannelService) {}

  private enqueue(tx: Tx, accountId: string, action: Action, source: string, types: string[], evidence?: Record<string, string>) {
    return tx.restrictionChannelJob.create({ data: { id: randomUUID(), accountId, action, source, eventTypes: types,
      ...(evidence && Object.keys(evidence).length ? { evidence } : {}) } });
  }

  async enqueueExisting(tx: Tx, close: boolean, restore: boolean) {
    if (close) {
      const accounts = await tx.account.findMany({ where: limitedAccounts, select: accountFields });
      for (const account of accounts) await this.enqueue(tx, account.id, 'CLOSE', '开启关停设置', eventTypes(account));
    }
    if (restore) {
      const holds = await tx.restrictionChannelHold.findMany({ where: { state: 'CLOSED' }, distinct: ['accountId'], select: { accountId: true } });
      const accounts = await tx.account.findMany({ where: { id: { in: holds.map(hold => hold.accountId) },
        businessStatus: 'NORMAL', restrictionClearedAt: { not: null }, restrictionActive: false, judicialActive: false }, select: { id: true } });
      for (const account of accounts) await this.enqueue(tx, account.id, 'RESTORE', '开启恢复设置', [RESTRICTION, JUDICIAL]);
    }
  }

  /** 返回可应用到账号状态和异常提醒的巡检结果。 */
  async observe(tx: Tx, account: RestrictionAccount, dto: AgentTaskResultDto, now: Date) {
    const inspection = dto.inspection;
    const stored = (account.metadata as { restrictionKinds?: unknown } | null)?.restrictionKinds;
    const restrictionKinds = Array.isArray(stored) ? stored.filter(type => type === RESTRICTION || type === JUDICIAL) as string[] : [];
    if (!inspection || (!inspection.restriction && !inspection.judicial)) return { inspection, defer: [] as string[], observed: {}, restrictionKinds };
    const at = new Date(dto.completedAt);
    if (dto.status !== 'LOGGED_IN' || +at > +now + 60_000 || +at < +now - 300_000 ||
      (account.restrictionObservedAt && at <= account.restrictionObservedAt)) {
      return { inspection: { funds: inspection.funds }, defer: [] as string[], observed: {}, restrictionKinds };
    }
    const before = eventTypes(account);
    const hits = [
      ...(inspection.restriction?.limited ? [RESTRICTION] : []),
      ...(inspection.judicial?.limited ? [JUDICIAL] : []),
    ];
    const recovered = inspection.restriction?.limited === false && inspection.judicial?.limited === false;
    const settings = await tx.scriptSetting.findUnique({ where: { id: 'default' },
      select: { closeRestrictedChannels: true, restoreRecoveredChannels: true } });
    const cycleTypes = [...new Set([...restrictionKinds, ...before, ...hits])];
    if (recovered && cycleTypes.length) await this.enqueue(tx, account.id, 'RESTORE', '巡检确认解除限制', cycleTypes);
    else if (recovered && settings?.restoreRecoveredChannels && !account.restrictionClearedAt) {
      await this.enqueue(tx, account.id, 'RESTORE', '巡检复核恢复条件', [RESTRICTION, JUDICIAL]);
    }
    const newHits = hits.filter(type => !before.includes(type));
    if (newHits.length || (hits.length && settings?.closeRestrictedChannels && !await tx.restrictionChannelJob.findFirst({
      where: { accountId: account.id, action: 'CLOSE', completedAt: null }, select: { id: true },
    }))) {
      const evidence: Record<string, string> = {};
      if (newHits.length && inspection.restriction?.limited && inspection.restriction.image) evidence[RESTRICTION] = inspection.restriction.image;
      if (newHits.length && inspection.judicial?.limited && inspection.judicial.image) evidence[JUDICIAL] = inspection.judicial.image;
      await this.enqueue(tx, account.id, 'CLOSE', newHits.length ? '巡检发现限制' : '巡检复核限制', hits, evidence);
    }
    return { inspection, defer: newHits, restrictionKinds: recovered ? [] : cycleTypes, observed: { restrictionObservedAt: at,
      ...(recovered ? { restrictionClearedAt: account.restrictionClearedAt ?? at } : hits.length ? { restrictionClearedAt: null } : {}) } };
  }

  @Interval(2000)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const due = { completedAt: null, nextAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] };
      const jobs = await this.prisma.restrictionChannelJob.findMany({ where: due, orderBy: [{ nextAt: 'asc' }, { id: 'asc' }], take: 10, omit: { evidence: true } });
      for (const job of jobs) {
        const leaseOwner = randomUUID();
        const claimed = await this.prisma.restrictionChannelJob.updateMany({ where: { id: job.id, ...due },
          data: { leaseOwner, leaseUntil: new Date(Date.now() + 120000), attempts: { increment: 1 } } });
        if (!claimed.count) continue;
        const current = await this.prisma.restrictionChannelJob.findUniqueOrThrow({ where: { id: job.id } });
        try {
          await this.run(current);
        } catch {
          await this.prisma.restrictionChannelJob.updateMany({ where: { id: job.id, leaseOwner },
            data: { nextAt: new Date(Date.now() + 30000), leaseOwner: null, leaseUntil: null } });
          this.logger.warn('账号关联通道任务未完成，已安排重试');
        }
      }
    } catch {
      this.logger.warn('账号关联通道任务读取失败');
    } finally {
      this.running = false;
    }
  }

  private async run(job: RestrictionChannelJob) {
    const close = job.action === 'CLOSE';
    const account = await this.prisma.account.findUnique({ where: { id: job.accountId }, select: accountFields });
    const settings = await this.prisma.scriptSetting.findUnique({ where: { id: 'default' },
      select: { closeRestrictedChannels: true, restoreRecoveredChannels: true } });
    const enabled = close ? settings?.closeRestrictedChannels : settings?.restoreRecoveredChannels;
    const current = account && (close ? isLimited(account) : !isLimited(account) && !!account.restrictionClearedAt);
    const results = (job.results ?? {}) as unknown as Record<string, AccountChannelResult>;
    const previous = (job.notifiedResults ?? {}) as unknown as Record<string, AccountChannelResult>;
    if (enabled && current && account) {
      const ids = appIdsOf(account);
      const holds = close ? [] : await this.prisma.restrictionChannelHold.findMany({
        where: { OR: [{ accountId: account.id }, { appId: { in: ids } }], state: { in: ['CLOSED', 'RESTORING', 'BLOCKED'] } },
      });
      const channels = await this.prisma.epayChannel.findMany({
        where: { OR: close ? appIdConditions(ids) : [{ id: { in: holds.map(hold => hold.channelId) } }] },
        select: { id: true, siteId: true, code: true, name: true, site: { select: { name: true } } },
      });
      for (const channel of channels) {
        const earlier = results[channel.id];
        if (earlier && earlier.status !== 'FAILED') continue;
        const lease = await this.prisma.restrictionChannelJob.updateMany({ where: { id: job.id, leaseOwner: job.leaseOwner },
          data: { leaseUntil: new Date(Date.now() + 120000) } });
        if (!lease.count) return;
        const result = { siteId: channel.siteId, siteName: channel.site.name, code: channel.code, name: channel.name };
        const outcome = await this.apply(job, account.id, channel, result, results);
        results[channel.id] = { ...result, ...outcome };
      }
      for (const id of Object.keys(results)) {
        if (results[id].status === 'FAILED' && !channels.some(channel => channel.id === id)) {
          results[id] = { ...results[id], status: 'HELD', reason: '通道已移除或关联已变更' };
        }
      }
    }
    const changed = Object.entries(results).filter(([id, result]) => !isDeepStrictEqual(result, previous[id])).map(([, result]) => result);
    const first = job.notifiedResults === null;
    const announce = job.source !== '巡检复核限制' && job.source !== '巡检复核恢复条件';
    const retry = enabled && current && Object.values(results).some(result => result.status === 'FAILED');
    await this.prisma.$transaction(async tx => {
      const saved = await tx.restrictionChannelJob.updateMany({ where: { id: job.id, leaseOwner: job.leaseOwner }, data: {
        results: results as unknown as Prisma.InputJsonValue, notifiedResults: results as unknown as Prisma.InputJsonValue,
        evidence: Prisma.DbNull, leaseOwner: null, leaseUntil: null,
        ...(retry ? { nextAt: new Date(Date.now() + Math.min(job.attempts, 10) * 30000) } : { completedAt: new Date() }),
      } });
      if (!saved.count || !account || !(announce && first || changed.some(item => ['CLOSED', 'OPENED', 'FAILED', 'UNCERTAIN'].includes(item.status)))) return;
      const types = job.eventTypes as string[];
      await queueNotification(tx, 'ACCOUNT', account.id, close ? types[0] : 'ACCOUNT_RESTRICTION_RECOVERED', `${job.id}:${job.attempts}`, {
        type: close ? 'RESTRICTION' : 'RECOVERY', routes: types, title: close ? '账号受限' : '账号已解除限制',
        subject: `${account.name || account.externalId}（${account.externalId}）`, source: job.source,
        note: !current ? '账号状态已变化，本次未操作通道' : !enabled
          ? close ? '自动关停未开启' : '自动恢复未开启'
          : close && !Object.keys(results).length ? '未找到关联通道' : undefined,
        results: first ? Object.values(results) : changed,
        evidence: first ? (job.evidence as Record<string, string> | null) ?? undefined : undefined,
      });
    });
  }

  private async apply(job: RestrictionChannelJob, accountId: string, channel: { id: string; siteId: string; code: string },
    details: Omit<AccountChannelResult, 'status' | 'reason'>, results: Record<string, AccountChannelResult>) {
    const close = job.action === 'CLOSE';
    let outcome: Pick<AccountChannelResult, 'status' | 'reason'> = { status: 'HELD', reason: '账号状态或设置已变更' };
    let staged = false;
    try {
      await this.channels.restrictionStatus(channel.siteId, channel.code, close ? 0 : 1, async source => {
        const db = this.prisma;
        const [account, settings, hold] = await Promise.all([
          db.account.findUnique({ where: { id: accountId }, select: accountFields }),
          db.scriptSetting.findUnique({ where: { id: 'default' }, select: { closeRestrictedChannels: true, restoreRecoveredChannels: true } }),
          db.restrictionChannelHold.findUnique({ where: { channelId: channel.id } }),
        ]);
        if (!account || (close ? !settings?.closeRestrictedChannels || !isLimited(account) :
          !settings?.restoreRecoveredChannels || isLimited(account) || !account.restrictionClearedAt)) return false;
        if (!source.appId || !appIdsOf(account).includes(source.appId) || (!close && (hold?.fingerprint !== source.fingerprint || hold.appId !== source.appId))) {
          outcome = { status: 'HELD', reason: '原站点通道身份或关联已变化' };
          return false;
        }
        if (hold && ['CLOSING', 'RESTORING'].includes(hold.state) && !(close && source.sourceStatus === 1 && hold.state === 'CLOSING')) {
          outcome = { status: 'UNCERTAIN', reason: '上次站点写入结果待核实' };
          return false;
        }
        if (close && source.sourceStatus === 0) {
          outcome = { status: 'ALREADY_CLOSED' };
          return false;
        }
        if (!close) {
          if (hold?.state !== 'CLOSED') {
            outcome = { status: 'HELD', reason: '管理员或站点策略已要求停用' };
            return false;
          }
          const owner = hold.accountId === account.id ? account : await db.account.findUnique({ where: { id: hold.accountId }, select: accountFields });
          if (!owner?.restrictionClearedAt || isLimited(owner) || !appIdsOf(owner).includes(source.appId)) {
            outcome = { status: 'HELD', reason: '原关停账号仍受限、尚未确认恢复或已解绑' };
            return false;
          }
          const restricted = await db.account.findMany({ where: limitedAccounts, select: accountFields });
          if (restricted.some(item => appIdsOf(item).includes(source.appId))) {
            outcome = { status: 'HELD', reason: '仍关联其他受限账号' };
            return false;
          }
          if (source.sourceStatus === 1) {
            await db.restrictionChannelHold.deleteMany({ where: { channelId: channel.id, state: 'CLOSED' } });
            outcome = { status: 'ALREADY_OPEN' };
            return false;
          }
        }
        if (source.sourceStatus !== (close ? 1 : 0)) return false;
        const state = close ? 'CLOSING' : 'RESTORING';
        const data = { accountId: close ? account.id : hold!.accountId, appId: source.appId, fingerprint: source.fingerprint, state };
        await db.restrictionChannelHold.upsert({ where: { channelId: channel.id }, create: { channelId: channel.id, ...data }, update: data });
        staged = true;
        outcome = { status: close ? 'CLOSED' : 'OPENED', ...(!close && source.dayStatus !== 0 && { reason: '站点日限额暂停仍生效' }) };
        return true;
      }, async () => {
        const result = { ...details, ...outcome };
        await this.prisma.$transaction(async tx => {
          if (close) await tx.restrictionChannelHold.updateMany({ where: { channelId: channel.id, state: 'CLOSING' }, data: { state: 'CLOSED' } });
          else await tx.restrictionChannelHold.deleteMany({ where: { channelId: channel.id, state: 'RESTORING' } });
          await tx.restrictionChannelJob.updateMany({ where: { id: job.id, leaseOwner: job.leaseOwner },
            data: { results: { ...results, [channel.id]: result } as unknown as Prisma.InputJsonValue } });
        });
        staged = false;
      }, async () => {
        if (!staged) return;
        if (close) await this.prisma.restrictionChannelHold.deleteMany({ where: { channelId: channel.id, state: 'CLOSING' } });
        else await this.prisma.restrictionChannelHold.updateMany({ where: { channelId: channel.id, state: 'RESTORING' }, data: { state: 'CLOSED' } });
        staged = false;
        outcome = { status: 'FAILED' };
      });
      return outcome;
    } catch (error) {
      if (!staged && (outcome.status === 'CLOSED' || outcome.status === 'OPENED')) return outcome;
      return { status: 'FAILED' as const, reason: staged ? '站点写入未确认，将复核原站点状态' :
        error instanceof HttpException ? error.message : '站点连接或通道处理失败' };
    }
  }
}
