import { BadRequestException } from '@nestjs/common';
import type { ChannelOrderMetrics } from '../site/channel-order-metrics';
import { text } from './telegram-input';

const CHANNEL_NOTICE_TOKENS = /%(?!SDMX\b|ZTMC\b|ZD\b|BH\b|MC\b|ZT\b|SKXE\b|SK\b|BSXE\b|BS\b|ZSK\b|ZBS\b|(?:5|15|30|60)F(?:CGL|BS|SK)\b|QT(?:CGL|BS|SK)\b)/;
export function noticeTemplate(value: unknown) {
  const template = text(value, 4000);
  if (CHANNEL_NOTICE_TOKENS.test(template)) throw new BadRequestException('模板含有未知占位符');
  return template;
}

export const channelCardTemplate = `%ZT %ZTMC · 通道 #%BH｜%MC
站点：%ZD
今日收款：%SK　限额：%SKXE
今日笔数：%BS　限笔：%BSXE
累计：收款 %ZSK · %ZBS 笔
%SDMX`;
export const noticePresets = [
  { name: '通道状态卡片（推荐）', template: channelCardTemplate },
  { name: '紧凑单行', template: '%ZT %ZD %BH %MC 收款/限额 %SK/%SKXE 笔数/限额 %BS/%BSXE 总收款/总笔数 %ZSK/%ZBS 5分 %5FCGL/%5FSK 15分 %15FCGL/%15FSK 30分 %30FCGL/%30FSK 60分 %60FCGL/%60FSK 全天 %QTCGL/%QTSK' },
  { name: '分行简洁', template: '%ZT %ZD %BH %MC\n今日收款 %SK/%SKXE · 笔数 %BS/%BSXE\n累计 %ZSK/%ZBS\n全天成功率 %QTCGL' },
  { name: '时段明细（成功率/笔数/收款）', template: '%ZT %ZD %BH %MC\n收款/限额 %SK/%SKXE 笔数/限额 %BS/%BSXE 总收款/总笔数 %ZSK/%ZBS\n成功率 / 笔数 / 收款\n5分：%5FCGL/%5FBS/%5FSK\n15分：%15FCGL/%15FBS/%15FSK\n30分：%30FCGL/%30FBS/%30FSK\n60分：%60FCGL/%60FBS/%60FSK\n全天：%QTCGL/%QTBS/%QTSK' },
];

export function noticeLimit(value: unknown) {
  if (value == null || value === '') return '—';
  return Number(value) === 0 ? '不限' : String(value);
}

export function periodDetail(windows: ({ count: number; amount: string } | null)[] = [], rates: (number | null)[] = []) {
  const labels = ['5 分钟', '15 分钟', '30 分钟', '60 分钟', '全天'];
  if (!windows.some(Boolean)) return '时段统计：数据不足';
  if (labels.every((_, i) => windows[i]?.count === 0 && Number(windows[i]?.amount) === 0)) return '5 / 15 / 30 / 60 分钟及全天：均无订单或收款';
  return ['时段  ·  成功率  ·  收款', ...labels.map((label, i) => {
    const w = windows[i], rate = rates[i];
    if (!w) return label + '：数据不足';
    return label + '：' + (rate == null ? '无样本' : (rate * 100).toFixed(2) + '%') + '  ·  ' + w.amount;
  })].join('\n');
}

export function formatChannelNotice(template: string, siteName: string, channel: {
  code: string; name: string; status: string; details: unknown;
}, metric?: ChannelOrderMetrics) {
  const details = (channel.details ?? {}) as Record<string, unknown>;
  const values: Record<string, string> = {
    ZD: siteName, BH: channel.code, MC: channel.name,
    ZT: channel.status === 'ENABLED' ? '🟢' : '🔴',
    ZTMC: channel.status === 'ENABLED' ? '已启用' : channel.status === 'DISABLED' ? '不可用' : '状态未知',
    SDMX: template.includes('%SDMX') ? periodDetail(metric?.windows, metric?.successRates) : '',
    SK: metric?.today?.amount ?? '—', SKXE: noticeLimit(details.dailyLimit),
    BS: String(metric?.today?.count ?? '—'), BSXE: noticeLimit(details.dailyOrderLimit),
    ZSK: String(details.totalSuccessAmount ?? '—'), ZBS: String(details.totalSuccessCount ?? '—'),
  };
  for (const [index, prefix] of ['5F', '15F', '30F', '60F', 'QT'].entries()) {
    const rate = metric?.successRates[index];
    const window = metric?.windows[index];
    values[`${prefix}CGL`] = rate == null ? '—' : `${(rate * 100).toFixed(2)}%`;
    values[`${prefix}BS`] = String(window?.count ?? '—');
    values[`${prefix}SK`] = window?.amount ?? '—';
  }
  return template.replace(/%([A-Z0-9]+)/g, (_, key: string) => values[key] ?? '—');
}

// 保留站点编号，发送前按群的最新可见范围过滤快照。
export const channelSnapshotPrefix = 'channel-summary:v1\n';
export interface ChannelNoticeSite { siteId: string; messages: string[] }
export function renderChannelSnapshot(payload: string, scope: { all?: boolean; siteIds?: string[] }) {
  const sites: ChannelNoticeSite[] = JSON.parse(payload.slice(channelSnapshotPrefix.length));
  return sites.filter(site => scope.all || scope.siteIds?.includes(site.siteId)).flatMap(site => site.messages).join('\n\n');
}
