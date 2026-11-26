import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { readIds } from './telegram-policy';

const channelPrefix = 'telegram.channel-notice.targets.';

// null 沿用所有符合站点范围的群；空数组表示显式不发。分行存储，避免设置值长度限制。
export function parseNoticeTargets(value: unknown) { return value === null ? null : readIds(value); }

export async function noticeTargets(db: Pick<Prisma.TransactionClient, 'systemSetting'>, prefix = channelPrefix) {
  const selected = `${prefix}selected`;
  const rows = await db.systemSetting.findMany({ where: { key: { startsWith: prefix } }, select: { key: true, value: true } });
  return rows.length ? rows.filter(row => row.key !== selected).map(row => row.value) : null;
}

export async function saveNoticeTargets(tx: Prisma.TransactionClient, botId: string | null, ids: string[] | null, prefix = channelPrefix) {
  const selected = `${prefix}selected`;
  if (ids?.length && (!botId || await tx.telegramTarget.count({ where: { id: { in: ids }, botId, enabled: true, verified: true, archived: false } }) !== ids.length)) {
    throw new BadRequestException('所选群已停用或失效，请重新选择接收群');
  }
  await tx.systemSetting.deleteMany({ where: { key: { startsWith: prefix } } });
  if (ids !== null) await tx.systemSetting.createMany({ data: [{ key: selected, value: 'true' }, ...ids.map((value, i) => ({ key: `${prefix}${i}`, value }))] });
}
