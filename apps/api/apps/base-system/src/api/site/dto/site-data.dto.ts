import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class ChannelDetailsDto {
  @Transform(({ obj, key }) => obj[key]) @IsOptional() @Matches(/^\d{1,16}(?:\.\d{1,2})?$/)
  totalSuccessAmount?: string;
  @Transform(({ obj, key }) => obj[key]) @IsOptional() @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER)
  totalSuccessCount?: number;
  @Transform(({ obj, key }) => obj[key]) @IsOptional() @IsString() @MaxLength(191)
  appId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(100, { each: true })
  availableInterfaces?: string[];
  @Transform(({ obj, key }) => obj[key]) @IsOptional() @IsString() @MaxLength(100)
  paymentTypeCode?: string;
  @Transform(({ obj, key }) => obj[key]) @IsOptional() @IsString() @MaxLength(200)
  pluginTitle?: string;
  @Transform(({ obj, key }) => obj[key]) @IsOptional() @IsInt() @Min(0) @Max(255)
  mode?: number;
  @Transform(({ obj, key }) => obj[key]) @IsOptional() @Matches(/^\d{1,3}(?:\.\d{1,2})?$/)
  rate?: string;
  @Transform(({ obj, key }) => obj[key]) @IsOptional() @Matches(/^\d{1,3}(?:\.\d{1,2})?$/)
  costRate?: string;
  @Transform(({ obj, key }) => obj[key]) @IsOptional() @Matches(/^\d{1,16}(?:\.\d{1,2})?$/)
  dailyLimit?: string;
  @Transform(({ obj, key }) => obj[key]) @IsOptional() @IsInt() @Min(0) @Max(2147483647)
  dailyOrderLimit?: number;
  @Transform(({ obj, key }) => obj[key]) @IsOptional() @Matches(/^\d{1,16}(?:\.\d{1,2})?$/)
  minAmount?: string;
  @Transform(({ obj, key }) => obj[key]) @IsOptional() @Matches(/^\d{1,16}(?:\.\d{1,2})?$/)
  maxAmount?: string;
}
class ChannelDto {
  @IsOptional() @ValidateNested() @Type(() => ChannelDetailsDto)
  details?: ChannelDetailsDto;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^\d{1,20}$/)
  code!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsString()
  @MaxLength(100)
  name!: string;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^\d{1,20}$/)
  paymentTypeId!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsString()
  @MaxLength(100)
  paymentTypeName!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsString()
  @MaxLength(100)
  plugin!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsInt()
  @Min(0)
  @Max(255)
  sourceStatus!: number;
  @Transform(({ obj, key }) => obj[key])
  @IsInt()
  @Min(0)
  @Max(255)
  dayStatus!: number;
}
class MemberDto {
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^\d{1,20}$/)
  channelCode!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsInt()
  @Min(0)
  @Max(2147483647)
  weight!: number;
  @Transform(({ obj, key }) => obj[key])
  @IsInt()
  @Min(0)
  @Max(2147483647)
  position!: number;
}
class PollingDto {
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^\d{1,20}$/)
  code!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsString()
  @MaxLength(100)
  name!: string;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^\d{1,20}$/)
  paymentTypeId!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsString()
  @MaxLength(100)
  paymentTypeName!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsInt()
  @Min(0)
  @Max(255)
  sourceStatus!: number;
  @Transform(({ obj, key }) => obj[key])
  @IsInt()
  @Min(0)
  @Max(255)
  kind!: number;
  @Transform(({ obj, key }) => obj[key])
  @IsInt()
  @Min(0)
  @Max(2147483647)
  position!: number;
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => MemberDto)
  members!: MemberDto[];
}
export class SyncStartDto {
  @Transform(({ obj, key }) => obj[key])
  @IsInt()
  @Min(1)
  revision!: number;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  @IsDateString({ strict: true })
  windowStart!: string;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  @IsDateString({ strict: true })
  windowEnd!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsIn(['epay-pro-2070-status-v1', 'epay-pro-2070-status-v2'])
  mappingVersion!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsInt()
  @Min(0)
  @Max(10000000)
  expectedCount!: number;
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ChannelDto)
  channels!: ChannelDto[];
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => PollingDto)
  pollingGroups!: PollingDto[];
}
class OrderDto {
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^\d{1,30}$/)
  externalId!: string;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^\d{1,20}$/)
  merchantId!: string;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^\d{1,20}$/)
  paymentTypeId!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsString()
  @MaxLength(100)
  paymentTypeName!: string;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^\d{1,20}$/)
  channelCode!: string;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^\d{1,20}$/)
  subchannelCode!: string;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^\d{1,16}\.\d{2}$/)
  amount!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @Matches(/^\d{1,16}\.\d{2}$/)
  realAmount?: string;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^\d{1,3}$/)
  sourceStatus!: string;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  @IsDateString({ strict: true })
  occurredAt!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  @IsDateString({ strict: true })
  paidAt?: string;
}
export class SyncPageDto {
  @Transform(({ obj, key }) => obj[key])
  @IsInt()
  @Min(0)
  @Max(20000)
  page!: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => OrderDto)
  orders!: OrderDto[];
}
export class PageSiteDataDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) current = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) size = 20;
  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;
  @IsOptional()
  @IsIn([
    'ENABLED',
    'DISABLED',
    'UNKNOWN',
    'SUCCESS',
    'FAILED',
    'PROCESSING',
    'EXCLUDED',
  ])
  @Transform(({ obj, key }) => obj[key])
  status?: string;
  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @Matches(/^\d{1,3}$/)
  sourceStatus?: string;
  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @Matches(/^\d{1,20}$/)
  channelCode?: string;
  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  @IsDateString({ strict: true })
  start?: string;
  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  @IsDateString({ strict: true })
  end?: string;
}

export class PageSiteOrdersDto extends PageSiteDataDto {
  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @IsString()
  @MaxLength(191)
  siteId?: string;

  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @IsString()
  @MaxLength(100)
  orderId?: string;

  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @IsString()
  @MaxLength(100)
  merchantId?: string;

  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @Matches(/^\d{1,16}(?:\.\d{1,2})?$/)
  minAmount?: string;

  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @Matches(/^\d{1,16}(?:\.\d{1,2})?$/)
  maxAmount?: string;
}
