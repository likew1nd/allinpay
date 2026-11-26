import { Prisma } from '@prisma/client';
import { Resvg } from '@resvg/resvg-js';
import { formatIncidentNotice } from '../notification/notification.types';
import { formatTransferQr, formatTransferResult } from '../transfer/transfer-notice';
import { formatChannelNotice } from './channel-notice';
import { digestParts, Environment, formatEnvironmentAlert, renderDigest } from './environment-notice';

const test = '【测试发送】\n';
const transfer = {
  accountName: '演示付款环境', amount: '128.60', payeeName: '演示收款人', accountMasked: '138****2468', outBizNo: 'DEMO-TRANSFER-001',
};
const previewOrder = {
  today: { amount: '8260.50', count: 69 },
  successRates: [1, 0.97, 0.95, 0.96, 0.98],
  windows: [{ count: 2, amount: '199.00' }, { count: 7, amount: '890.30' }, { count: 13, amount: '1620.00' },
    { count: 25, amount: '3240.40' }, { count: 69, amount: '8260.50' }],
};
const statuses: Record<string, Environment['status']> = {
  ACCOUNT_LOGIN_REQUIRED: 'AUTH_EXPIRED', ACCOUNT_PASSWORD_REJECTED: 'PASSWORD_REJECTED',
  ACCOUNT_CAPTCHA_REQUIRED: 'CAPTCHA_REQUIRED', ACCOUNT_ENV_UNAVAILABLE: 'ENV_UNAVAILABLE', ACCOUNT_COLLECTION_FAILED: 'DEGRADED',
};

function environment(at: Date, eventType: string, profileNo = '019'): Environment {
  const restrictionActive = eventType === 'ACCOUNT_RESTRICTION', judicialActive = eventType === 'ACCOUNT_JUDICIAL';
  return {
    id: 'DEMO-ENV-' + profileNo, profileNo, externalId: 'DEMO-' + profileNo, name: '演示环境 ' + profileNo,
    collectorId: 'DEMO-COLLECTOR', collector: { name: '演示采集端' }, status: statuses[eventType] ?? 'HEALTHY',
    businessStatus: restrictionActive ? 'RESTRICTED' : judicialActive ? 'JUDICIAL' : 'NORMAL',
    restrictionActive, judicialActive, balance: new Prisma.Decimal('6248.50'), balanceAt: at,
    unavailableBalance: new Prisma.Decimal(restrictionActive || judicialActive ? '2980.00' : '0.00'), pendingBalance: new Prisma.Decimal('356.20'),
  };
}

function pngData(svg: string) {
  return 'data:image/png;base64,' + Buffer.from(new Resvg(svg).render().asPng()).toString('base64');
}

function transferResultImage() {
  return pngData(`<svg xmlns="http://www.w3.org/2000/svg" width="880" height="500" viewBox="0 0 880 500">
    <rect width="880" height="500" fill="#edf2f8"/><rect x="28" y="24" width="824" height="450" rx="16" fill="white"/>
    <g font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" fill="#26364b">
      <text x="60" y="72" font-size="21" fill="#526780">测试发送 · 转账终态页面示例</text>
      <circle cx="77" cy="132" r="18" fill="#198553"/><path d="M68 132l6 6 12-14" fill="none" stroke="white" stroke-width="3"/>
      <text x="110" y="143" font-size="32">转账成功</text>
      <text x="60" y="219" font-size="45" font-weight="bold">¥${transfer.amount}</text>
      <path d="M60 251H816" stroke="#dce4ed"/>
      <g font-size="23"><text x="60" y="298">付款环境　${transfer.accountName}</text>
        <text x="60" y="346">收款人　　${transfer.payeeName}　${transfer.accountMasked}</text>
        <text x="60" y="394">单号　　　${transfer.outBizNo}</text></g>
      <text x="60" y="443" font-size="18" fill="#526780">演示数据 · 仅供查看通知效果</text>
    </g></svg>`);
}

function evidenceImage(judicial: boolean) {
  const title = judicial ? '司法限制' : '商家资金限制';
  const details = judicial ? '部分资金处于司法冻结状态' : '该账号部分资金暂不可用';
  return pngData(`<svg xmlns="http://www.w3.org/2000/svg" width="880" height="460" viewBox="0 0 880 460">
    <rect width="880" height="460" fill="#edf2f8"/>
    <rect width="880" height="58" fill="#233650"/>
    <rect x="36" y="84" width="808" height="332" rx="16" fill="#fff"/>
    <rect x="68" y="163" width="744" height="54" rx="8" fill="#fff2e2"/>
    <g font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" fill="#192c46">
      <text x="36" y="37" font-size="21" fill="#fff">通知测试 · 账务状态示例</text>
      <text x="68" y="136" font-size="30" font-weight="bold">${title}</text>
      <text x="90" y="197" font-size="23" fill="#8b3b14">${details}</text>
      <text x="68" y="268" font-size="22">环境编号：019</text>
      <text x="68" y="315" font-size="22">不可用金额：¥2,980.00</text>
      <text x="68" y="366" font-size="20" fill="#556a86">截图样例 · 数据仅用于验证通知版式</text>
    </g>
  </svg>`);
}

