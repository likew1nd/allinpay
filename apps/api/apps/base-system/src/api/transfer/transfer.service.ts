import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { ulid } from 'ulid';
import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { AccountService } from '../account/account.service';
import { PageAccountDto } from '../account/dto/account.dto';
import { decryptSiteSecret } from '../site/site-credentials';
import { accountWhere, readScope } from '../telegram/telegram-policy';
import { noticeTargets } from '../telegram/channel-notice-targets';
import { transferNoticePrefixes } from '../telegram/notification-routing';
import { hash } from '../notification/notification.types';
import { CollectorTransferResultDto, CreateTransferTestDto, PageTransferDto, ResolveTransferDto, SetEnvironmentTransferDto, TransferProgressDto, TransferQrDto, TransferScreenshotDto } from './dto/transfer.dto';
import { ACTIVE_TRANSFER_STATUSES, EXECUTING_TRANSFER_STATUSES, balanceFreshMsOf, canTransition, computeTransferAmount, toCents } from './transfer-calc';
import { allocateTransfer } from './transfer-allocation';
import { firstMatchingTransferRule } from './transfer-conditions';
import { maskAccount } from './payee.service';
import { formatQrVoid, formatTransferQr, formatTransferResult, missingTransferScreenshot, transferResultKey } from './transfer-notice';
import { encryptSiteSecret } from '../site/site-credentials';
import type { TransferAllocation, TransferStrategyRule } from '../../../../../../../contracts/transfer-strategy';

