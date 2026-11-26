import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { PaginationParams } from '@lib/infra/rest/pagination-params';

export class PageOperationLogsQueryDto extends PaginationParams {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString({ message: 'username must be a string' })
  @IsNotEmpty({ message: 'username cannot be empty' })
  username?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString({ message: 'moduleName must be a string' })
  @IsNotEmpty({ message: 'moduleName cannot be empty' })
  moduleName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString({ message: 'method must be a string' })
  @IsNotEmpty({ message: 'method cannot be empty' })
  method?: string;
  @ApiProperty({ required: false, enum: ['USER', 'SYSTEM'] })
  @IsOptional()
  @IsIn(['USER', 'SYSTEM'])
  source?: string;

  @ApiProperty({ required: false, description: 'Comma-separated log levels' })
  @IsOptional()
  @IsString()
  @Matches(/^(INFO|WARN|ERROR)(,(INFO|WARN|ERROR))*$/)
  levels?: string;

  @ApiProperty({ required: false, enum: ['SUCCEEDED', 'FAILED', 'PENDING', 'SKIPPED', 'EXPIRED'] })
  @IsOptional()
  @IsIn(['SUCCEEDED', 'FAILED', 'PENDING', 'SKIPPED', 'EXPIRED'])
  status?: string;

  @ApiProperty({ required: false, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  keyword?: string;

  @ApiProperty({ required: false, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiProperty({ required: false, format: 'date-time' })
  @IsOptional()
  @IsDateString()
  endAt?: string;
}
