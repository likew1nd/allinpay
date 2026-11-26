import { createHmac } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import mysql from 'mysql2/promise';

// A narrow source projection: configuration is read only for explicit configuration/deletion requests.
export const channelColumns = [
  'id',
  'name',
  'type',
  'plugin',
  'mode',
  'rate',
  'costrate',
  'daytop',
  'daymaxorder',
  'paymin',
  'paymax',
  'status',
  'daystatus',
  'apptype',
  'rate_limit_seconds',
  'rate_limit_count',
  'timestart',
  'timestop',
  'payfee_lessthan',
  'payfee_mincost',
  'ordername',
  'ordername_rules',
];
export function channelRevision(row: Record<string, unknown>, secret: string) {
  return createHmac('sha256', secret).update(JSON.stringify(row)).digest('hex');
}
export function parseChannelConfig(raw: unknown): Record<string, unknown> {
  if (raw == null || raw === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    throw new ConflictException('原站点配置格式无法识别，请先在原站点检查配置');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new ConflictException('原站点配置格式无法识别');
  return parsed as Record<string, unknown>;
}
export function mergeChannelConfig(
  raw: unknown,
  changes: Record<string, unknown>,
) {
  const config = parseChannelConfig(raw);
  const entries = Object.entries(changes);
  if (!entries.length || entries.length > 100)
    throw new BadRequestException('请填写需要修改的配置项');
  for (const [key, value] of entries) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) ||
      ['__proto__', 'constructor', 'prototype'].includes(key)
    )
      throw new BadRequestException('配置字段名无效');
    if (
      value === undefined ||
      value === null ||
      !['string', 'number', 'boolean', 'object'].includes(typeof value)
    )
      throw new BadRequestException('配置值无效');
    if (typeof value === 'object' && !Array.isArray(value))
      throw new BadRequestException('配置值只支持文本、数字、布尔值或数组');
    if (
      Array.isArray(value) &&
      (value.length > 100 ||
        value.some((item) => typeof item !== 'string' || item.length > 16000))
    )
      throw new BadRequestException('数组配置值无效');
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new BadRequestException('配置值无效');
    Object.defineProperty(config, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  const serialized = JSON.stringify(config);
  if (Buffer.byteLength(serialized) > 60000)
    throw new BadRequestException('配置内容过长');
  return serialized;
}

export async function readSourceChannel(
  connection: mysql.Connection,
  prefix: string,
  code: string,
  config = false,
  lock = false,
) {
  if (!/^[a-zA-Z0-9_]{0,64}$/.test(prefix) || !/^[1-9]\d{0,19}$/.test(code))
    throw new BadRequestException('通道编号或表前缀无效');
  const columns = [...channelColumns, ...(config ? ['config'] : [])];
  const [rows] = await connection.query<mysql.RowDataPacket[]>({
    sql: `SELECT ${columns.map((name) => mysql.escapeId(name)).join(',')}, (SELECT ENGINE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?) AS __engine FROM ${mysql.escapeId(prefix + 'channel')} WHERE id=?${lock ? ' FOR UPDATE' : ''}`,
    values: [prefix + 'channel', code],
    timeout: 10000,
  });
  if (!rows[0]) throw new NotFoundException('原站点通道不存在，请刷新列表');
  const { __engine, ...row } = rows[0];
  if (String(__engine).toLowerCase() !== 'innodb')
    throw new ConflictException('通道表不支持事务，无法安全修改');
  // 引擎校验与通道读取共用一次往返，校验字段不进入配置版本和响应。
  return row;
}

export function channelFields(row: Record<string, unknown>) {
  return {
    name: String(row.name),
    paymentTypeId: Number(row.type),
    plugin: String(row.plugin),
    mode: Number(row.mode),
    rate: String(row.rate),
    costRate: row.costrate == null ? '' : String(row.costrate),
    dailyLimit: Number(row.daytop),
    dailyOrderLimit: Number(row.daymaxorder),
    minAmount: String(row.paymin ?? ''),
    maxAmount: String(row.paymax ?? ''),
  };
}

export function directChannelReference(info: unknown, code: string) {
  if (info == null || info === '' || info === '0') return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(info));
  } catch {
    throw new ConflictException(
      '原站点路由格式无法识别，无法确认删除影响，请先在原站点检查',
    );
  }
  if (!parsed || typeof parsed !== 'object')
    throw new ConflictException('原站点路由格式无法识别');
  return Object.values(parsed).some(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      String(entry.channel) === code &&
      entry.type !== 'roll',
  );
}
