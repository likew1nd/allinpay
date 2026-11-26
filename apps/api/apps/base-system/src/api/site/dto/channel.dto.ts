import { Transform } from 'class-transformer';
import {
  IsIn,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DeleteSiteDto } from './delete-site.dto';

export class ChannelRevisionDto {
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^[a-f0-9]{64}$/)
  revision!: string;
}
export class UpdateChannelDto extends ChannelRevisionDto {
  @Transform(({ obj, key }) => obj[key])
  @IsInt()
  @Min(1)
  paymentTypeId!: number;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^[a-zA-Z0-9_]{1,20}$/)
  plugin!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @IsBoolean()
  resetConfiguration?: boolean;
  @Transform(({ obj, key }) => obj[key])
  @IsString()
  @MaxLength(30)
  name!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsIn([0, 1])
  mode!: number;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^\d{1,3}(?:\.\d{1,2})?$/)
  rate!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @Matches(/^(?:\d{1,3}(?:\.\d{1,2})?)?$/)
  costRate?: string;
  @Transform(({ obj, key }) => obj[key])
  @IsInt()
  @Min(0)
  @Max(2147483647)
  dailyLimit!: number;
  @Transform(({ obj, key }) => obj[key])
  @IsInt()
  @Min(0)
  @Max(2147483647)
  dailyOrderLimit!: number;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^(?:\d{1,7}(?:\.\d{1,2})?)?$/)
  minAmount!: string;
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^(?:\d{1,7}(?:\.\d{1,2})?)?$/)
  maxAmount!: string;
}
export class ChannelStatusDto {
  @Transform(({ obj, key }) => obj[key])
  @IsIn([0, 1])
  status!: number;
  @Transform(({ obj, key }) => obj[key])
  @IsIn([0, 1])
  expectedStatus!: number;
}
export class ChannelConfigDto extends ChannelRevisionDto {
  @Transform(({ obj, key }) => obj[key])
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsIn(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], { each: true })
  apptype?: string[];
  @Transform(({ obj, key }) => obj[key])
  @IsObject()
  changes!: Record<string, unknown>;
}
export class DeleteChannelDto extends DeleteSiteDto {
  @Transform(({ obj, key }) => obj[key])
  @Matches(/^[a-f0-9]{64}$/)
  revision!: string;
}
