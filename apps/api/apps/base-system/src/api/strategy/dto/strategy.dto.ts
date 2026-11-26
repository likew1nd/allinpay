import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PageStrategyDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) current = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) size = 20;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsString() @MaxLength(64) siteId?: string;
  @IsOptional() @IsString() @MaxLength(64) groupId?: string;
}

export class CreateStrategyGroupDto {
  @IsString() @IsNotEmpty() @MaxLength(64) templateId!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(64) siteId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) executionOrder?: number;
}

export class UpdateStrategyGroupDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(64) templateId?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsIn(['DRAFT', 'RUNNING', 'PAUSED', 'ERROR']) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) executionOrder?: number;
}

export class CreateStrategyGroupBindingDto {
  @IsString() @IsNotEmpty() @MaxLength(64) siteId!: string;
  @IsString() @IsNotEmpty() @MaxLength(64) pollingGroupCode!: string;
}

export class CreateStrategyDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(64) groupId?: string;
  @IsOptional() @IsString() @MaxLength(64) siteId?: string;
  @IsObject() condition!: Record<string, unknown>;
  @IsObject() scope!: Record<string, unknown>;
  @IsObject() action!: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(100) schedule?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) priority?: number;
  @IsOptional() @IsISO8601({ strict: true }) effectiveFrom?: string;
  @IsOptional() @IsISO8601({ strict: true }) effectiveTo?: string;
}

export class UpdateStrategyDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsIn(['DRAFT', 'RUNNING', 'PAUSED', 'ERROR']) status?: string;
  @IsOptional() @IsObject() condition?: Record<string, unknown>;
  @IsOptional() @IsObject() scope?: Record<string, unknown>;
  @IsOptional() @IsObject() action?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(100) schedule?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) priority?: number;
  @IsOptional() @IsISO8601({ strict: true }) effectiveFrom?: string;
  @IsOptional() @IsISO8601({ strict: true }) effectiveTo?: string;
}

export class AutomationPauseDto {
  @IsBoolean() paused!: boolean;
}
