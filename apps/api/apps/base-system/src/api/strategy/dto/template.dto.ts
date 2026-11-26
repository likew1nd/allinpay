import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ArrayMaxSize,
  ArrayMinSize,
  Matches,
  ArrayUnique,
  ValidateNested,
} from 'class-validator';
import type { TemplateCondition, TemplateRule } from '../template-rules';

export class TemplateActionDto {
  @IsIn([
    'ADJUST_MEMBER_WEIGHT',
    'SET_MEMBER_WEIGHT',
    'SET_CHANNEL_STATUS',
    'ADD_POLLING_MEMBER',
    'REMOVE_POLLING_MEMBER',
    'REMOVE_REPLACEMENT_MEMBER',
  ])
  type!: TemplateRule['action']['type'];

  @Type(() => Number)
  @IsInt()
  @Min(-2147483647)
  @Max(2147483647)
  value!: number;
}

export class TemplateConditionDto {
  @IsIn(['SUCCESS_RATE', 'FAILURE_RATE', 'ORDER_COUNT', 'CHANNEL_COUNT'])
  metric!: TemplateCondition['metric'];
  @IsIn(['LT', 'LTE', 'GT', 'GTE', 'EQ'])
  operator!: TemplateCondition['operator'];
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10000000)
  value!: number;
}

export class TemplateRuleDto extends TemplateConditionDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(19)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => TemplateConditionDto)
  conditions?: TemplateConditionDto[];

  @IsObject()
  @ValidateNested()
  @Type(() => TemplateActionDto)
  action!: TemplateActionDto;
}

export class StrategyConfigurationDto {
  @IsOptional()
  @IsIn(['MEMBER_WEIGHT', 'CHANNEL_STATUS', 'RULE_ACTIONS'])
  controlType: string = 'RULE_ACTIONS';
  @Type(() => Number) @IsInt() @Min(1) @Max(10080) windowMinutes!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(10000000) minSamples = 1;
  @Type(() => Number) @IsInt() @Min(30) @Max(86400) cooldownSeconds!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) minWeight!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) maxWeight!: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => TemplateRuleDto)
  rules!: TemplateRuleDto[];
}

export class SaveTemplateDto extends StrategyConfigurationDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class WorkspaceTargetDto {
  @IsString() @IsNotEmpty() @MaxLength(64) siteId!: string;
  @IsString() @Matches(/^(|\d{1,20})$/) pollingGroupCode!: string;
  @IsString() @Matches(/^\d{1,20}$/) channelCode!: string;
}

export class ReserveChannelDto {
  @IsString() @IsNotEmpty() @MaxLength(64) siteId!: string;
  @IsString() @Matches(/^\d{1,20}$/) channelCode!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsBoolean()
  allowReuse!: boolean;
}

export class ObjectCatalogDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10080)
  windowMinutes: number = 10;
}

export class SaveWorkspaceGroupDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(64) templateId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) expectedVersion?: number;
  @IsObject()
  @ValidateNested()
  @Type(() => StrategyConfigurationDto)
  configuration!: StrategyConfigurationDto;
  @IsArray()
  @ArrayMaxSize(2000)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => WorkspaceTargetDto)
  targets!: WorkspaceTargetDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => ReserveChannelDto)
  reserveChannels?: ReserveChannelDto[];
}

export class BindTargetsDto {
  @IsString() @IsNotEmpty() @MaxLength(64) siteId!: string;
  @IsOptional() @IsString() @Matches(/^\d{1,20}$/) pollingGroupCode?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @Matches(/^\d{1,20}$/, { each: true })
  channelCodes!: string[];
}
