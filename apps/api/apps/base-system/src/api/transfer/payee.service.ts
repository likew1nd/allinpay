import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ulid } from 'ulid';

import { PrismaService } from '@lib/shared/prisma/prisma.service';

import { decryptSiteSecret, encryptSiteSecret } from '../site/site-credentials';
import { blockedMessage, deleteCheckOf } from '../delete-check';
import { startOfShanghaiDay } from './transfer.service';
import { EXECUTING_TRANSFER_STATUSES } from './transfer-calc';
import { CreatePayeeDto, PageTransferDto, PayeeLimitsDto } from './dto/transfer.dto';

// 删除前检查只读这几张表，事务内外都能用
type PayeeDb = Pick<Prisma.TransactionClient, 'payee' | 'transferRule' | 'transferRequest'>;

// 脱敏：列表和日志只显示头尾，不泄露完整收款账号，也不暴露账号长度
export const DELETED_STATUS = 'DELETED';
export function maskAccount(account: string) {
  const text = account.trim();
  if (text.length <= 2) return '****';
  const keep = text.length >= 10 ? 3 : 1;
  return `${text.slice(0, keep)}****${text.slice(-keep)}`;
}

function referencesPayee(value: unknown, payeeId: string): boolean {
  if (Array.isArray(value)) return value.some(item => referencesPayee(item, payeeId));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.kind === 'PAYEE' && record.targetId === payeeId) return true;
  return Object.values(record).some(item => referencesPayee(item, payeeId));
}

// 收款人白名单：转账只能转给这里登记的收款人，收款账号加密存放，接口只返回脱敏结果
@Injectable()
export class PayeeService {
  constructor(private readonly prisma: PrismaService) {}

  private publicPayee<T extends { accountEncrypted?: string }>(payee: T) {
    const { accountEncrypted, ...rest } = payee;
    return rest;
  }

  // 收款列表直接显示完整账号：在后端解密，解密失败时退回脱敏值，不影响列表加载
  private revealAccount(row: { id: string; accountEncrypted: string; accountMasked: string }) {
    try { return decryptSiteSecret(row.id, 'payee-account', row.accountEncrypted); }
    catch { return row.accountMasked; }
  }

