import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNotEmpty, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { ScriptAccountHeartbeatDto } from './script-runtime.dto';

export class AgentSessionDto {
  @IsString() @MaxLength(64) scriptVersion!: string;
}
export class AgentSessionRefDto {
  @IsString() @IsNotEmpty() @MaxLength(64) sessionId!: string;
}
class EnvironmentProfileDto {
  @IsString() @IsNotEmpty() @MaxLength(128) externalId!: string;
  @IsString() @MaxLength(191) profileNo!: string;
  @IsString() @MaxLength(191) name!: string;
  @IsString() @MaxLength(191) groupName!: string;
}
export class EnvironmentPageDto extends AgentSessionRefDto {
  @IsString() @IsNotEmpty() @MaxLength(64) syncId!: string;
  @IsInt() @Min(0) @Max(999) page!: number;
  @IsInt() @Min(1) @Max(1000) totalPages!: number;
  @IsArray() @ArrayMaxSize(100) @ArrayUnique((item: EnvironmentProfileDto) => item.externalId)
  @ValidateNested({ each: true }) @Type(() => EnvironmentProfileDto) profiles!: EnvironmentProfileDto[];
}
export class AgentConfigurationQueryDto extends AgentSessionRefDto {}
export class AgentTaskClaimDto extends AgentSessionRefDto {
  @IsInt() @Min(1) @Max(20) capacity!: number;
}
const AMOUNT = /^\d{1,16}(\.\d{1,2})?$/;
// 单张截图上限 3M 字符；两张加其他字段低于 Fastify 请求体上限（8MB，见 fastify.adapter.ts）
const IMAGE_MAX = 3_000_000;
class InspectionFundsDto {
  @ValidateIf((_, value) => value !== null) @Matches(AMOUNT) availableBalance!: string | null;
  @ValidateIf((_, value) => value !== null) @Matches(AMOUNT) unavailableBalance!: string | null;
  @ValidateIf((_, value) => value !== null) @Matches(AMOUNT) pendingBalance!: string | null;
  @ValidateIf((_, value) => value !== null) @Matches(AMOUNT) receiptQuota!: string | null;
  @ValidateIf((_, value) => value !== null) @Matches(AMOUNT) paymentQuota!: string | null;
  // 额度显示“不限额”时为 true；可选，兼容不带该字段的旧版采集端
  @IsOptional() @IsBoolean() receiptUnlimited?: boolean;
  @IsOptional() @IsBoolean() paymentUnlimited?: boolean;
}
class InspectionRestrictionDto {
  @IsBoolean() limited!: boolean;
  @IsOptional() @IsString() @MaxLength(IMAGE_MAX) @Matches(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/) image?: string;
}
class AccountInspectionDto {
  @IsOptional() @ValidateNested() @Type(() => InspectionFundsDto) funds?: InspectionFundsDto;
  @IsOptional() @ValidateNested() @Type(() => InspectionRestrictionDto) restriction?: InspectionRestrictionDto;
  @IsOptional() @ValidateNested() @Type(() => InspectionRestrictionDto) judicial?: InspectionRestrictionDto;
}
export class AgentTaskResultDto extends ScriptAccountHeartbeatDto {
  @IsString() @IsNotEmpty() @MaxLength(64) sessionId!: string;
  @IsString() @IsNotEmpty() @MaxLength(64) taskId!: string;
  @IsISO8601() completedAt!: string;
  @IsOptional() @IsObject() bindings?: Record<string, unknown>;
  @IsOptional() @ValidateNested() @Type(() => AccountInspectionDto) inspection?: AccountInspectionDto;
  @IsOptional() @IsBoolean() yieldedForTransfer?: boolean;
  @IsOptional() @IsBoolean() appIdsAttempted?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsString({ each: true }) @MaxLength(191, { each: true }) appIds?: string[];
  @IsOptional() @IsString() @MaxLength(500) appIdsError?: string;
}
class AgentLogEntryDto {
  @IsISO8601() at!: string;
  @IsString() @MaxLength(200) message!: string;
  @IsOptional() @IsString() @MaxLength(1000) url?: string;
}
export class AgentLogsDto extends AgentSessionRefDto {
  @IsString() @MaxLength(64) taskId!: string;
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => AgentLogEntryDto) logs!: AgentLogEntryDto[];
}
export class AgentCommandReceiptDto extends AgentSessionRefDto {
  @IsIn(['RUNNING', 'SUCCEEDED', 'FAILED']) status!: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  @IsOptional() @IsString() @MaxLength(500) error?: string;
}
