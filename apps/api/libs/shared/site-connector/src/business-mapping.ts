/** MySQL DATETIME 按站点时区解析。 */
export function wallTime(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
}

export function instant(value: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) throw new Error('Invalid source date');
  const estimate = Date.parse(value.replace(' ', 'T') + 'Z');
  const offsets = new Set([-86400_000, 0, 86400_000].map(delta => {
    const date = new Date(estimate + delta);
    return Date.parse(wallTime(date, timezone).replace(' ', 'T') + 'Z') - date.getTime();
  }));
  const candidates = [...offsets].map(offset => new Date(estimate - offset))
    .filter(date => wallTime(date, timezone) === value);
  if (candidates.length !== 1) throw new Error('Ambiguous or invalid source date');
  return candidates[0].toISOString();
}

export class PollingMemberError extends Error {
  constructor(groupCode: string | undefined, position: number, reason: string) {
    const group = groupCode && /^\d{1,20}$/.test(groupCode) ? `轮询组 ${groupCode}` : '轮询组';
    super(`${group}的第 ${position + 1} 个成员${reason}`);
  }
}

export function parseMembers(info: string, groupCode?: string) {
  const seen = new Set<string>();
  return info.split(',').filter(Boolean).map((value, position) => {
    // 易支付允许成员只填通道编号，省略的权重按 0 处理。
    const match = /^(\d{1,20})(?::(\d{1,10}))?$/.exec(value.trim());
    if (!match || Number(match[2] ?? 0) > 2147483647)
      throw new PollingMemberError(groupCode, position, '格式无效，请检查通道编号和权重');
    if (seen.has(match[1]))
      throw new PollingMemberError(groupCode, position, '通道编号重复');
    seen.add(match[1]);
    return { channelCode: match[1], weight: Number(match[2] ?? 0), position };
  });
}

export function money(value: unknown): string {
  const result = String(value);
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(result)) throw new Error('Invalid source amount');
  const [whole, fraction = ''] = result.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}
