import { CollectorStatus, AccountStatus, AccountBusinessStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  ArrayUnique,
  IsBoolean,
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';


export class UpdateAccountCredentialsDto {
  @Transform(({ obj, key }) => obj[key]) @IsString() @MaxLength(191) loginAccount!: string;
  // APPID 按原始字符串校验，避免隐式数值转换丢失前导零或精度。
  @Transform(({ obj, key }) => obj[key]) @IsString() @MaxLength(191) appId!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @MaxLength(191, { each: true }) appIds?: string[];
  // 空字符串保留原密码；密码中的空格属于原始内容，不做裁剪。
  @Transform(({ obj, key }) => obj[key])
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(1024) password?: string;
  @Transform(({ obj, key }) => obj[key])
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(1024) paymentPassword?: string;
}

export class PageAccountDto {
  @IsOptional() @IsBoolean() transferOnly?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) current = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) size = 20;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
  @IsOptional() @IsString() @MaxLength(64) collectorId?: string;
}

/** 更新通知必须明确选择采集端，或显式请求全部；禁止缺省广播。 */
export class NotifyScriptUpdateDto {
  @Transform(({ obj, key }) => obj[key])
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ArrayUnique()
  @IsString({ each: true }) @Matches(/^\S+$/, { each: true }) @MaxLength(64, { each: true })
  ids?: string[];

  @Transform(({ obj, key }) => obj[key])
  @ValidateIf((_object, value) => value !== undefined) @Equals(true)
  all?: true;
}

export class PageCollectorDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) current = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) size = 20;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsEnum(CollectorStatus) status?: CollectorStatus;
}

export class PageFundAccountDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) current = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) size = 20;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsString() @MaxLength(20) status?: string;
}

class FundAccountBindingDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(64) accountId?:
    | string
    | null;
}

export class UpdateFundAccountDto extends FundAccountBindingDto {}

export class CreateFundAccountDto extends FundAccountBindingDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) owner!: string;
}

export class PageSettlementDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) current = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) size = 20;
  @IsOptional() @IsString() @MaxLength(20) status?: string;
}

export class CreateSettlementDto {
  @IsString() @IsNotEmpty() @MaxLength(64) fundAccountId!: string;
  @IsString() @IsNotEmpty() periodStart!: string;
  @IsString() @IsNotEmpty() periodEnd!: string;
  @IsString() @IsNotEmpty() amount!: string;
  @IsOptional() @IsString() fee?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CreateCollectorDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  /** 自定义 ID，留空时自动生成；只允许字母数字和连字符 */
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9-]{4,64}$/) customId?: string;
  /** 自定义 Token，留空时自动生成 */
  @IsOptional() @IsString() @MinLength(16) @MaxLength(256) @Matches(/^\S+$/) customToken?: string;
}

export class UpdateCollectorDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
}

export class CreateBindingDto {
  @IsString() @IsNotEmpty() @MaxLength(64) accountId!: string;
  @IsString() @IsNotEmpty() @MaxLength(64) siteId!: string;
  @IsString() @IsNotEmpty() @MaxLength(64) channelCode!: string;
}

export class UpdateBindingDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export type AccountMode = 'OFF' | 'MONITOR' | 'TRANSFER';

export class UpdateAccountModeDto {
  @IsIn(['OFF', 'MONITOR', 'TRANSFER']) mode!: AccountMode;
}

/** 单个或批量设置环境监控开关 */
export class UpdateMonitoringDto {
  @IsBoolean() monitoringEnabled!: boolean;
}

export class BatchUpdateMonitoringDto {
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) ids!: string[];
  @IsBoolean() monitoringEnabled!: boolean;
}

export class BatchRefreshAppIdsDto {
  @IsArray() @ArrayMaxSize(200) @ArrayUnique() @IsString({ each: true }) @MaxLength(64, { each: true }) ids!: string[];
}

