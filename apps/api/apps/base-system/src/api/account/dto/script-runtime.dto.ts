import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const SCRIPT_STATUSES = ['LOGGED_IN', 'LOGIN_REQUIRED', 'PASSWORD_REJECTED', 'QR_LOGIN_REQUIRED', 'CAPTCHA_REQUIRED', 'PAGE_ERROR', 'ENV_UNAVAILABLE', 'UNKNOWN'] as const;

class ScriptTabSnapshotDto {
  @IsIn(['home', 'riskManage']) tab!: 'home' | 'riskManage';
  @IsString() @MaxLength(1000) url!: string;
  @IsBoolean() loaded!: boolean;
  @IsIn(SCRIPT_STATUSES) loginState!: typeof SCRIPT_STATUSES[number];
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsISO8601() observedAt!: string;
}

class ScriptLastActionDto {
  @IsIn(['REFRESH', 'CLICK', 'NAVIGATE', 'NONE']) type!: 'REFRESH' | 'CLICK' | 'NAVIGATE' | 'NONE';
  @IsOptional() @IsIn(['home', 'riskManage']) tab?: 'home' | 'riskManage';
  @IsISO8601() at!: string;
  @IsBoolean() success!: boolean;
}

export class ScriptAccountHeartbeatDto {
  @IsString() @IsNotEmpty() @MaxLength(191) externalId!: string;
  @IsIn(SCRIPT_STATUSES) status!: typeof SCRIPT_STATUSES[number];
  @IsArray() @ArrayMaxSize(2) @ValidateNested({ each: true }) @Type(() => ScriptTabSnapshotDto)
  tabs!: ScriptTabSnapshotDto[];
  @IsOptional() @ValidateNested() @Type(() => ScriptLastActionDto) lastAction?: ScriptLastActionDto;
  @IsOptional() @IsString() @MaxLength(1000) error?: string;
}

export class ScriptMonitorHeartbeatDto {
  @IsOptional() @IsString() @MaxLength(64) sessionId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) appliedRevision?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(22) @IsString({ each: true }) activeTaskIds?: string[];
  @IsOptional() @IsIn(['UNKNOWN', 'AVAILABLE', 'UNAVAILABLE']) adsPowerStatus?: 'UNKNOWN' | 'AVAILABLE' | 'UNAVAILABLE';
  @IsOptional() @IsString() @MaxLength(500) environmentSyncError?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(64) collectorId!: string;
  @IsString() @IsNotEmpty() @MaxLength(64) scriptVersion!: string;
  @IsISO8601() sentAt!: string;
  // 同一批次不重复更新同一环境，且限制批次大小。
  @IsArray() @ArrayMaxSize(100) @ArrayUnique((account: ScriptAccountHeartbeatDto) => account.externalId)
  @ValidateNested({ each: true }) @Type(() => ScriptAccountHeartbeatDto)
  accounts!: ScriptAccountHeartbeatDto[];
}
