import type { StructureReport, StructureValidation } from './contracts';

export const mappingVersion = 'epay-pro-2070-v1';

// 来自随项目提供的 install.sql，覆盖首版通道、轮询组、订单和商户路由读取需要的字段。
export const requiredTables: Record<string, string[]> = {
  config: ['k', 'v'],
  type: ['id', 'name', 'showname', 'status'],
  channel: ['id', 'type', 'plugin', 'name', 'status', 'daystatus'],
  roll: ['id', 'type', 'name', 'kind', 'info', 'status', 'index'],
  order: ['trade_no', 'uid', 'type', 'channel', 'subchannel', 'money', 'realmoney', 'status', 'addtime', 'endtime'],
  group: ['gid', 'name', 'info'],
  user: ['uid', 'gid', 'channelinfo', 'status', 'roll_type'],
};

export function validateStructure(tables: StructureReport['tables'], configuredPrefix = ''): StructureValidation {
  if (!/^[a-zA-Z0-9_]{0,64}$/.test(configuredPrefix)) throw new Error('Invalid table prefix');
  const byName = new Map(tables.map(table => [table.name, new Set(table.columns?.map(column => column.toLowerCase()))]));
  const candidatePrefixes = [...new Set(tables.flatMap(table => Object.keys(requiredTables).flatMap(suffix => {
    if (!table.name.endsWith(suffix)) return [];
    const prefix = table.name.slice(0, -suffix.length);
    return /^[a-zA-Z0-9_]{0,64}$/.test(prefix) ? [prefix] : [];
  })))].sort();
  const check = (prefix: string) => Object.entries(requiredTables).map(([suffix, requiredColumns]) => {
    const table = `${prefix}${suffix}`;
    const columns = byName.get(table);
    return { table, exists: byName.has(table), requiredColumns, missingColumns: requiredColumns.filter(column => !columns?.has(column)) };
  });
  const inspected = (configuredPrefix ? [configuredPrefix] : candidatePrefixes).map(prefix => ({ prefix, checks: check(prefix) }));
  const matches = inspected.filter(result => result.checks.every(row => row.exists && !row.missingColumns.length));
  const base = { mappingVersion, candidatePrefixes };
  if (matches.length === 1) return { ...base, reason: 'MATCHED', tablePrefix: matches[0].prefix, checks: matches[0].checks };
  if (matches.length > 1) return { ...base, reason: 'AMBIGUOUS_PREFIX', checks: [] };
  if (!inspected.length) return { ...base, reason: 'NO_MATCH', checks: [] };
  // 没有完整结构时仅展示最接近的一组缺失项，绝不将它判为兼容。
  const score = (item: typeof inspected[number]) => item.checks.reduce((sum, row) => sum + Number(row.exists) + row.requiredColumns.length - row.missingColumns.length, 0);
  inspected.sort((a, b) => score(b) - score(a));
  if (inspected.length > 1 && score(inspected[0]) === score(inspected[1])) return { ...base, reason: 'AMBIGUOUS_PREFIX', checks: [] };
  return { ...base, reason: 'MISSING_TABLES_OR_COLUMNS', tablePrefix: inspected[0].prefix, checks: inspected[0].checks };
}
