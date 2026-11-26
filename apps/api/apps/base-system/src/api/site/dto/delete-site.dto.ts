import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeleteSiteDto {
  @Transform(({ obj, key }) => obj[key])
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password!: string;
}
