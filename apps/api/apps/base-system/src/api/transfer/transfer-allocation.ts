import type { TransferAllocation } from '../../../../../../../contracts/transfer-strategy';
import { fromCents, toCents } from './transfer-calc';

export interface RecipientCapacity { id: string; poolId: string | null; poolEnabled?: boolean; remaining: number }

// 整数分配，尾差归最后一项；任一分配无法满足时整批不建单，不挪用其他分配的比例。
export function allocateTransfer(amount: string, allocations: TransferAllocation[], recipients: RecipientCapacity[], random = Math.random) {
  if (!allocations.length || allocations.reduce((sum, item) => sum + item.basisPoints, 0) !== 10000 ||
      allocations.some(item => !Number.isInteger(item.basisPoints) || item.basisPoints <= 0))
    throw new Error('分配比例合计必须为 100%');
  const fixed = allocations.filter(item => item.kind === 'PAYEE');
  const fixedIds = new Set(fixed.map(item => item.targetId));
  if (fixedIds.size !== fixed.length || allocations.some(item => !['PAYEE', 'POOL', 'AUTO'].includes(item.kind))) return null;
  const total = toCents(amount);
  let assigned = 0;
  const shares = allocations.map((item, index) => {
    const cents = index === allocations.length - 1 ? total - assigned : Number(BigInt(total) * BigInt(item.basisPoints) / 10000n);
    assigned += cents;
    return { item, index, cents };
  });
  // 先保留固定账号，再处理历史池和自动抽取；较大分笔先选，避免小分笔占用唯一能承接大额的账号。
  const priority = { PAYEE: 0, POOL: 1, AUTO: 2 };
  const ordered = [...shares].sort((a, b) => priority[a.item.kind] - priority[b.item.kind] || b.cents - a.cents);
  const used = new Set<string>();
  const selected = new Map<number, string>();
  for (const { item, index, cents } of ordered) {
    const candidates = recipients.filter(row => {
      if (used.has(row.id) || row.remaining < cents) return false;
      if (item.kind === 'PAYEE') return row.id === item.targetId;
      if (fixedIds.has(row.id)) return false;
      return item.kind === 'AUTO' || (row.poolId === item.targetId && row.poolEnabled !== false);
    });
    if (!candidates.length) return null;
    const recipient = candidates[item.kind === 'PAYEE' ? 0 : Math.floor(random() * candidates.length)];
    used.add(recipient.id);
    selected.set(index, recipient.id);
  }
  return shares.filter(row => row.cents > 0).map(row => ({
    payeeId: selected.get(row.index)!,
    amount: fromCents(row.cents),
  }));
}
