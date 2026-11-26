import { BadRequestException, ConflictException } from '@nestjs/common';
import { ChannelAdvancedDto } from './dto/channel-advanced.dto';

export function readOrderNameRules(raw: unknown) {
  if (raw == null || raw === '') return [];
  try {
    const rules: unknown = JSON.parse(String(raw));
    if (
      !Array.isArray(rules) ||
      rules.some(
        (rule) =>
          !rule ||
          typeof rule !== 'object' ||
          typeof rule.name !== 'string' ||
          !['string', 'number'].includes(typeof rule.min) ||
          !['string', 'number'].includes(typeof rule.max),
      )
    )
      throw new Error();
    return rules.map((rule) => ({
      name: rule.name as string,
      min: String(rule.min),
      max: String(rule.max),
    }));
  } catch {
    throw new ConflictException(
      '原站点商品名称匹配规则格式无法识别，请先在原站点检查',
    );
  }
}

export function advancedFields(row: Record<string, unknown>) {
  return {
    dailyLimit: Number(row.daytop ?? 0),
    dailyOrderLimit: Number(row.daymaxorder ?? 0),
    rateLimitSeconds: Number(row.rate_limit_seconds ?? 0),
    rateLimitCount: Number(row.rate_limit_count ?? 0),
    minAmount: String(row.paymin ?? ''),
    maxAmount: String(row.paymax ?? ''),
    startHour: String(row.timestart ?? ''),
    endHour: String(row.timestop ?? ''),
    feeThreshold: String(row.payfee_lessthan ?? ''),
    minFee: String(row.payfee_mincost ?? ''),
    orderName: String(row.ordername ?? ''),
    orderNameRules: readOrderNameRules(row.ordername_rules),
  };
}

export function validateAdvanced(dto: ChannelAdvancedDto) {
  if (
    Number(dto.maxAmount) > 0 &&
    Number(dto.minAmount) > Number(dto.maxAmount)
  )
    throw new BadRequestException('单笔最小金额不能大于单笔最大金额');
  if (dto.rateLimitSeconds > 0 !== dto.rateLimitCount > 0)
    throw new BadRequestException(
      '频率限制的时间窗口和发起订单数须同时填写，或同时设为 0',
    );
  if ((dto.startHour === '') !== (dto.endHour === ''))
    throw new BadRequestException(
      '开放时间的开始和结束时间须同时填写，或同时留空',
    );
  for (const [index, rule] of dto.orderNameRules.entries()) {
    if (!rule.name.trim() || Number(rule.min) > Number(rule.max))
      throw new BadRequestException(
        `第 ${index + 1} 条商品规则名称不能为空，最小金额不能大于最大金额`,
      );
  }
  if (Buffer.byteLength(JSON.stringify(dto.orderNameRules)) > 60000)
    throw new BadRequestException('商品名称匹配规则内容过长');
}
