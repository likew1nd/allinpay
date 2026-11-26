import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class ConfirmBindingDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: '请输入 6 位验证码' })
  code!: string;
}

export class SetMfaEnabledDto {
  @IsBoolean() enabled!: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: '请输入 6 位验证码' })
  code?: string;
}