// 使用仓库里的二维码生成器生成，内容为纯文本 EPAY PREVIEW ONLY - NO PAYMENT。
const qrModules = [
  '1111111011010110101111111',
  '1000001010100000101000001',
  '1011101001100111101011101',
  '1011101000010101101011101',
  '1011101010110011001011101',
  '1000001011101010001000001',
  '1111111010101010101111111',
  '0000000011001010100000000',
  '1110011011011010111110011',
  '0001000110001000100100000',
  '0000001001110111110100101',
  '1010100010101001110101000',
  '0011111001101100101010111',
  '0101010110101100100100110',
  '1100111000010001001010101',
  '0000000011100001110100010',
  '1110001001000100111111001',
  '0000000010101100100010000',
  '1111111000010001101011101',
  '1000001010100011100011001',
  '1011101000111011111110100',
  '1011101000001000010000010',
  '1011101010111111101011111',
  '1000001010000000110011000',
  '1111111010110101100110101',
];

function qrImage() {
  const modules = qrModules.flatMap((line, y) => Array.from(line, (cell, x) => cell === '1' ? `M${x + 4} ${y + 4}h1v1h-1z` : '')).join('');
  return pngData(`<svg xmlns="http://www.w3.org/2000/svg" width="396" height="396" viewBox="0 0 33 33">
    <rect width="33" height="33" fill="white"/><path d="${modules}"/>
  </svg>`);
}

export function noticePreview(key: string, label: string, at: Date, template?: string, repeats = false): { kind: string; text: string; image?: string }[] {
  if (key === 'CHANNEL_NOTICE' && template) {
    const channels = [
      { code: '101', name: '支付宝演示通道', status: 'ENABLED', details: { dailyLimit: 20000, dailyOrderLimit: 240, totalSuccessAmount: '58690.50', totalSuccessCount: 486 } },
      { code: '102', name: '微信演示通道', status: 'DISABLED', details: { dailyLimit: 15000, dailyOrderLimit: 160, totalSuccessAmount: '18760.00', totalSuccessCount: 151 } },
    ];
    const rows = channels.map((channel, index) => formatChannelNotice(template, '演示站点', channel, index === 0 ? previewOrder : undefined));
    return [{ kind: 'CHANNEL_TEST', text: test + rows.join('\n\n') }];
  }
  if (key === 'ENV_SUMMARY' && template) {
    const sample = [environment(at, 'ACCOUNT_RESTRICTION'), environment(at, 'ACCOUNT_LOGIN_REQUIRED', '023'), environment(at, '', '031')];
    return digestParts(sample, template, at).map(part => ({ kind: 'ENV_SUMMARY_PREVIEW', text: test + renderDigest(part, at) }));
  }
  if (key === 'TRANSFER_QR') {
    const expiry = new Date(+at + 8 * 60_000).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });
    return [{ kind: 'TRANSFER_QR_TEST', text: test + '演示码仅包含测试文字。\n' + formatTransferQr(transfer, 8, expiry), image: qrImage() }];
  }
  if (key === 'TRANSFER') return [{ kind: 'TRANSFER_RESULT_TEST', text: test + formatTransferResult(transfer, 'SUCCEEDED'), image: transferResultImage() }];
  const phase = repeats ? 'REMIND' : 'OPEN';
  if (key.startsWith('ACCOUNT_')) {
    const image = key === 'ACCOUNT_RESTRICTION' || key === 'ACCOUNT_JUDICIAL' ? evidenceImage(key === 'ACCOUNT_JUDICIAL') : null;
    const alert = formatEnvironmentAlert(environment(at, key), image, key, label, phase, at);
    return [{ kind: 'ENV_ALERT_PREVIEW', text: test + alert.text, image: alert.image ?? undefined }];
  }
  const entityId = key === 'COLLECTOR_OFFLINE' ? 'DEMO-COLLECTOR-001' : key === 'STRATEGY_EXECUTION_FAILED' ? 'DEMO-ADJUSTMENT-001' : 'DEMO-ENV-019';
  return [{ kind: 'NOTICE_ROUTE_TEST', text: test + formatIncidentNotice({ id: 'DEMO-INCIDENT-001', entityId, title: label, occurredAt: at, eventType: key }, phase) }];
}
