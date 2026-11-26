export interface TransferAllocation {
  kind: 'PAYEE' | 'AUTO' | 'POOL';
  // 自动抽取时为空；POOL 仅兼容历史规则。
  targetId: string;
  // 万分比，所有分配合计为 10000。
  basisPoints: number;
}
export interface TransferCondition {
  metric: 'BALANCE' | 'UNAVAILABLE_BALANCE' | 'PENDING_BALANCE' | 'TRANSFERRED_TODAY';
  operator: 'LT' | 'LTE' | 'GT' | 'GTE' | 'EQ';
  value: string;
}
export interface TransferStrategyRule {
  name: string;
  enabled: boolean;
  conditions: TransferCondition[];
  maxAmount: string;
  allocations: TransferAllocation[];
  // 未指定时按已有比例推断，手动调整后持续保留手动模式。
  allocationMode?: 'EQUAL' | 'MANUAL';
}
