import { isDeepStrictEqual } from 'node:util';
import { Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient;
type Client = Tx | PrismaClient;

function transaction<T>(client: Client, write: (tx: Tx) => Promise<T>): Promise<T> {
  return '$transaction' in client ? client.$transaction(write, { isolationLevel: 'ReadCommitted' }) : write(client);
}

export async function auditAdjustment(tx: Tx, records: string | string[], created = false) {
  const ids = Array.isArray(records) ? records : [records];
  const inserted = await tx.$executeRaw`
    INSERT INTO sys_operation_log
      (id,user_id,username,domain,module_name,description,request_id,method,url,ip,params,body,response,
       start_time,end_time,duration,source,level,status,object_id,object_name,related_id)
    SELECT UUID(),'system:strategy','策略引擎','built-in','策略执行',
      CASE a.action WHEN 'SET_POLLING_MEMBER_WEIGHTS' THEN '自动调整成员权重' WHEN 'SET_CHANNEL_STATUS' THEN '自动调整通道状态'
        WHEN 'ADD_POLLING_MEMBER' THEN '自动添加备用通道' WHEN 'REMOVE_POLLING_MEMBER' THEN '自动移除轮询成员' ELSE a.action END,
      a.idempotency_key,'SYSTEM',CONCAT('/adjustments/',a.id),'',
      JSON_OBJECT('siteId',a.site_id,'strategyGroupId',a.strategy_group_id,'ruleName',a.rule_name,'target',a.target),
      JSON_OBJECT('beforeState',a.before_state,'desiredState',JSON_EXTRACT(a.desired_state,'$.command.desiredState')),
      JSON_OBJECT('actualState',a.actual_state,'reason',a.failure_reason),
      a.created_at,COALESCE(a.completed_at,IF(${created},a.created_at,CURRENT_TIMESTAMP(3))),0,'SYSTEM',
      CASE WHEN a.status='FAILED' THEN 'ERROR' WHEN a.status IN ('SKIPPED','EXPIRED') THEN 'WARN' ELSE 'INFO' END,
      a.status,a.site_id,CONCAT(COALESCE(s.name,a.site_id),' / ',
        COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(a.desired_state,'$.groupName')),'null'),a.strategy_group_id,'旧策略')),a.id
    FROM adjustment_record a LEFT JOIN epay_site s ON s.id=a.site_id WHERE a.id IN (${Prisma.join(ids)})`;
  if (inserted !== ids.length) throw new Error('写入策略调整审计失败');
}

export function updateAdjustment(client: Client, enabled: boolean, id: string, data: Prisma.AdjustmentRecordUpdateInput) {
  if (!enabled) return client.adjustmentRecord.update({ where: { id }, data });
  return transaction(client, async tx => {
    // 锁定后读取旧值，重复回执不产生相同的审计记录。
    const [before] = await tx.$queryRaw<{ status: string; actual: string | null }[]>`
      SELECT status, CAST(actual_state AS CHAR CHARACTER SET utf8mb4) AS actual FROM adjustment_record WHERE id=${id} FOR UPDATE`;
    const row = await tx.adjustmentRecord.update({ where: { id }, data });
    if (before.status !== row.status || !isDeepStrictEqual(before.actual === null ? null : JSON.parse(before.actual), row.actualState)) {
      await auditAdjustment(tx, id);
    }
    return row;
  });
}

type Cancellation = {
  where: { status: 'PENDING'; id?: string; siteId?: string; strategyGroupId?: { in: string[] }; expiresAt?: { lt: Date } };
  data: { status: 'SKIPPED' | 'EXPIRED'; failureReason: string; completedAt: Date };
};

export function finishPendingAdjustments(client: Client, enabled: boolean, args: Cancellation) {
  if (!enabled) return client.adjustmentRecord.updateMany(args);
  return transaction(client, async tx => {
    const { where } = args;
    const filters = [Prisma.sql`status=${where.status}`];
    if (where.id !== undefined) filters.push(Prisma.sql`id=${where.id}`);
    if (where.siteId !== undefined) filters.push(Prisma.sql`site_id=${where.siteId}`);
    if (where.expiresAt) filters.push(Prisma.sql`expires_at<${where.expiresAt.lt}`);
    if (where.strategyGroupId) {
      if (!where.strategyGroupId.in.length) return { count: 0 };
      filters.push(Prisma.sql`strategy_group_id IN (${Prisma.join(where.strategyGroupId.in)})`);
    }
    const pending = await tx.adjustmentRecord.findMany({ where, select: { id: true }, orderBy: { id: 'asc' } });
    let count = 0;
    for (let i = 0; i < pending.length; i += 500) {
      const candidates = pending.slice(i, i + 500).map(row => row.id);
      // 按主键顺序锁行后复核，避免通过即将被修改的状态索引争抢间隙锁。
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM adjustment_record FORCE INDEX (PRIMARY)
        WHERE id IN (${Prisma.join(candidates)}) AND ${Prisma.join(filters, ' AND ')} ORDER BY id FOR UPDATE`;
      const ids = locked.map(row => row.id);
      if (!ids.length) continue;
      await tx.adjustmentRecord.updateMany({ where: { id: { in: ids } }, data: args.data });
      await auditAdjustment(tx, ids);
      count += ids.length;
    }
    return { count };
  });
}