  async page(query: PageTransferDto) {
    // 已删除的账号只做软删除（保留转账记录里的收款人信息），默认不出现在收款列表和各处选择器里
    const where: Prisma.PayeeWhereInput = query.status
      ? { status: query.status }
      : { status: { not: DELETED_STATUS } };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.payee.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.current - 1) * query.size,
        take: query.size,
      }),
      this.prisma.payee.count({ where }),
    ]);
    const ids = records.map((row) => row.id);
    const todayStart = startOfShanghaiDay(new Date());
    const tomorrowStart = new Date(todayStart.getTime() + 86400000);
    const [todayTotals, allTotals] = ids.length
      ? await Promise.all([
          this.prisma.transferRequest.groupBy({
            by: ['payeeId'],
            where: {
              payeeId: { in: ids },
              status: 'SUCCEEDED',
              completedAt: { gte: todayStart, lt: tomorrowStart },
            },
            _sum: { amount: true },
          }),
          this.prisma.transferRequest.groupBy({
            by: ['payeeId'],
            where: { payeeId: { in: ids }, status: 'SUCCEEDED' },
            _sum: { amount: true },
          }),
        ])
      : [[], []];
    const todayByPayee = new Map(
      todayTotals.map((row) => [row.payeeId, row._sum.amount?.toFixed(2) ?? '0.00']),
    );
    const allByPayee = new Map(
      allTotals.map((row) => [row.payeeId, row._sum.amount?.toFixed(2) ?? '0.00']),
    );

    return {
      current: query.current,
      size: query.size,
      total,
      records: records.map((row) => this.publicPayee({
        ...row,
        account: this.revealAccount(row),
        receivedToday: todayByPayee.get(row.id) ?? '0.00',
        receivedTotal: allByPayee.get(row.id) ?? '0.00',
      })),
    };
  }

  /**
   * 删除前检查：只读，列出占用该收款账号的转账策略和正在执行的转账。
   * 弹窗和真正的删除共用这一份判断，保证“弹窗说能删”和“服务端让删”不会不一致。
   */
  private async inspect(db: PayeeDb, id: string) {
    const payee = await db.payee.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
    if (!payee || payee.status === DELETED_STATUS) throw new NotFoundException('收款账号不存在');
    const [rules, running] = await Promise.all([
      // 已删除的策略不再占用收款账号
      db.transferRule.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, isTemplate: true, payeeId: true, allocations: true, rules: true },
      }),
      db.transferRequest.findMany({
        where: { payeeId: id, status: { in: EXECUTING_TRANSFER_STATUSES } },
        select: { id: true, outBizNo: true, account: { select: { name: true, externalId: true } } },
      }),
    ]);
    const used = rules.filter(rule =>
      rule.payeeId === id || referencesPayee(rule.allocations, id) || referencesPayee(rule.rules, id)
    );
    return deleteCheckOf(payee.name, [
      {
        kind: 'TRANSFER_RULE',
        title: `被 ${used.length} 个转账策略使用，请先在这些策略里移除或更换该收款账号`,
        items: used.map(rule => ({ id: rule.id, label: rule.name, hint: rule.isTemplate ? '转账模板' : undefined })),
      },
      {
        kind: 'TRANSFER_RUNNING',
        title: `有 ${running.length} 笔使用该账号的转账正在执行，请等待完成后再删除`,
        items: running.map(row => ({ id: row.id, label: row.outBizNo, hint: `付款环境：${row.account?.name || row.account?.externalId || '—'}` })),
      },
    ], ['待领取的转账单会作废', '历史转账记录会保留，仍显示该收款人的名称和脱敏账号']);
  }

  async deleteCheck(id: string) {
    return this.inspect(this.prisma, id);
  }

  /**
   * 删除收款账号：软删除，状态置为 DELETED，账号行保留。
   * - 历史转账单、转账记录里的收款人名称和脱敏账号都还在（转账单对收款账号有外键保护，也不能真删）。
   * - 已删除账号不再出现在收款列表，也不会被转账测试、策略校验、自动转账分配选中（这些地方都只认 ACTIVE）。
   * - 被转账策略使用、有正在执行的转账时不让删；还没发给采集端的转账单立即作废。
   */
  async delete(id: string) {
    return this.prisma.$transaction(async (tx) => {
      // 与转账评估共用收款账号行锁，在锁内核对占用。
      await tx.$queryRaw(Prisma.sql`SELECT id FROM payee WHERE id = ${id} FOR UPDATE`);
      const check = await this.inspect(tx, id);
      if (!check.canDelete) throw new ConflictException(blockedMessage(check));
      await tx.transferRequest.updateMany({
        where: { payeeId: id, status: 'READY' },
        data: { status: 'CANCELLED', completedAt: new Date(), resultNote: '收款账号已删除，转账单作废' },
      });
      await tx.payee.update({ where: { id }, data: { status: DELETED_STATUS } });
      return { id };
    });
  }

  async updateLimits(id: string, dto: PayeeLimitsDto) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT id FROM payee WHERE id = ? FOR UPDATE', id);
      const current = await tx.payee.findUnique({ where: { id }, select: { status: true } });
      if (!current || current.status === DELETED_STATUS) throw new NotFoundException('收款账号不存在');
      const row = await tx.payee.update({ where: { id }, data: dto });
      await tx.transferRequest.updateMany({ where: { payeeId: id, status: 'READY' },
        data: { status: 'CANCELLED', completedAt: new Date(), resultNote: '收款配置已变更' } });
      return this.publicPayee(row);
    });
  }
  async create(dto: CreatePayeeDto, actor: string) {
    const name = dto.name.trim();
    const account = dto.account.trim();
    if (!name || !account)
      throw new BadRequestException('收款人名称和收款账号不能为空');
    const id = `payee-${ulid().toLowerCase()}`;
    const created = await this.prisma.payee.create({
      data: {
        id,
        name,
        accountEncrypted: encryptSiteSecret(id, 'payee-account', account),
        accountMasked: maskAccount(account),
        createdBy: actor, dailyLimit: dto.dailyLimit ?? null, totalLimit: dto.totalLimit ?? null,
      },
    });
    return this.publicPayee(created);
  }

  // 停用后，使用这个收款人且还没发给采集端的转账单立即作废；已经领取的不能本地撤回
  async setStatus(id: string, status: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.payee.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      // 已删除的账号不能再被启用或停用，否则会绕过删除重新出现
      if (!existing || existing.status === DELETED_STATUS) throw new NotFoundException('收款人不存在');
      const updated = await tx.payee.update({ where: { id }, data: { status } });
      if (status !== 'ACTIVE')
        await tx.transferRequest.updateMany({
          where: { payeeId: id, status: { in: ['READY'] } },
          data: {
            status: 'CANCELLED',
            completedAt: new Date(),
            resultNote: '收款人已停用，转账单作废',
          },
        });
      return this.publicPayee(updated);
    });
  }
}