/** 平台密码仅中心使用，普通读取接口只返回是否已配置。 */
export class UpdateScriptSettingsDto {
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() closeRestrictedChannels?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() restoreRecoveredChannels?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(1440) loginCooldownMinutes?: number;
  @ValidateIf((_object, value) => value !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(5) loginMaxAttempts?: number;
  @ValidateIf((_object, value) => value !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(60) loginTimeoutMinutes?: number;
  @ValidateIf((_object, value) => value !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(1440) environmentSyncMinutes?: number;
  @ValidateIf((_object, value) => value !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(60) balanceFreshMinutes?: number;
  // 扫码确认等待分钟数：二维码发出后超过此时间仍未完成验证，本笔转账按失败结束（二维码有效期 30 分钟，上限留出余量）
  @ValidateIf((_object, value) => value !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(25) qrWaitMinutes?: number;
  // 滑块识别坐标的固定补偿像素，负值表示回退
  @ValidateIf((_object, value) => value !== undefined) @Type(() => Number) @IsInt() @Min(-500) @Max(500) sliderOffsetPx?: number;
  @Transform(({ obj, key }) => obj[key])
  @ValidateIf((_object, value) => value !== undefined) @IsEnum({ NONE: 'NONE', TTSHITU: 'TTSHITU', BINGTOP: 'BINGTOP' }) captchaProvider?: 'NONE' | 'TTSHITU' | 'BINGTOP';
  // 图鉴打码平台凭据
  @Transform(({ obj, key }) => obj[key])
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(191) ttshituUsername?: string;
  @Transform(({ obj, key }) => obj[key])
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(1024) ttshituPassword?: string;
  // 滨图打码平台凭据
  @Transform(({ obj, key }) => obj[key])
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(191) bingtopUsername?: string;
  @Transform(({ obj, key }) => obj[key])
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(1024) bingtopPassword?: string;
  @IsBoolean() enabled!: boolean;
  @IsString() @IsNotEmpty() @MaxLength(500) tab1Url!: string;
  @IsString() @IsNotEmpty() @MaxLength(500) tab2Url!: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(500) tab3Url?: string;
  @Type(() => Number) @IsInt() @Min(5) @Max(3600) minRefreshSeconds!: number;
  @Type(() => Number) @IsInt() @Min(5) @Max(3600) maxRefreshSeconds!: number;
  @Type(() => Number) @IsInt() @Min(5) @Max(180) navigationTimeoutSeconds!: number;
  // 每个采集端同时巡检的环境数，与 Agent 的本地并发上限保持一致。
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) maxConcurrentAccounts?: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(5) retryCount!: number;
  @Type(() => Number) @IsInt() @Min(3) @Max(120) actionTimeoutSeconds!: number;
}

class AccountHeartbeatItemDto {
  @IsOptional() @IsEnum(AccountBusinessStatus) businessStatus?: AccountBusinessStatus;
  @IsOptional() @Matches(/^\d{1,16}(\.\d{1,2})?$/) receiptLimit?: string;
  @IsOptional() @Matches(/^\d{1,16}(\.\d{1,2})?$/) paymentLimit?: string;
  @IsOptional() @Matches(/^\d{1,16}(\.\d{1,2})?$/) unavailableBalance?: string;
  @IsOptional() @Matches(/^\d{1,16}(\.\d{1,2})?$/) pendingBalance?: string;
  @IsString() @IsNotEmpty() @MaxLength(128) externalId!: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsEnum(AccountStatus) status!: AccountStatus;
  @IsOptional() @IsString() @MaxLength(100) browserState?: string;
  @IsOptional() @IsString() @MaxLength(500) error?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
  @IsOptional()
  @Matches(/^\d{1,16}(\.\d{1,2})?$/, { message: '余额格式无效，最多两位小数' })
  balance?: string;
}

export class CollectorHeartbeatDto {
  @IsOptional() @IsString() @MaxLength(100) version?: string;
  @IsOptional() @IsEnum(CollectorStatus) status?: CollectorStatus;
  @IsOptional() @IsString() @MaxLength(500) error?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
  @IsOptional()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AccountHeartbeatItemDto)
  accounts?: AccountHeartbeatItemDto[];
}
