import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthZGuard, UsePermissions } from '@lib/infra/casbin';
import { ApiRes } from '@lib/infra/rest/res.response';

import { ConfirmBindingDto, SetMfaEnabledDto } from './dto/mfa.dto';
import { MfaService } from './mfa.service';

// 取不到登录用户时直接拒绝，不能退化成共用的 system 账号
function currentUser(request: any) {
  const uid = request.user?.uid;
  if (typeof uid !== 'string' || !uid)
    throw new UnauthorizedException('登录状态无效');
  const username = request.user?.username;
  return {
    uid,
    label: typeof username === 'string' && username ? username : uid,
  };
}

@ApiTags('系统设置')
@UseGuards(AuthZGuard)
@Controller('mfa')
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @Get()
  @UsePermissions({ resource: 'system-setting', action: 'read' })
  @ApiOperation({ summary: '查询 MFA 开关和当前用户的验证器绑定状态' })
  async status(@Request() request: any) {
    return ApiRes.success(await this.mfa.status(currentUser(request).uid));
  }

  @Post('bind')
  @UsePermissions({ resource: 'system-setting', action: 'update' })
  @ApiOperation({ summary: '生成当前用户的验证器密钥（明文只返回这一次）' })
  async bind(@Request() request: any) {
    const user = currentUser(request);
    return ApiRes.success(await this.mfa.beginBinding(user.uid, user.label));
  }

  @Post('bind/confirm')
  @UsePermissions({ resource: 'system-setting', action: 'update' })
  @ApiOperation({ summary: '用验证码确认绑定' })
  async confirm(@Body() dto: ConfirmBindingDto, @Request() request: any) {
    return ApiRes.success(
      await this.mfa.confirmBinding(currentUser(request).uid, dto.code),
    );
  }

  @Patch('enabled')
  @UsePermissions({ resource: 'system-setting', action: 'update' })
  @ApiOperation({ summary: '开启或关闭 MFA（两个方向都需要验证码）' })
  async setEnabled(@Body() dto: SetMfaEnabledDto, @Request() request: any) {
    return ApiRes.success(
      await this.mfa.setEnabled(currentUser(request).uid, dto.enabled, dto.code),
    );
  }
}
