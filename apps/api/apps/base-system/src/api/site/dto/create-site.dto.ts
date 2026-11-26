import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  ValidateIf,
  IsString,
  IsUrl,
  Max,
  Min,
  IsNotEmpty,
  MaxLength,
  Matches,
  IsTimeZone,
} from 'class-validator';

export class CreateSiteDto {
  @ApiProperty({ example: '测试站点' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'http://cs.cqgslxs.com' })
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
    disallow_auth: true,
  })
  @MaxLength(2048)
  baseUrl!: string;

  @ApiProperty({ required: false, example: 'epay_' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(/^[a-zA-Z0-9_]*$/)
  @MaxLength(64)
  tablePrefix?: string;

  @ApiProperty({ required: false, default: 'Asia/Shanghai' })
  @ValidateIf((_, value) => value !== undefined)
  @IsTimeZone()
  timezone?: string;

  @ApiProperty({ example: '141.98.199.44' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @MaxLength(255)
  dbHost!: string;

  @ApiProperty({ required: false, default: 3306 })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  dbPort?: number;

  @ApiProperty({ example: 'cs' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @MaxLength(64)
  dbName!: string;

  @ApiProperty({ example: 'cs' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @MaxLength(64)
  dbUser!: string;

  @ApiProperty({
    description: '数据库密码，仅写入；保存后不回显',
    writeOnly: true,
  })
  @Transform(({ obj, key }) => obj[key])
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  dbPassword!: string;
}
