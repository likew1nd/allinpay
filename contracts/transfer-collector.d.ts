// 采集端领取和回报转账单的契约，认证方式和心跳相同：请求头 x-collector-token。
// POST /collectors/:id/transfers/claim-for-submit                 领取待执行的转账单
// POST /collectors/:id/transfers/:transferId/authorize-submission  点击付款前获取一次性许可
// POST /collectors/:id/transfers/:transferId/result  回报结果
//
// 约定：
// - 每个采集端按设置并发轮询，所有采集端合计最多同时转账 2 笔（含扫码等待）。同一环境互斥，轮询完成当前步骤后交接，转账结束后刷新余额。
// - 点了付款但未取得明确结果时回报 UNKNOWN，禁止重复付款；已知失败分笔不补建。
// - 执行超时后，未授权的准备单可判失败，已授权或历史执行单转 UNKNOWN。
// - 重复回报同一个状态是幂等的；成功、失败是终态，不能再改。

export interface CollectorTransferTask {
  id: string;
  // 稳定业务号，重试和重启都不会变
  outBizNo: string;
  amount: string;
  paymentPassword?: string | null;
  // 付款账号在采集端里的外部编号（和心跳里的 externalId 一致）
  payerExternalId: string;
  // 付款环境的支付宝登录账号，用于核对确认弹窗里的付款账号，防止环境串号
  payerLoginAccount?: string | null;
  // name 仅用于展示，脚本不核对姓名：企业账号在支付宝页面显示成“****司”，姓名不可靠
  payee: { name: string; account: string };
  // AUTO 策略触发；TEST 为中心手动发起的转账测试
  mode?: 'AUTO' | 'TEST';
  // 转账备注（最多 20 字，金额不足 1 元时支付宝不允许填写）
  remark?: string | null;
}

export type CollectorClaimReason =
  | 'UPDATE_REQUIRED'
  | 'PAUSED'
  | 'BUSY'
  | 'NONE'
  | 'INVALIDATED'
  | 'BALANCE_STALE'
  | 'TAKEN'
  | null;

export interface CollectorTransferClaimResult {
  transfer: CollectorTransferTask | null;
  reason: CollectorClaimReason;
  busyTransferId?: string;
}

export type CollectorTransferReportStatus =
  | 'SUCCEEDED'
  | 'FAILED'
  | 'NEEDS_MANUAL'
  | 'UNKNOWN';

export interface CollectorTransferReport {
  status: CollectorTransferReportStatus;
  note?: string;
  // 采集端内部使用：终态截图（JPEG data URL）。不随 /result 上报，由采集端单独 POST /transfers/:id/screenshot，
  // 避免截图校验失败（422）连带丢掉结果。
  screenshot?: string;
  // 失败原因代码：QR_TIMEOUT 表示扫码确认超时（二维码已发出，但无人在限定时间内完成验证）。
  // 中心据此作废同批次尚未领取的后续分笔；其他原因的失败不带此字段，不触发联动。
  failureCode?: 'QR_TIMEOUT';
}

// 点击付款后出现“扫码验证身份”页面时，采集端单独上传二维码截图：POST /collectors/:id/transfers/:transferId/qr
// 中心把图片发到业务范围内的 TG 群。二维码只上传一次；超过 waitMinutes 仍未完成验证，采集端回报 FAILED + QR_TIMEOUT。
export interface CollectorTransferQrReport {
  sessionId: string;
  // JPEG data URL，必须清晰到可以扫码
  image: string;
  // 支付宝页面标注的二维码有效截止时间原文（如“24日14时38分”），仅用于群消息展示，可能为空
  expiresText?: string;
  // 采集端等待扫码的分钟数（8），写进群消息提示
  waitMinutes: number;
}
