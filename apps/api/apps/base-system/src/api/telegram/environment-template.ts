import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { text } from './telegram-input';

const previousCard = '📋 环境巡检｜%CJD｜%SJ\n\n本条 %ZS 个环境 · %YC 个需关注\n\n%MX\n\n%ZC';
export const previousSummary = '环境巡检｜采集端 %CJD｜%SJ\n共 %ZS 个环境 · %YC 个需关注\n\n%MX\n\n%DQR\n%ZC';
const rowKeys = ['ZT','BH','HJ','DL','ZH','KY','BKY','DJS','CJSJ'];
const groupKeys = ['ZS','YC','MX','ZC','DQR'];
export function perEnvironment(template: string) {
  return !Array.from(template.matchAll(/%([A-Z0-9_]+)/g), match => match[1]).some(key => groupKeys.includes(key));
}
export const envPresets = {
  summary: [
    { name: '逐环境明细', template: '%ZT #%BH｜%HJ\n登录：%DL · 账号：%ZH\n可用 %KY · 不可用 %BKY · 待结算 %DJS' },
    { name: '简短概览', template: '%CJD｜环境 %ZS · 需关注 %YC\n%DQR\n%ZC' },
  ],
};
export type EnvKind = keyof typeof envPresets;
export function envKind(value: unknown): EnvKind {
  if (value !== 'summary') throw new BadRequestException('环境通知类型无效');
  return value;
}
export function envTemplate(kind: EnvKind, input: unknown) {
  const value = text(input, 191);
  const allowed = ['CJD','SJ', ...groupKeys, ...rowKeys];
  const used = new Set<string>();
  for (const [, key] of value.matchAll(/%([a-zA-Z0-9_]+)/g)) {
    if (!allowed.includes(key) || used.has(key)) throw new BadRequestException('未知或重复占位符：%' + key);
    used.add(key);
  }
  if (kind === 'summary' && !perEnvironment(value) && rowKeys.some(key => used.has(key))) throw new BadRequestException('单环境字段和整组汇总字段不能混用');
  return value;
}
export const templateKey = (kind: EnvKind) => 'telegram.environment.template.' + kind;
export const libraryPrefix = (kind: EnvKind) => 'telegram.environment.library.' + kind + '.';
export async function activeTemplate(db: Prisma.TransactionClient, kind: EnvKind) {
  const saved = (await db.systemSetting.findUnique({ where: { key: templateKey(kind) } }))?.value;
  if (kind === 'summary' && (saved === previousCard || saved === previousSummary)) return envPresets.summary[0].template;
  return saved ?? envPresets[kind][0].template;
}
export async function templateLibrary(db: Prisma.TransactionClient, kind: EnvKind) {
  const prefix = libraryPrefix(kind);
  const rows = await db.systemSetting.findMany({ where: { key: { startsWith: prefix } }, orderBy: { key: 'asc' } });
  return rows.map(row => ({ name: row.key.slice(prefix.length), template: row.value }));
}
export function fillEnvTemplate(template: string, values: Record<string, string>) {
  return template.replace(/%([A-Z0-9_]+)/g, (_, key: string) => values[key] ?? '').trim() || '暂无可展示的数据';
}
