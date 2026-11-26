import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ulid } from 'ulid';
import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { CreateTransferDraftDto, CreateTransferRuleDto, PageTransferDto, UpdateTransferRuleDto, UpdateTransferRuleFlagsDto } from './dto/transfer.dto';
import { blockedMessage, deleteCheckOf } from '../delete-check';
import { EXECUTING_TRANSFER_STATUSES, toCents } from './transfer-calc';
import { validateTransferConditions } from './transfer-conditions';

type RuleDb = Pick<Prisma.TransactionClient, 'transferRule' | 'account' | 'transferRequest'>;

@Injectable()
export class TransferRuleService {
  constructor(private readonly prisma: PrismaService) {}

  async page(query: PageTransferDto) {
    // 已删除的策略（软删除）不再出现在列表和各处选择器里
    const where = { deletedAt: null };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.transferRule.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.current - 1) * query.size, take: query.size }),
      this.prisma.transferRule.count({ where }),
    ]);
    return { current: query.current, size: query.size, records, total };
  }

  /**
   * 删除前检查：只读，列出绑定了该策略的环境和正在执行的转账。
   * 弹窗和真正的删除共用这一份判断。
   */
  private async inspect(db: RuleDb, id: string) {
    const rule = await db.transferRule.findUnique({ where: { id }, select: { id: true, name: true, deletedAt: true } });
    if (!rule || rule.deletedAt) throw new NotFoundException('转账策略不存在');
    const [accounts, running] = await Promise.all([
      db.account.findMany({ where: { transferRuleId: id }, select: { id: true, name: true, externalId: true, transferEnabled: true }, orderBy: { id: 'asc' } }),
      db.transferRequest.findMany({
        where: { ruleId: id, status: { in: EXECUTING_TRANSFER_STATUSES } },
        select: { id: true, outBizNo: true, account: { select: { name: true, externalId: true } } },
      }),
    ]);
    return deleteCheckOf(rule.name, [
      {
        kind: 'ACCOUNT',
        title: `被 ${accounts.length} 个环境使用，请先到「转账管理」把这些环境的转账策略换掉或清空`,
        items: accounts.map(row => ({ id: row.id, label: row.name || row.externalId, hint: row.transferEnabled ? '自动转账开启中' : '已选择该策略' })),
      },
      {
        kind: 'TRANSFER_RUNNING',
        title: `有 ${running.length} 笔该策略的转账正在执行，请等待完成后再删除`,
        items: running.map(row => ({ id: row.id, label: row.outBizNo, hint: `付款环境：${row.account?.name || row.account?.externalId || '—'}` })),
      },
    ], ['该策略待领取的转账单会作废', '历史转账记录会保留，仍显示该策略的名称']);
  }

  async deleteCheck(id: string) {
    return this.inspect(this.prisma, id);
  }

  /**
   * 删除转账策略：软删除（写入删除时间并停用），转账单对策略有外键保护，历史转账记录继续显示策略名。
   * 仍被环境绑定、有正在执行的转账时不让删；待领取的转账单作废。
   */
  async delete(id: string, actor: string) {
    return this.prisma.$transaction(async tx => {
      // 先加锁再检查：环境绑定策略（setEnvironment）也会锁同一行，两边不会同时通过检查
      await tx.$queryRaw(Prisma.sql`SELECT id FROM transfer_rule WHERE id = ${id} FOR UPDATE`);
      const check = await this.inspect(tx, id);
      if (!check.canDelete) throw new ConflictException(blockedMessage(check));
      const now = new Date();
      await tx.transferRequest.updateMany({ where: { ruleId: id, status: 'READY' },
        data: { status: 'CANCELLED', completedAt: now, resultNote: '策略已删除，转账单作废' } });
      await tx.transferRule.update({ where: { id }, data: { deletedAt: now, enabled: false, updatedBy: actor } });
      return { id };
    });
  }

  private async validate(dto: CreateTransferRuleDto) {
    if (!dto.name.trim()) throw new BadRequestException('策略名称不能为空');
    if (dto.rules?.length === 0 && dto.enabled !== false) throw new BadRequestException('请先配置转账规则和收款目标，再启用策略');
    try {
      for (const amount of [dto.triggerBalance, dto.maxAmount, dto.minAmount, dto.reserveAmount, dto.feeBuffer, dto.dailyLimit ?? '0', ...(dto.rules ?? []).map(rule => rule.maxAmount)]) toCents(amount);
      if (dto.rules) validateTransferConditions(dto.rules);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('金额格式无效或超出安全计算范围');
    }
    if (toCents(dto.triggerBalance) <= 0 || toCents(dto.maxAmount) <= 0 || toCents(dto.minAmount) > toCents(dto.maxAmount))
      throw new BadRequestException('触发金额、单次上限必须大于零，最小金额不能超过上限');
    if (dto.dailyLimit != null && toCents(dto.dailyLimit) < Math.max(1, toCents(dto.minAmount))) throw new BadRequestException('每日限额过小');
    if (dto.rules?.some(rule => !rule.name.trim())) throw new BadRequestException('规则名称不能为空');
    const actions = dto.rules ?? [{ maxAmount: dto.maxAmount, allocations: dto.allocations }];
    for (const action of actions) {
      if (toCents(action.maxAmount) <= 0 || toCents(dto.minAmount) > toCents(action.maxAmount))
        throw new BadRequestException('每条规则的转账上限必须大于零且不小于最小转账金额');
      if (!action.allocations.length || action.allocations.length > 20 ||
          action.allocations.some(item => !Number.isInteger(item.basisPoints) || item.basisPoints <= 0 || item.basisPoints > 10000) ||
          action.allocations.reduce((sum, item) => sum + item.basisPoints, 0) !== 10000)
        throw new BadRequestException('每条规则的分配比例必须大于零，且合计为 100%');
      const fixedIds = new Set<string>();
      let autoCount = 0;
      for (const item of action.allocations) {
        if (item.kind === 'AUTO') {
          autoCount++;
          continue;
        }
        if (item.kind !== 'PAYEE') throw new BadRequestException('请选择固定账号或自动抽取');
        if (!item.targetId) throw new BadRequestException('请选择固定收款账号');
        if (fixedIds.has(item.targetId)) throw new BadRequestException('同一规则内不能重复选择收款账号');
        fixedIds.add(item.targetId);
        const exists = await this.prisma.payee.findUnique({ where: { id: item.targetId } });
        if (!exists || exists.status !== 'ACTIVE') throw new BadRequestException('固定收款账号已停用或不存在');
      }
      if (autoCount) {
        const available = await this.prisma.payee.count({
          where: { status: 'ACTIVE', id: { notIn: [...fixedIds] } },
        });
        if (autoCount > available)
          throw new BadRequestException(`自动抽取需要 ${autoCount} 个不重复账号，排除固定账号后仅有 ${available} 个可用账号`);
      }
    }
  }

  private data(dto: CreateTransferRuleDto) {
    return { rules: dto.rules ? dto.rules as unknown as Prisma.InputJsonValue : Prisma.JsonNull, name: dto.name.trim(), description: dto.description?.trim() ?? '', triggerBalance: dto.triggerBalance, reserveAmount: dto.reserveAmount,
      feeBuffer: dto.feeBuffer, minAmount: dto.minAmount, maxAmount: dto.maxAmount, dailyLimit: dto.dailyLimit ?? null,
      allocations: dto.allocations as unknown as Prisma.InputJsonValue, enabled: dto.enabled ?? true,
      isTemplate: dto.isTemplate ?? false, mode: 'AUTO' };
  }

  async createDraft(dto: CreateTransferDraftDto, actor: string) {
    if (!dto.name.trim()) throw new BadRequestException('策略名称不能为空');
    // 尚未配置收款目标，草稿必须保持停用，不参与自动执行。
    return this.prisma.transferRule.create({ data: {
      id: 'transfer-rule-' + ulid().toLowerCase(), name: dto.name.trim(), description: dto.description?.trim() ?? '',
      rules: [], allocations: [], enabled: false, isTemplate: dto.isTemplate ?? false,
      triggerBalance: '1000.00', maxAmount: '1000.00', minAmount: '1.00', mode: 'AUTO', createdBy: actor,
    } });
  }

  async create(dto: CreateTransferRuleDto, actor: string) {
    await this.validate(dto);
    return this.prisma.transferRule.create({ data: { id: 'transfer-rule-' + ulid().toLowerCase(), ...this.data(dto), createdBy: actor } });
  }

  /**
   * 只切换启用状态（列表页开关）：不改动策略内容，也不重新校验收款账号，
   * 这样引用了已停用账号的策略依然可以停用。启用前仍要求已配置规则；模板不参与自动转账，不能启用。
   * 停用会撤销还没领取的分笔转账单。
   */
  async setFlags(id: string, dto: UpdateTransferRuleFlagsDto, actor: string) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM transfer_rule WHERE id = ${id} FOR UPDATE`);
      const rule = await tx.transferRule.findUnique({ where: { id } });
      if (!rule || rule.deletedAt) throw new NotFoundException('转账策略不存在');
      if (dto.enabled === true) {
        if (rule.isTemplate) throw new ConflictException('模板不能启用，请先用模板创建转账策略');
        const configured = Array.isArray(rule.rules) ? rule.rules.length > 0 : Array.isArray(rule.allocations) && rule.allocations.length > 0;
        if (!configured) throw new BadRequestException('请先配置转账规则和收款目标，再启用策略');
      }
      const result = await tx.transferRule.update({ where: { id }, data: { enabled: dto.enabled, updatedBy: actor } });
      if (dto.enabled === false) await tx.transferRequest.updateMany({ where: { ruleId: id, status: 'READY' },
        data: { status: 'CANCELLED', completedAt: new Date(), resultNote: '策略已停用' } });
      return result;
    });
  }

  async update(id: string, dto: UpdateTransferRuleDto, actor: string) {
    await this.validate(dto);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM transfer_rule WHERE id = ${id} FOR UPDATE`);
      const rule = await tx.transferRule.findUnique({ where: { id } });
      if (!rule || rule.deletedAt) throw new NotFoundException('转账策略不存在');
      if (rule.rules != null && !dto.rules) throw new ConflictException('请刷新页面后使用多规则编辑器保存');
      if (dto.isTemplate && await tx.account.count({ where: { transferRuleId: id } })) throw new ConflictException('使用中的策略不能改为模板');
      // 修改策略仅影响下一次触发；停用则撤销还未领取的分笔。
      const result = await tx.transferRule.update({ where: { id }, data: { ...this.data(dto), updatedBy: actor, version: { increment: 1 } } });
      if (!result.enabled) await tx.transferRequest.updateMany({ where: { ruleId: id, status: 'READY' },
        data: { status: 'CANCELLED', completedAt: new Date(), resultNote: '策略已停用' } });
      return result;
    });
  }
}
