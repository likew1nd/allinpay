import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ChannelRevisionDto } from './channel.dto';

export class ChannelOrderNameRuleDto {
  @Transform(({ obj, key }) => obj[key])
  @IsString()
  @MaxLength(255)
  name!: string;

  @Transform(({ obj, key }) => obj[key])
  @Matches(/^\d{1,7}(?:\.\d{1,2})?$/)
  min!: string;

  @Transform(({ obj, key }) => obj[key])
  @Matches(/^\d{1,7}(?:\.\d{1,2})?$/)
  max!: string;
}

export class ChannelAdvancedDto extends ChannelRevisionDto {
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
  @IsInt()
  @Min(0)
  @Max(2147483647)
  rateLimitSeconds!: number;

  @Transform(({ obj, key }) => obj[key])
  @IsInt()
  @Min(0)
  @Max(2147483647)
  rateLimitCount!: number;

  @Transform(({ obj, key }) => obj[key])
  @Matches(/^(?:\d{1,7}(?:\.\d{1,2})?)?$/)
  minAmount!: string;

  @Transform(({ obj, key }) => obj[key])
  @Matches(/^(?:\d{1,7}(?:\.\d{1,2})?)?$/)
  maxAmount!: string;

  @Transform(({ obj, key }) => obj[key])
  @Matches(/^(?:[0-9]|1[0-9]|2[0-3])?$/)
  startHour!: string;

  @Transform(({ obj, key }) => obj[key])
  @Matches(/^(?:[0-9]|1[0-9]|2[0-3])?$/)
  endHour!: string;

  @Transform(({ obj, key }) => obj[key])
  @Matches(/^(?:\d{1,7}(?:\.\d{1,2})?)?$/)
  feeThreshold!: string;

  @Transform(({ obj, key }) => obj[key])
  @Matches(/^(?:\d{1,7}(?:\.\d{1,2})?)?$/)
  minFee!: string;

  @Transform(({ obj, key }) => obj[key])
  @IsString()
  @MaxLength(255)
  orderName!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ChannelOrderNameRuleDto)
  orderNameRules!: ChannelOrderNameRuleDto[];
}
