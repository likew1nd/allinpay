import { hash, noticeIcons } from '../notification/notification.types';

export const transferResultKey = (id: string, status: string, targetId: string) => hash('transfer:' + id + ':' + status + ':' + targetId);
export const missingTransferScreenshot = '尚未收到匹配的终态截图';
export const transferPhotoKey = (resultKey: string) => hash('transfer-photo:' + resultKey);

interface TransferNotice {
  accountName: string;
  amount: string;
  payeeName: string;
  accountMasked: string;
  outBizNo: string;
}

export function formatTransferQr(row: TransferNotice, waitMinutes: number, expiresText?: string) {
  return `${noticeIcons.TRANSFER_QR}【扫码确认】${row.accountName}\n金额：${row.amount}\n收款：${row.payeeName} ${row.accountMasked}\n请用该付款账号管理员的支付宝 App 扫码验证身份` +
    (expiresText ? `\n二维码有效期至：${expiresText}` : '') +
    `\n请在 ${waitMinutes} 分钟内完成，超时本笔转账将失败\n单号：${row.outBizNo}`;
}

const resultLabels: Record<string, string> = {
  SUCCEEDED: '✅ 转账成功',
  FAILED: '❌ 转账失败',
  UNKNOWN: '❓ 结果未知',
  NEEDS_MANUAL: '🟠 待人工处理',
  CANCELLED: '🚫 转账已取消',
};

export function formatQrVoid(qrText: string, preview = false) {
  // 沿用发送时的交易快照，避免账号改名或收款资料变更后失效卡与原消息不一致。
  const details = qrText.split(/\r?\n/)
    .filter(line => line && line !== '【测试发送】' && line !== '演示码仅包含测试文字。' &&
      line !== '请用该付款账号管理员的支付宝 App 扫码验证身份' && !/^请在 \d+ 分钟内完成，超时本笔转账将失败$/.test(line))
    .map(line => line.replace(/^(?:📲)?【扫码确认】/, '发送账号：').replace(/^二维码有效期至：/, '原有效期至：'));
  return [
    ...(preview ? ['【测试发送】'] : []),
    '🔴 二维码已作废｜请勿再扫',
    ...details,
    ...(preview ? [] : ['该笔转账因扫码确认超时，已按失败处理', '如已有人扫码，请核对支付宝流水']),
  ].join('\n');
}

export function formatTransferResult(row: TransferNotice, status: string) {
  return `${resultLabels[status] ?? '❓ ' + status}｜自动转账\n付款环境：${row.accountName}\n金额：${row.amount}\n收款：${row.payeeName} ${row.accountMasked}\n单号：${row.outBizNo}`;
}
