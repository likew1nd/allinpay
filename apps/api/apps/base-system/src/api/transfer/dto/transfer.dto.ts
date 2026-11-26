import { Type } from 'class-transformer';
import {
  IsBoolean, ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested, ValidateIf,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// 金额最多 16 位整数、2 位小数，和数据库 Decimal(20, 2) 对应
const AMOUNT = /^\d{1,16}(\.\d{1,2})?$/;
const AMOUNT_MESSAGE = '金额格式无效，最多两位小数';

export class PageTransferDto {
  @IsOptional() @IsString() @MaxLength(64) accountId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) current = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) size = 20;
  @IsOptional() @IsString() @MaxLength(20) status?: string;
  @IsOptional() @IsString() @MaxLength(64) fundAccountId?: string;
}

export class CreatePayeeDto {
  @IsOptional() @Matches(AMOUNT, { message: AMOUNT_MESSAGE }) dailyLimit?: string | null;
  @IsOptional() @Matches(AMOUNT, { message: AMOUNT_MESSAGE }) totalLimit?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(128) account!: string;
}

export class UpdatePayeeStatusDto {
  @IsIn(['ACTIVE', 'DISABLED']) status!: string;
}

export class AllocationDto {
  @IsIn(['PAYEE', 'AUTO']) kind!: 'PAYEE' | 'AUTO' | 'POOL';
  @IsString() @MaxLength(64) targetId!: string;
  @IsInt() @Min(1) @Max(10000) basisPoints!: number;
}
export class TransferConditionDto {
  @IsIn(['BALANCE', 'UNAVAILABLE_BALANCE', 'PENDING_BALANCE', 'TRANSFERRED_TODAY']) metric!: 'BALANCE' | 'UNAVAILABLE_BALANCE' | 'PENDING_BALANCE' | 'TRANSFERRED_TODAY';
  @IsIn(['LT', 'LTE', 'GT', 'GTE', 'EQ']) operator!: 'LT' | 'LTE' | 'GT' | 'GTE' | 'EQ';
  @Matches(AMOUNT, { message: AMOUNT_MESSAGE }) value!: string;
}
export class TransferStrategyRuleDto {
  @IsOptional() @IsIn(['EQUAL', 'MANUAL']) allocationMode?: 'EQUAL' | 'MANUAL';
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsBoolean() enabled!: boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => TransferConditionDto) conditions!: TransferConditionDto[];
  @Matches(AMOUNT, { message: AMOUNT_MESSAGE }) maxAmount!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => AllocationDto) allocations!: AllocationDto[];
}
export class RenameTransferTemplateDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
}
export class CreateTransferDraftDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() isTemplate?: boolean;
}
export class CreateTransferRuleDto {
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayMinSize(0) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => TransferStrategyRuleDto) rules?: TransferStrategyRuleDto[];
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @Matches(AMOUNT, { message: AMOUNT_MESSAGE }) triggerBalance!: string;
  @Matches(AMOUNT, { message: AMOUNT_MESSAGE }) reserveAmount!: string;
  @Matches(AMOUNT, { message: AMOUNT_MESSAGE }) feeBuffer!: string;
  @Matches(AMOUNT, { message: AMOUNT_MESSAGE }) minAmount!: string;
  @Matches(AMOUNT, { message: AMOUNT_MESSAGE }) maxAmount!: string;
  @IsOptional() @Matches(AMOUNT, { message: AMOUNT_MESSAGE }) dailyLimit?: string | null;
  @IsArray() @ArrayMinSize(0) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => AllocationDto) allocations!: AllocationDto[];
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() isTemplate?: boolean;
}
export class UpdateTransferRuleDto extends CreateTransferRuleDto {}
export class SetEnvironmentTransferDto {
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() listed?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(64) ruleId?: string | null;
}
export class PayeeLimitsDto {
  @IsOptional() @Matches(AMOUNT, { message: AMOUNT_MESSAGE }) dailyLimit?: string | null;
  @IsOptional() @Matches(AMOUNT, { message: AMOUNT_MESSAGE }) totalLimit?: string | null;
}
export class ClaimTransferDto {
  @IsString() @IsNotEmpty() @MaxLength(64) sessionId!: string;
}
// 手动转账测试：收款账号可以手填，也可以选收款池里的账号（传 payeeId，由后端解密）；不依赖策略；
// 不填姓名（企业账号在支付宝页面显示成“****司”，姓名无法核对）
export class CreateTransferTestDto {
  @Matches(AMOUNT, { message: AMOUNT_MESSAGE }) amount!: string;
  @ValidateIf(dto => !dto.payeeId) @IsString() @IsNotEmpty() @MaxLength(128) payeeAccount?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(64) payeeId?: string;
  @IsOptional() @IsString() @MaxLength(20) remark?: string;
}
// 采集端进度心跳：步骤和页面状态，由脚本每 3 秒上报，不含账号、姓名、密码
export class TransferProgressDto {
  @IsString() @IsNotEmpty() @MaxLength(64) sessionId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => TransferProgressEntryDto) logs!: TransferProgressEntryDto[];
}
export class TransferProgressEntryDto {
  @IsString() @MaxLength(40) at!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) message!: string;
}
// 只切换策略的启用状态（列表页的开关）：不改策略内容，也不重新校验收款账号
export class UpdateTransferRuleFlagsDto {
  @IsBoolean() enabled!: boolean;
}
export class ResolveTransferDto {
  @IsIn(['SUCCEEDED', 'FAILED']) status!: string;
  @IsString() @IsNotEmpty() @MaxLength(400) note!: string;
}

export class CollectorTransferResultDto {
  @IsString() @IsNotEmpty() @MaxLength(64) sessionId!: string;
  @IsIn(['SUCCEEDED', 'FAILED', 'NEEDS_MANUAL', 'UNKNOWN']) status!: string;
  @IsOptional() @IsString() @MaxLength(400) note?: string;
  // 扫码确认超时：中心据此作废同批次后续分笔
  @IsOptional() @IsIn(['QR_TIMEOUT']) failureCode?: 'QR_TIMEOUT';
}

// 转账终态截图：采集端单独上报，不进 /result（截图校验失败不能连带丢掉结果）。
// 采集端把单张图压到约 200KB（base64 约 270KB），这里留出余量；只接受 JPEG data URL。
export class TransferScreenshotDto {
  @IsString() @IsNotEmpty() @MaxLength(64) sessionId!: string;
  @IsIn(['SUCCEEDED', 'FAILED', 'UNKNOWN']) result!: string;
  @IsString() @MaxLength(400_000) @Matches(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, { message: '截图必须是 JPEG data URL' }) image!: string;
}

// 扫码确认的二维码：采集端识别到“扫码验证身份”页后单独上传，只收 JPEG data URL。
// 二维码必须清晰可扫，图片上限比终态截图宽松；中心只转发到 TG 群，不长期保存。
export class TransferQrDto {
  @IsString() @IsNotEmpty() @MaxLength(64) sessionId!: string;
  @IsString() @MaxLength(700_000) @Matches(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, { message: '二维码必须是 JPEG data URL' }) image!: string;
  @IsOptional() @IsString() @MaxLength(40) expiresText?: string;
  @IsInt() @Min(1) @Max(30) waitMinutes!: number;
}