export function startOfShanghaiDay(now: Date) {
  return new Date(Math.floor((now.getTime() + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000);
}
const MAX_CONCURRENT_TRANSFERS = 2;
const RESERVED_STATUSES = [...ACTIVE_TRANSFER_STATUSES, 'SUCCEEDED'];
// 未完成任务跨日仍占用额度，成功任务按实际完成时间计入当天。转账测试单不属于任何策略，不计入策略额度。
const dailyReserved = (now: Date): Prisma.TransferRequestWhereInput => ({ mode: 'AUTO', OR: [
  { status: { in: [...ACTIVE_TRANSFER_STATUSES] } },
  { status: 'SUCCEEDED', completedAt: { gte: startOfShanghaiDay(now) } },
] });
type Tx = Prisma.TransactionClient;
// 写进执行日志的状态中文名
const STATUS_LABELS: Record<string, string> = { SUCCEEDED: '成功', FAILED: '失败', UNKNOWN: '结果未知', NEEDS_MANUAL: '待人工处理', CANCELLED: '已取消' };

@Injectable()
export class TransferService {
  private readonly logger = new Logger(TransferService.name);
  private ticking = false;
  constructor(private readonly prisma: PrismaService, private readonly accounts: AccountService) {}
  private readonly include = {
    account: { select: { id: true, name: true, externalId: true } },
    payee: { select: { id: true, name: true, accountMasked: true } },
    fundAccount: { select: { id: true, name: true } }, rule: { select: { id: true, name: true } },
  } as const;

  // 统一展示形状：测试单的收款人来自单据自带字段，账号只给脱敏值；不把加密串返回给前端
  private present<T extends { mode: string; payee: { id: string; name: string; accountMasked: string } | null; testPayeeName: string | null; testPayeeAccountEncrypted: string | null; id: string }>(row: T) {
    const { testPayeeAccountEncrypted, ...rest } = row;
    let masked = '—';
    if (row.mode === 'TEST' && testPayeeAccountEncrypted) {
      try { masked = maskAccount(decryptSiteSecret(row.id, 'test-payee-account', testPayeeAccountEncrypted)); } catch { /* 解密失败时不影响列表 */ }
    }
    return { ...rest, payee: row.payee ?? { id: '', name: row.testPayeeName ?? (row.mode === 'TEST' ? '测试收款' : '—'), accountMasked: masked } };
  }

  async environments(query: PageAccountDto) {
    const page = await this.accounts.pageAccounts({ ...query, transferOnly: true });
    const records = await Promise.all(page.records.map(async account => {
      const channelFilters = account.linkedSites.map(site => ({ siteId: site.id, code: { in: site.channels.map(channel => channel.code) } }));
      const channels = channelFilters.length ? await this.prisma.epayChannel.findMany({ where: { OR: channelFilters }, select: { details: true } }) : [];
      const incomes = channels.map(channel => (channel.details as { totalSuccessAmount?: string } | null)?.totalSuccessAmount);
      const totalIncome = incomes.length && incomes.every(value => value !== undefined)
        ? incomes.reduce((sum, value) => sum.plus(value!), new Prisma.Decimal(0)).toFixed(2) : null;
      const [outgoing, active, rule] = await Promise.all([
        this.prisma.transferRequest.aggregate({ where: { accountId: account.id, status: 'SUCCEEDED', mode: 'AUTO' }, _sum: { amount: true } }),
        this.prisma.transferRequest.findFirst({ where: { accountId: account.id, status: { in: [...ACTIVE_TRANSFER_STATUSES] } }, orderBy: { createdAt: 'asc' }, select: { status: true } }),
        account.transferRuleId ? this.prisma.transferRule.findUnique({ where: { id: account.transferRuleId }, select: { id: true, name: true, enabled: true } }) : null,
      ]);
      return { ...account, transferRule: rule, transferStatus: active?.status ?? (account.transferRefreshRequired ? 'REFRESHING' : !rule ? 'NO_RULE' : !rule.enabled ? 'RULE_DISABLED' : 'WAITING'),
        totalIncome, totalTransferred: outgoing._sum.amount?.toFixed(2) ?? '0.00' };
    }));
    return { ...page, records };
  }

  async setEnvironment(id: string, dto: SetEnvironmentTransferDto) {
    return this.prisma.$transaction(async tx => {
      const owner = await tx.account.findUnique({ where: { id }, select: { collectorId: true } });
      if (owner?.collectorId) await tx.$queryRaw(Prisma.sql`SELECT id FROM collector WHERE id = ${owner.collectorId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM account WHERE id = ${id} FOR UPDATE`);
      const account = await tx.account.findUnique({ where: { id } });
      if (!account?.collectorId || !account.profilePresent) throw new NotFoundException('环境不存在或未关联采集端');
      if (account.collectorId !== owner?.collectorId) throw new ConflictException('环境归属已变化，请刷新后重试');
      if (dto.ruleId) {
        // 加锁后再读：和策略删除互斥，不会把环境绑到刚被删除的策略上
        await tx.$queryRaw(Prisma.sql`SELECT id FROM transfer_rule WHERE id = ${dto.ruleId} FOR UPDATE`);
        const rule = await tx.transferRule.findUnique({ where: { id: dto.ruleId } });
        if (!rule || rule.isTemplate || rule.deletedAt) throw new ConflictException('请选择有效的转账策略');
      }
      const listed = dto.listed ?? account.transferListed;
      if (dto.enabled === true && !listed) throw new ConflictException('请先在环境列表开启自动转账');
      const enabled = listed && (dto.enabled ?? (dto.listed !== undefined ? dto.listed : account.transferEnabled));
      // 旧入口只有转账权限；需要联动监控时，必须走同时校验两种权限的模式接口。
      if (enabled && (dto.enabled !== undefined || dto.listed !== undefined) && !account.monitoringEnabled) {
        throw new ConflictException('请先在环境列表选择转账模式');
      }
      const updated = await tx.account.update({ where: { id }, data: {
        ...(dto.listed !== undefined ? { transferListed: dto.listed } : {}),
        ...(dto.enabled !== undefined || dto.listed !== undefined ? { transferEnabled: enabled } : {}),
        ...(dto.ruleId !== undefined ? { transferRuleId: dto.ruleId } : {}),
        ...(enabled && (dto.enabled !== undefined || dto.listed !== undefined) ? { scriptNextAt: new Date() } : {}),
      } });
      if (!updated.transferEnabled) await tx.transferRequest.updateMany({ where: { accountId: id, status: 'READY' },
        data: { status: 'CANCELLED', completedAt: new Date(), resultNote: '环境自动转账已关闭' } });
      // 单纯切换转账策略不改变监控配置版本或打断轮询。
      return { id: updated.id, transferListed: updated.transferListed, transferEnabled: updated.transferEnabled, transferRuleId: updated.transferRuleId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async pageRequests(query: PageTransferDto) {
    const where: Prisma.TransferRequestWhereInput = { ...(query.status ? { status: query.status } : {}),
      ...(query.accountId ? { accountId: query.accountId } : {}), ...(query.fundAccountId ? { fundAccountId: query.fundAccountId } : {}) };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.transferRequest.findMany({ where, include: this.include, orderBy: { createdAt: 'desc' }, skip: (query.current - 1) * query.size, take: query.size }),
      this.prisma.transferRequest.count({ where }),
    ]);
    return { current: query.current, size: query.size, records: records.map(row => this.present(row)), total };
  }

  @Interval(30000)
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      // 先把采集端重连后遗留的未提交单退回待领取，再做超时兜底；顺序不能反，否则这些单会先被兜底处理掉
      await this.requeueOrphaned().catch(() => this.logger.warn('重新排队遗留转账单失败'));
      await this.markStaleClaims();
      const accounts = await this.prisma.account.findMany({ where: { transferEnabled: true, monitoringEnabled: true, transferRuleId: { not: null }, profilePresent: true, collectorId: { not: null } }, select: { id: true } });
      for (const account of accounts) {
        try { await this.evaluateAccount(account.id); }
        catch { this.logger.warn('环境转账评估失败：' + account.id); }
      }
    } finally { this.ticking = false; }
  }

  async markStaleClaims() {
    const cutoff = new Date(Date.now() - 30 * 60000);
    const stale = { OR: [{ progressAt: { lt: cutoff } }, { progressAt: null, claimedAt: { lt: cutoff } }] };
    const rows = await this.prisma.transferRequest.findMany({ where: { status: { in: EXECUTING_TRANSFER_STATUSES }, ...stale },
      select: { id: true, status: true, sessionId: true, accountId: true } });
    for (const row of rows) {
      const data = row.status === 'PREPARING'
        ? { status: 'FAILED', completedAt: new Date(), resultNote: '执行超时，中心未授权提交付款' }
        : { status: 'UNKNOWN', resultNote: '执行超时，无法确认付款结果，请核对流水' };
      await this.prisma.$transaction(async tx => {
        const result = await tx.transferRequest.updateMany({ where: { id: row.id, status: row.status, sessionId: row.sessionId, ...stale }, data });
        if (!result.count) return;
        await this.appendProgress(tx, row.id, `【任务结束】${STATUS_LABELS[data.status]}：30 分钟没有收到采集端进度，${data.resultNote}`);
        if (data.status === 'FAILED' && row.accountId) await tx.account.update({ where: { id: row.accountId }, data: { transferRefreshRequired: true, scriptNextAt: new Date() } });
      });
    }
  }

  // 采集端进度日志：心跳和事件都按时间追加，页面像监控日志一样查看；只保留最近 300 条，重复上报按时间+内容去重
  async progress(collectorId: string, token: string | undefined, id: string, dto: TransferProgressDto) {
    await this.accounts.authenticateCollector(collectorId, token);
    return this.prisma.$transaction(async tx => {
      const row = await tx.transferRequest.findFirst({ where: { id, collectorId, sessionId: dto.sessionId, status: { in: EXECUTING_TRANSFER_STATUSES } }, select: { progressLogs: true } });
      if (!row) return { accepted: 0 };
      const logs = Array.isArray(row.progressLogs) ? [...(row.progressLogs as Array<{ at: string; message: string }>)] : [];
      let accepted = 0;
      for (const entry of dto.logs) {
        const time = Date.parse(entry.at);
        const at = Number.isFinite(time) ? new Date(time).toISOString() : new Date().toISOString();
        if (logs.some(item => item.at === at && item.message === entry.message)) continue;
        logs.push({ at, message: entry.message.slice(0, 200) });
        accepted += 1;
      }
      const last = dto.logs[dto.logs.length - 1];
      await tx.transferRequest.update({ where: { id }, data: {
        progressAt: new Date(), progressNote: last.message.slice(0, 200),
        progressLogs: logs.slice(-300) as unknown as Prisma.InputJsonValue,
      } });
      return { accepted };
    });
  }

  /**
   * 采集端上报转账终态截图（单独接口，不进 /result，截图出错不能连带丢掉结果）。
   * - 只收本采集端、本会话领取的单；不限制中心状态：被强制结束或超时兜底的单，采集端的后续 /result 会 409，截图仍要保留。
   * - 执行中（CLAIMED）的单不收：此时还没有终态，不允许提前写入。
   * - 一单一图，重复上传覆盖，保证幂等；JPEG 魔数不对直接拒绝。
   */
  async saveScreenshot(collectorId: string, token: string | undefined, id: string, dto: TransferScreenshotDto) {
    await this.accounts.authenticateCollector(collectorId, token);
    const bytes = Buffer.from(dto.image.slice(dto.image.indexOf(',') + 1), 'base64');
    if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new ConflictException('截图不是有效的 JPEG 图片');
    return this.prisma.$transaction(async tx => {
      await this.fence(tx, collectorId, dto.sessionId);
      const transfer = await tx.transferRequest.findFirst({ where: { id, collectorId, sessionId: dto.sessionId }, select: { id: true, status: true, screenshot: { select: { result: true } } } });
      if (!transfer) throw new NotFoundException('转账任务不存在或会话不匹配');
      if (EXECUTING_TRANSFER_STATUSES.includes(transfer.status)) throw new ConflictException('转账仍在执行中，暂不接收截图');
      const now = new Date();
      await tx.transferScreenshot.upsert({ where: { transferId: id }, create: { transferId: id, image: dto.image, result: dto.result }, update: { image: dto.image, result: dto.result, createdAt: now } });
      await tx.transferRequest.update({ where: { id }, data: { screenshotAt: now } });
      if (transfer.status === dto.result && transfer.screenshot?.result !== dto.result) await this.notifyWithScreenshot(tx, id);
      return { accepted: 1 };
    });
  }

  /**
   * 采集端上报扫码确认二维码：把图片排进 TG 队列，发给业务范围内的群。
   * - 只收执行中（CLAIMED）的单，会话必须匹配；每个群每单只排一条，重复上报靠 dedupeKey 幂等。
   * - 转账测试单也使用扫码二维码接收群设置，且群业务范围必须包含该付款环境。
   * - 没有可发送的群不报错，只在进度日志里留痕，采集端仍按 8 分钟超时处理。
   */
  async saveQr(collectorId: string, token: string | undefined, id: string, dto: TransferQrDto) {
    await this.accounts.authenticateCollector(collectorId, token);
    const bytes = Buffer.from(dto.image.slice(dto.image.indexOf(',') + 1), 'base64');
    if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new ConflictException('二维码不是有效的 JPEG 图片');
    return this.prisma.$transaction(async tx => {
      await this.fence(tx, collectorId, dto.sessionId);
      const transfer = await tx.transferRequest.findFirst({ where: { id, collectorId, sessionId: dto.sessionId, status: 'CLAIMED' }, include: { account: true, payee: true } });
      if (!transfer?.accountId) throw new NotFoundException('转账任务不存在、会话不匹配或已结束');
      const shown = this.present(transfer);
      const text = formatTransferQr({ accountName: transfer.account?.name || transfer.accountId, amount: transfer.amount.toFixed(2),
        payeeName: shown.payee.name, accountMasked: shown.payee.accountMasked, outBizNo: transfer.outBizNo }, dto.waitMinutes, dto.expiresText);
      const bot = await tx.telegramBot.findUnique({ where: { id: 'default' } });
      let queued = 0;
      if (bot?.enabled && bot.botId) {
        const targets = await this.transferTargets(tx, bot.botId, 'TRANSFER_QR');
        for (const target of targets) {
          if (!await tx.account.findFirst({ where: { id: transfer.accountId, ...accountWhere([readScope(target.scope)]) }, select: { id: true } })) continue;
          const dedupeKey = hash('transfer-qr:' + id + ':' + target.id);
          await tx.telegramDelivery.upsert({ where: { dedupeKey }, update: {}, create: {
            id: ulid(), botId: bot.botId, epoch: bot.dispatchEpoch, targetId: target.id, chatId: target.chatId, threadKey: target.threadKey,
            kind: 'TRANSFER_QR', transferRequestId: id, dedupeKey, text, image: dto.image,
          } });
          queued += 1;
        }
      }
      await this.appendProgress(tx, id, queued ? `【扫码确认】二维码已发送到 ${queued} 个 TG 群，等待扫码` : '【扫码确认】没有可发送的 TG 群，等待扫码（超时将失败）');
      return { queued };
    });
  }

  /** 读取单张转账截图；列表接口只带 screenshotAt，不带图片，查看或展示缩略图时才按需读取 */
  async getScreenshot(id: string) {
    const row = await this.prisma.transferScreenshot.findUnique({ where: { transferId: id }, select: { image: true, result: true, createdAt: true } });
    return { image: row?.image ?? null, result: row?.result ?? null, capturedAt: row?.createdAt.toISOString() ?? null };
  }

  async progressLogs(id: string) {
    const row = await this.prisma.transferRequest.findUnique({ where: { id }, select: { status: true, resultNote: true, progressAt: true, progressNote: true, progressLogs: true } });
    if (!row) throw new NotFoundException('转账单不存在');
    const records = Array.isArray(row.progressLogs) ? row.progressLogs as Array<{ at: string; message: string }> : [];
    return { status: row.status, resultNote: row.resultNote, progressAt: row.progressAt, progressNote: row.progressNote, records };
  }

  // 手动转账测试：自带收款账号，直接生成待领取的 TEST 单，由所属采集端按普通转账执行。
  // 不收集姓名：企业账号在支付宝页面显示成“****司”，姓名无法核对。
  async createTest(accountId: string, dto: CreateTransferTestDto, actor: string) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM account WHERE id = ${accountId} FOR UPDATE`);
      const account = await tx.account.findUnique({ where: { id: accountId }, include: { credentials: true } });
      if (!account?.collectorId || !account.profilePresent) throw new NotFoundException('环境不存在或未关联采集端');
      if (!account.credentials?.paymentPasswordEncrypted) throw new ConflictException('该环境没有配置支付密码');
      if (account.restrictionActive || account.judicialActive) throw new ConflictException('环境账号受限，不能转账');
      if (await tx.transferRequest.findFirst({ where: { accountId, status: { in: [...ACTIVE_TRANSFER_STATUSES] } } })) {
        throw new ConflictException('该环境已有未完成的转账单，请等待完成后再测试');
      }
      const freshMs = balanceFreshMsOf((await tx.scriptSetting.findUnique({ where: { id: 'default' }, select: { balanceFreshMinutes: true } }))?.balanceFreshMinutes);
      if (!account.balance || !account.balanceAt || Date.now() - account.balanceAt.getTime() > freshMs || account.balanceAt.getTime() > Date.now() + 60000) {
        throw new ConflictException(`余额数据不新鲜（超过 ${freshMs / 60000} 分钟未采集），请等待下一次余额采集后再测试`);
      }
      if (account.balance.lt(dto.amount)) throw new ConflictException('余额不足');
      if (!account.paymentUnlimited && account.paymentLimit != null && account.paymentLimit.lt(dto.amount)) throw new ConflictException('超过该环境的单笔支付限额');
      const id = 'transfer-' + ulid().toLowerCase();
      let payeeAccount = dto.payeeAccount?.trim() ?? '';
      if (dto.payeeId) {
        // 选择收款池账号：完整账号只在后端解密，不经过前端
        const payee = await tx.payee.findUnique({ where: { id: dto.payeeId }, select: { id: true, status: true, accountEncrypted: true } });
        if (!payee) throw new NotFoundException('收款账号不存在');
        if (payee.status !== 'ACTIVE') throw new ConflictException('该收款账号已停用，请先启用或换一个');
        payeeAccount = decryptSiteSecret(payee.id, 'payee-account', payee.accountEncrypted);
      }
      if (!payeeAccount) throw new ConflictException('请填写或选择接收人账号');
      const remark = Number(dto.amount) >= 1 ? (dto.remark ?? '').trim().slice(0, 20) : '';
      await tx.transferRequest.create({ data: {
        id, outBizNo: 'TEST' + ulid(), accountId, mode: 'TEST', status: 'READY', amount: dto.amount,
        balanceSnapshot: account.balance, balanceAt: account.balanceAt, reserveSnapshot: 0,
        testPayeeName: null, testPayeeAccountEncrypted: encryptSiteSecret(id, 'test-payee-account', payeeAccount),
        testRemark: remark || null,
      } });
      this.logger.log(`转账测试单已创建：${id}（操作人 ${actor}）`);
      return tx.transferRequest.findUniqueOrThrow({ where: { id }, include: this.include });
    });
  }

  async evaluateAccount(accountId: string, now = new Date()) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM account WHERE id = ${accountId} FOR UPDATE`);
      const account = await tx.account.findUnique({ where: { id: accountId }, include: { transferRule: true } });
      const rule = account?.transferRule;
      if (!account?.transferEnabled || !account.monitoringEnabled || !account.profilePresent || !account.collectorId || !rule?.enabled || rule.isTemplate || rule.mode !== 'AUTO') return { skipped: 'DISABLED' };
      if (account.transferRefreshRequired || account.status !== 'HEALTHY') return { skipped: 'WAITING_REFRESH' };
      if (account.restrictionActive || account.judicialActive) return { skipped: 'RESTRICTED' };
      if (!account.balance || !account.balanceAt) return { skipped: 'NO_BALANCE' };
      if (await tx.transferRequest.findFirst({ where: { accountId, status: { in: [...ACTIVE_TRANSFER_STATUSES] } } })) return { skipped: 'ACTIVE_TRANSFER_EXISTS' };
      const latest = await tx.transferRequest.findFirst({ where: { accountId, mode: 'AUTO' }, orderBy: { createdAt: 'desc' } });
      if (latest && latest.balanceAt >= account.balanceAt) return { skipped: 'SAME_SNAPSHOT' };
      const spent = await tx.transferRequest.aggregate({ where: { accountId, ...dailyReserved(now) }, _sum: { amount: true } });
      const evalSettings = await tx.scriptSetting.findUnique({ where: { id: 'default' }, select: { balanceFreshMinutes: true } });
      const matched = rule.rules == null ? null : firstMatchingTransferRule(rule.rules as unknown as TransferStrategyRule[], {
        BALANCE: account.balance.toFixed(2),
        UNAVAILABLE_BALANCE: account.unavailableBalance?.toFixed(2) ?? null,
        PENDING_BALANCE: account.pendingBalance?.toFixed(2) ?? null,
        TRANSFERRED_TODAY: spent._sum.amount?.toFixed(2) ?? '0.00',
      });
      if (rule.rules != null && !matched) return { skipped: 'NO_MATCHING_RULE' };
      // 只执行首条命中规则；金额或收款额度不足时不尝试后续规则。
      const result = computeTransferAmount({ rule: { triggerBalance: matched ? '0' : rule.triggerBalance.toFixed(2), reserveAmount: rule.reserveAmount.toFixed(2),
        feeBuffer: rule.feeBuffer.toFixed(2), minAmount: rule.minAmount.toFixed(2), maxAmount: matched?.maxAmount ?? rule.maxAmount.toFixed(2), dailyLimit: rule.dailyLimit?.toFixed(2) ?? null },
        balance: account.balance.toFixed(2), balanceAt: account.balanceAt, now, spentToday: spent._sum.amount?.toFixed(2) ?? '0', freshMs: balanceFreshMsOf(evalSettings?.balanceFreshMinutes) });
      if ('skip' in result) return { skipped: result.skip };
      if (!account.paymentUnlimited && account.paymentLimit !== null && toCents(result.amount) > toCents(account.paymentLimit.toFixed(2))) return { skipped: 'PAYMENT_LIMIT' };
      const allocations = matched?.allocations ?? rule.allocations as unknown as TransferAllocation[] | null;
      if (!allocations?.length) return { skipped: 'NO_ALLOCATION' };
      const capacities = await this.recipientCapacities(tx, allocations, now);
      const splits = allocateTransfer(result.amount, allocations, capacities);
      if (!splits?.length) return { skipped: 'PAYEE_CAPACITY' };
      const batchId = 'batch-' + ulid().toLowerCase();
      for (const split of splits) await tx.transferRequest.create({ data: {
        id: 'transfer-' + ulid().toLowerCase(), outBizNo: 'OUT' + ulid(), batchId, accountId, ruleId: rule.id, ruleVersion: rule.version,
        payeeId: split.payeeId, amount: split.amount, reserveSnapshot: rule.reserveAmount.plus(rule.feeBuffer),
        balanceSnapshot: account.balance, balanceAt: account.balanceAt, mode: 'AUTO', status: 'READY',
      } });
      return { created: batchId };
    }, { timeout: 20000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  private async recipientCapacities(tx: Tx, allocations: TransferAllocation[], now: Date) {
    const targets: Prisma.PayeeWhereInput[] = [];
    const fixed = allocations.filter(a => a.kind === 'PAYEE').map(a => a.targetId);
    const pools = allocations.filter(a => a.kind === 'POOL').map(a => a.targetId);
    if (fixed.length) targets.push({ id: { in: fixed } });
    if (pools.length) targets.push({ poolId: { in: pools }, pool: { enabled: true } });
    // AUTO 原本可从所有启用账号中抽取，包括未入池的账号。
    const where: Prisma.PayeeWhereInput = allocations.some(a => a.kind === 'AUTO')
      ? { status: 'ACTIVE' } : { status: 'ACTIVE', OR: targets };
    const candidates = await tx.payee.findMany({ where, select: { id: true } });
    if (!candidates.length) return [];
    const ids = candidates.map(row => row.id).sort();
    // 先确定范围，再按主键顺序加锁。等待其他事务期间账号可能停用、换池或调整额度。
    await tx.$queryRaw(Prisma.sql`SELECT id FROM payee FORCE INDEX (PRIMARY) WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
    const payees = await tx.payee.findMany({
      where: { AND: [where, { id: { in: ids } }] },
      select: { id: true, poolId: true, pool: { select: { enabled: true } }, dailyLimit: true, totalLimit: true },
    });
    const totalIds = payees.filter(p => p.totalLimit !== null).map(p => p.id);
    const dailyIds = payees.filter(p => p.dailyLimit !== null).map(p => p.id);
    const totals = totalIds.length ? await tx.transferRequest.groupBy({
      by: ['payeeId'], where: { payeeId: { in: totalIds }, status: { in: RESERVED_STATUSES } }, _sum: { amount: true },
    }) : [];
    const days = dailyIds.length ? await tx.transferRequest.groupBy({
      by: ['payeeId'], where: { payeeId: { in: dailyIds }, ...dailyReserved(now) }, _sum: { amount: true },
    }) : [];
    const totalUsed = new Map(totals.map(row => [row.payeeId, row._sum.amount]));
    const dailyUsed = new Map(days.map(row => [row.payeeId, row._sum.amount]));
    const remaining = (limit: Prisma.Decimal | null, used: Prisma.Decimal | null | undefined) =>
      limit === null ? Number.MAX_SAFE_INTEGER : toCents(Prisma.Decimal.max(0, limit.minus(used ?? 0)).toFixed(2));
    return payees.map(p => ({
      id: p.id, poolId: p.poolId, poolEnabled: p.pool?.enabled ?? false,
      remaining: Math.min(remaining(p.totalLimit, totalUsed.get(p.id)), remaining(p.dailyLimit, dailyUsed.get(p.id))),
    }));
  }

  /**
   * 转账执行时需要登录：按转账单下发登录凭据。
   * 只给本会话领取的、执行中的单；凭据缺失、被拒绝、冷却中只返回状态不下发。
   * 已点过“下一步”的单不再下发，登录页对它没有意义，且防止付款后误走登录流程。
   */
  async loginCredentials(collectorId: string, token: string | undefined, id: string, sessionId: string) {
    await this.accounts.authenticateCollector(collectorId, token);
    return this.prisma.$transaction(async tx => {
      await this.fence(tx, collectorId, sessionId);
      const transfer = await tx.transferRequest.findFirst({ where: { id, collectorId, sessionId, status: 'PREPARING' } });
      if (!transfer?.accountId) return { status: 'stopped' };
      const credentials = await tx.accountCredentials.findUnique({ where: { accountId: transfer.accountId } });
      if (!credentials?.loginAccount || !credentials.passwordEncrypted) return { status: 'missing' };
      if (credentials.loginBlocked) return { status: 'blocked' };
      if (credentials.loginAttemptAfter && credentials.loginAttemptAfter > new Date()) return { status: 'cooldown' };
      return { status: 'ready', loginAccount: credentials.loginAccount,
        password: decryptSiteSecret(transfer.accountId, 'account-password', credentials.passwordEncrypted) };
    });
  }

  /** 转账时页面提示账号或密码错误：把凭据标记为被拒绝，修正前不再自动登录。 */
  async loginRejected(collectorId: string, token: string | undefined, id: string, sessionId: string) {
    await this.accounts.authenticateCollector(collectorId, token);
    return this.prisma.$transaction(async tx => {
      await this.fence(tx, collectorId, sessionId);
      const transfer = await tx.transferRequest.findFirst({ where: { id, collectorId, sessionId, status: 'PREPARING' } });
      if (transfer?.accountId) await tx.accountCredentials.updateMany({ where: { accountId: transfer.accountId }, data: { loginBlocked: true } });
      return { accepted: true };
    });
  }

  async cancel(id: string, actor: string) {
    const result = await this.prisma.transferRequest.updateMany({ where: { id, status: 'READY' },
      data: { status: 'CANCELLED', completedAt: new Date(), resultNote: '已取消（' + actor + '）' } });
    if (!result.count) throw new ConflictException('仅未领取的转账单可以取消');
    return this.prisma.transferRequest.findUniqueOrThrow({ where: { id }, include: this.include });
  }

  /** 仅第一个请求可取得提交许可。响应丢失或重复请求都不能再次授权点击。 */
  async authorizeSubmission(collectorId: string, token: string | undefined, id: string, sessionId: string) {
    await this.accounts.authenticateCollector(collectorId, token);
    return this.prisma.$transaction(async tx => {
      await this.fence(tx, collectorId, sessionId);
      const { count } = await tx.transferRequest.updateMany({
        where: { id, collectorId, sessionId, status: 'PREPARING' },
        data: { status: 'CLAIMED', progressAt: new Date(), progressNote: '中心已授权提交，等待付款结果' },
      });
      if (!count) throw new ConflictException('单据已结束或已取得提交许可，请核对结果');
      return { authorized: true };
    });
  }

  /**
   * 中心改动转账单状态时，同时往执行日志追加一条，让日志本身就能看出结局：
   * 采集端的最后一条日志可能丢失或在结果之后被拒收，只看日志会分不清是成功了还是卡住了。
   */
  private async appendProgress(db: Tx | PrismaService, id: string, message: string) {
    const row = await db.transferRequest.findUnique({ where: { id }, select: { progressLogs: true } });
    const logs = Array.isArray(row?.progressLogs) ? [...(row!.progressLogs as Array<{ at: string; message: string }>)] : [];
    logs.push({ at: new Date().toISOString(), message: ('【中心】' + message).slice(0, 200) });
    await db.transferRequest.update({ where: { id }, data: { progressLogs: logs.slice(-300) as unknown as Prisma.InputJsonValue } });
  }

  /** 只有处于准备阶段的任务才能确定尚未付款。 */
  async forceStop(id: string, actor: string) {
    return this.prisma.$transaction(async tx => {
      const existing = await tx.transferRequest.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('转账单不存在');
      if (!EXECUTING_TRANSFER_STATUSES.includes(existing.status)) throw new ConflictException('仅执行中的转账单可以强制结束');
      const submitted = existing.status === 'CLAIMED';
      const data = submitted
        ? { status: 'UNKNOWN', resultNote: `执行中被强制结束（${actor}），无法确认付款结果，请核对流水` }
        : { status: 'FAILED', completedAt: new Date(), resultNote: `准备付款时被强制结束（${actor}），中心未授权提交` };
      if (!(await tx.transferRequest.updateMany({ where: { id, status: existing.status, sessionId: existing.sessionId }, data })).count) throw new ConflictException('单据阶段已变化，请刷新后重试');
      if (existing.accountId) await tx.account.update({ where: { id: existing.accountId }, data: { transferRefreshRequired: true, scriptNextAt: new Date() } });
      await this.appendProgress(tx, id, `【任务结束】${STATUS_LABELS[data.status]}：${data.resultNote}`);
      this.logger.warn(`转账单被强制结束：${id}（${actor}，${submitted ? '已提交，转未知' : '未提交，判失败'}）`);
      return tx.transferRequest.findUniqueOrThrow({ where: { id }, include: this.include });
    });
  }

  /** 会话更换后只重排未获许可的任务，已授权和历史执行单进入人工核对。 */
  async requeueOrphaned() {
    const cutoff = new Date(Date.now() - 60_000);
    const stale = { OR: [{ progressAt: { lt: cutoff } }, { progressAt: null, claimedAt: { lt: cutoff } }] };
    const rows = await this.prisma.transferRequest.findMany({ where: { status: { in: EXECUTING_TRANSFER_STATUSES }, ...stale },
      select: { id: true, status: true, collectorId: true, sessionId: true } });
    for (const row of rows) {
      const collector = row.collectorId ? await this.prisma.collector.findUnique({ where: { id: row.collectorId }, select: { agentSessionId: true } }) : null;
      if (!collector?.agentSessionId || collector.agentSessionId === row.sessionId) continue;
      const pending = row.status === 'PREPARING';
      const message = pending ? '采集端已重连，中心未授权付款，已重新排队' : '采集端已重连，付款结果未知，请核对流水';
      await this.prisma.$transaction(async tx => {
        const result = await tx.transferRequest.updateMany({ where: { id: row.id, status: row.status, sessionId: row.sessionId, ...stale },
          data: pending
            ? { status: 'READY', collectorId: null, sessionId: null, claimedAt: null, progressAt: null, progressNote: message }
            : { status: 'UNKNOWN', resultNote: message } });
        if (result.count) await this.appendProgress(tx, row.id, message);
      });
    }
  }

  async resolve(id: string, dto: ResolveTransferDto, actor: string) {
    return this.prisma.$transaction(async tx => {
      const existing = await tx.transferRequest.findUnique({ where: { id } });
      if (!existing || !['UNKNOWN', 'NEEDS_MANUAL'].includes(existing.status)) throw new ConflictException('仅结果不明的转账可以核实');
      if (!(await tx.transferRequest.updateMany({ where: { id, status: existing.status },
        data: { status: dto.status, completedAt: new Date(), resultNote: dto.note.trim() + '（' + actor + '核实）' } })).count) throw new ConflictException('状态已变化');
      if (existing.accountId) await tx.account.update({ where: { id: existing.accountId }, data: { transferRefreshRequired: true, scriptNextAt: new Date() } });
      await this.appendProgress(tx, id, `人工核实为${STATUS_LABELS[dto.status] ?? dto.status}（${actor}）：${dto.note.trim()}`);
      await this.notifyWithScreenshot(tx, id);
      return tx.transferRequest.findUniqueOrThrow({ where: { id }, include: this.include });
    });
  }

  private async fence(tx: Tx, collectorId: string, sessionId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM collector WHERE id = ${collectorId} FOR UPDATE`);
    const collector = await tx.collector.findUnique({ where: { id: collectorId } });
    if (!collector || collector.agentSessionId !== sessionId) throw new ConflictException('采集端会话已被替换');
    return collector;
  }

  async claim(collectorId: string, token: string | undefined, sessionId: string, supportsConfirmation: boolean) {
    await this.accounts.authenticateCollector(collectorId, token);
    return this.prisma.$transaction(async tx => {
      await this.fence(tx, collectorId, sessionId);
      if (!supportsConfirmation) return { transfer: null, reason: 'UPDATE_REQUIRED' };
      // 所有采集端共用两个名额。持有同一个设置行锁直到领单提交，避免同时拿到最后一个名额。
      await tx.$queryRaw(Prisma.sql`SELECT id FROM script_setting WHERE id = 'default' FOR UPDATE`);
      const settings = await tx.scriptSetting.findUnique({ where: { id: 'default' } });
      if (!settings?.enabled) return { transfer: null, reason: 'PAUSED' };
      const transfers = await tx.transferRequest.count({ where: { status: { in: EXECUTING_TRANSFER_STATUSES } } });
      if (transfers >= MAX_CONCURRENT_TRANSFERS) return { transfer: null, reason: 'BUSY' };
      // 转账测试单不要求环境开启自动转账，也不依赖策略和收款人库，其余条件（串行、余额、受限）与自动单一致
      const accountFilter = (test: boolean) => ({ collectorId, profilePresent: true, ...(test ? {} : { transferEnabled: true, monitoringEnabled: true }),
        transferRefreshRequired: false, OR: [{ scriptLeaseUntil: null }, { scriptLeaseUntil: { lt: new Date() } }],
        transfers: { none: { status: { in: [...EXECUTING_TRANSFER_STATUSES, 'UNKNOWN', 'NEEDS_MANUAL'] } } } });
      const claimInclude = { account: { include: { credentials: true } }, payee: { include: { pool: true } }, rule: true } as const;
      let candidate = await tx.transferRequest.findFirst({ where: { status: 'READY', OR: [
        { mode: 'TEST', account: accountFilter(true) }, { mode: { not: 'TEST' }, account: accountFilter(false) }] },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: claimInclude });
      if (!candidate?.account) return { transfer: null, reason: 'NONE' };
      const isTest = candidate.mode === 'TEST';
      const accountId = candidate.account.id;
      await tx.$queryRawUnsafe('SELECT id FROM account WHERE id = ? FOR UPDATE', accountId);
      if (!isTest) {
        await tx.$queryRawUnsafe('SELECT id FROM transfer_rule WHERE id = ? FOR UPDATE', candidate.ruleId);
        await tx.$queryRawUnsafe('SELECT id FROM payee WHERE id = ? FOR UPDATE', candidate.payeeId);
        if (candidate.payee?.poolId) await tx.$queryRawUnsafe('SELECT id FROM transfer_pool WHERE id = ? FOR UPDATE', candidate.payee.poolId);
      }
      candidate = await tx.transferRequest.findUnique({ where: { id: candidate.id }, include: claimInclude });
      if (!candidate?.account || candidate.status !== 'READY' || (!isTest && (!candidate.account.transferEnabled || !candidate.account.monitoringEnabled)) ||
        candidate.account.transferRefreshRequired || (candidate.account.scriptLeaseUntil && candidate.account.scriptLeaseUntil > new Date()))
        return { transfer: null, reason: 'TAKEN' };
      const account = candidate.account;
      if (!isTest && (!candidate.rule?.enabled || candidate.payee?.status !== 'ACTIVE' || candidate.payee?.pool?.enabled === false)) {
        await tx.transferRequest.update({ where: { id: candidate.id }, data: { status: 'CANCELLED', completedAt: new Date(), resultNote: '策略或收款账号已停用' } });
        return { transfer: null, reason: 'INVALIDATED' };
      }
      if (!account.balanceAt || (Date.now() - account.balanceAt.getTime() > balanceFreshMsOf(settings.balanceFreshMinutes) || account.balanceAt.getTime() > Date.now() + 60000) || account.status !== 'HEALTHY') {
        await tx.account.update({ where: { id: account.id }, data: { transferRefreshRequired: true, scriptNextAt: new Date() } });
        return { transfer: null, reason: 'BALANCE_STALE' };
      }
      if (!account.balance || account.balance.lt(candidate.amount.plus(candidate.reserveSnapshot)) || account.restrictionActive || account.judicialActive || (!account.paymentUnlimited && account.paymentLimit != null && account.paymentLimit.lt(candidate.amount))) {
        // 自动单按批次整批作废；测试单没有批次，只作废自己
        await tx.transferRequest.updateMany({ where: isTest ? { id: candidate.id, status: 'READY' } : { batchId: candidate.batchId, status: 'READY' },
          data: { status: 'CANCELLED', completedAt: new Date(), resultNote: '余额不足或账号受限，本次剩余分笔作废' } });
        return { transfer: null, reason: 'INVALIDATED' };
      }
      if (!(await tx.transferRequest.updateMany({ where: { id: candidate.id, status: 'READY' },
        data: { status: 'PREPARING', collectorId, sessionId, claimedAt: new Date(), progressAt: new Date(), progressNote: '已领取，准备付款' } })).count) return { transfer: null, reason: 'TAKEN' };
      const payee = isTest
        ? { name: candidate.testPayeeName ?? '', account: decryptSiteSecret(candidate.id, 'test-payee-account', candidate.testPayeeAccountEncrypted ?? '') }
        : { name: candidate.payee!.name, account: decryptSiteSecret(candidate.payee!.id, 'payee-account', candidate.payee!.accountEncrypted) };
      return { transfer: { id: candidate.id, outBizNo: candidate.outBizNo, amount: candidate.amount.toFixed(2), payerExternalId: account.externalId,
        payerLoginAccount: account.credentials?.loginAccount || null, mode: isTest ? 'TEST' : 'AUTO', remark: isTest ? candidate.testRemark : null, payee,
        paymentPassword: account.credentials?.paymentPasswordEncrypted
          ? decryptSiteSecret(account.id, 'account-payment-password', account.credentials.paymentPasswordEncrypted) : null }, reason: null };
    }, { timeout: 20000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async report(collectorId: string, token: string | undefined, id: string, dto: CollectorTransferResultDto) {
    await this.accounts.authenticateCollector(collectorId, token);
    return this.prisma.$transaction(async tx => {
      await this.fence(tx, collectorId, dto.sessionId);
      const existing = await tx.transferRequest.findFirst({ where: { id, collectorId, sessionId: dto.sessionId } });
      if (!existing) throw new NotFoundException('转账任务不存在或会话不匹配');
      if (existing.status === dto.status) return { id, status: existing.status };
      if (!EXECUTING_TRANSFER_STATUSES.includes(existing.status) || !canTransition(existing.status, dto.status)) throw new ConflictException('转账状态已变化');
      if (!(await tx.transferRequest.updateMany({ where: { id, status: existing.status }, data: {
        status: dto.status, resultNote: dto.note?.trim() ?? null, completedAt: new Date(),
        ...(dto.status === 'FAILED' && dto.failureCode ? { failureCode: dto.failureCode } : {}),
      } })).count) throw new ConflictException('转账状态已变化');
      // 优先级：同一批次还有待领取的分笔单时，成功后先不标记刷新余额，让采集端马上领下一笔；分笔金额建单时已按可转额度算好，余额刷新放到整批结束后
      const nextPending = dto.status === 'SUCCEEDED' && existing.batchId
        ? await tx.transferRequest.count({ where: { batchId: existing.batchId, status: 'READY', id: { not: id } } }) : 0;
      if (existing.accountId && !nextPending) await tx.account.update({ where: { id: existing.accountId }, data: { transferRefreshRequired: true, scriptNextAt: new Date() } });
      if (dto.status === 'FAILED' && dto.failureCode === 'QR_TIMEOUT') await this.afterQrTimeout(tx, existing);
      await this.appendProgress(tx, id, `【任务结束】采集端回报${STATUS_LABELS[dto.status] ?? dto.status}${dto.note?.trim() ? '：' + dto.note.trim() : ''}`);
      return { id, status: dto.status };
    });
  }

  /**
   * 扫码确认超时后的联动：同批次还没领取的分笔直接作废（A 超时则 B、C 跳过，B 超时则只跳过 C）；
   * 并向已经收到二维码的群补发“二维码已作废”，避免有人晚扫。其他原因的失败不会走到这里。
   */
  private async afterQrTimeout(tx: Tx, transfer: { id: string; batchId: string | null }) {
    if (transfer.batchId) {
      await tx.transferRequest.updateMany({ where: { batchId: transfer.batchId, status: 'READY', id: { not: transfer.id } },
        data: { status: 'CANCELLED', completedAt: new Date(), resultNote: '同批次前序分笔扫码超时，已跳过' } });
    }
    const sent = await tx.telegramDelivery.findMany({ where: { transferRequestId: transfer.id, kind: 'TRANSFER_QR', status: { in: ['SENT', 'SENDING'] } } });
    for (const row of sent) {
      const dedupeKey = hash('transfer-qr-void:' + transfer.id + ':' + row.targetId);
      await tx.telegramDelivery.upsert({ where: { dedupeKey }, update: {}, create: {
        id: ulid(), botId: row.botId, epoch: row.epoch, targetId: row.targetId, chatId: row.chatId, threadKey: row.threadKey,
        kind: 'TRANSFER_QR_VOID', transferRequestId: transfer.id, dedupeKey, messageId: row.messageId,
        text: formatQrVoid(row.text),
      } });
    }
  }

  private async transferTargets(tx: Tx, botId: string, kind: keyof typeof transferNoticePrefixes) {
    const ids = await noticeTargets(tx, transferNoticePrefixes[kind]);
    if (ids?.length === 0) return [];
    return tx.telegramTarget.findMany({ where: { botId, enabled: true, verified: true, archived: false, ...(ids !== null && { id: { in: ids } }) } });
  }

  private async notifyWithScreenshot(tx: Tx, id: string) {
    const transfer = await tx.transferRequest.findUniqueOrThrow({ where: { id }, include: { account: true, payee: true, screenshot: true } });
    const screenshot = transfer.screenshot;
    if (!screenshot?.image || screenshot.result !== transfer.status || !transfer.accountId || transfer.mode === 'TEST' || !transfer.payee) return;
    const bot = await tx.telegramBot.findUnique({ where: { id: 'default' } });
    if (!bot?.enabled || !bot.botId) return;
    const targets = await this.transferTargets(tx, bot.botId, 'TRANSFER');
    for (const target of targets) {
      if (!await tx.account.findFirst({ where: { id: transfer.accountId, ...accountWhere([readScope(target.scope)]) }, select: { id: true } })) continue;
      const dedupeKey = transferResultKey(id, transfer.status, target.id);
      const delivery = await tx.telegramDelivery.upsert({ where: { dedupeKey }, update: {}, create: {
        id: ulid(), botId: bot.botId, epoch: bot.dispatchEpoch, targetId: target.id, chatId: target.chatId, threadKey: target.threadKey,
        kind: 'TRANSFER_PHOTO', image: screenshot.image, transferRequestId: id, dedupeKey,
        text: formatTransferResult({ accountName: transfer.account?.name || transfer.accountId, amount: transfer.amount.toFixed(2),
          payeeName: transfer.payee.name, accountMasked: transfer.payee.accountMasked, outBizNo: transfer.outBizNo }, transfer.status),
      }, select: { kind: true } });
      // 升级前已排队的旧结果沿用原去重键，截图到达后转为图文消息。
      if (delivery.kind === 'TRANSFER') await tx.telegramDelivery.updateMany({
        where: { dedupeKey, botId: bot.botId, epoch: bot.dispatchEpoch, kind: 'TRANSFER', OR: [
          { status: { in: ['PENDING', 'RETRY'] } }, { status: 'CANCELLED', error: missingTransferScreenshot },
        ] },
        data: { kind: 'TRANSFER_PHOTO', image: screenshot.image, status: 'PENDING', nextAttemptAt: new Date(), error: null },
      });
    }
  }
}
