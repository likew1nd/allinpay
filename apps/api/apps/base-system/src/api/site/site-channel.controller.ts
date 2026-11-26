import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthZGuard, UsePermissions } from '@lib/infra/casbin';
import {
  Log,
  setOperationLogContext,
} from '@lib/infra/decorators/log.decorator';
import { LogInterceptor } from '@lib/infra/interceptors/log.interceptor';
import { ApiRes } from '@lib/infra/rest/res.response';
import {
  ChannelConfigDto,
  ChannelStatusDto,
  DeleteChannelDto,
  UpdateChannelDto,
} from './dto/channel.dto';
import { SiteChannelService } from './site-channel.service';
import { ChannelAdvancedDto } from './dto/channel-advanced.dto';

function loggedChannelResult(request: any, result: any, description: string) {
  const { audit, ...data } = result;
  if (audit)
    setOperationLogContext(request, {
      description,
      objectId: result.code,
      objectName: audit.objectName,
      body: { audit },
    });
  return ApiRes.success(data);
}

@Controller('sites/:siteId/channels')
@UseGuards(AuthZGuard)
export class SiteChannelController {
  constructor(private readonly channels: SiteChannelService) {}

  @Get(':code')
  @UsePermissions({ resource: 'site', action: 'read' })
  @Header('Cache-Control', 'no-store')
  async detail(@Param('siteId') siteId: string, @Param('code') code: string) {
    return ApiRes.success(await this.channels.detail(siteId, code));
  }

  @Get(':code/configuration')
  @UsePermissions({ resource: 'site', action: 'update' })
  @Header('Cache-Control', 'no-store')
  async configuration(
    @Param('siteId') siteId: string,
    @Param('code') code: string,
  ) {
    return ApiRes.success(await this.channels.detail(siteId, code, true));
  }

  @Get(':code/advanced')
  @UsePermissions({ resource: 'site', action: 'update' })
  @Header('Cache-Control', 'no-store')
  async advancedDetail(
    @Param('siteId') siteId: string,
    @Param('code') code: string,
  ) {
    return ApiRes.success(await this.channels.detail(siteId, code, 'advanced'));
  }

  @Patch(':code/advanced')
  @UsePermissions({ resource: 'site', action: 'update' })
  @UseInterceptors(LogInterceptor)
  @Log('通道管理', '修改原站点通道高级设置', {
    logResponse: true,
  })
  async advanced(
    @Param('siteId') siteId: string,
    @Param('code') code: string,
    @Body() dto: ChannelAdvancedDto,
    @Request() request: any,
  ) {
    return loggedChannelResult(
      request,
      await this.channels.advanced(siteId, code, dto),
      '修改通道高级设置',
    );
  }

  @Patch(':code')
  @UsePermissions({ resource: 'site', action: 'update' })
  @UseInterceptors(LogInterceptor)
  @Log('通道管理', '编辑原站点通道', { logResponse: true })
  async update(
    @Param('siteId') siteId: string,
    @Param('code') code: string,
    @Body() dto: UpdateChannelDto,
    @Request() request: any,
  ) {
    return loggedChannelResult(
      request,
      await this.channels.update(siteId, code, dto),
      '修改通道设置',
    );
  }

  @Patch(':code/status')
  @UsePermissions({ resource: 'site', action: 'update' })
  @UseInterceptors(LogInterceptor)
  @Log('通道管理', '切换原站点通道状态', { logResponse: true })
  async status(
    @Param('siteId') siteId: string,
    @Param('code') code: string,
    @Body() dto: ChannelStatusDto,
    @Request() request: any,
  ) {
    return loggedChannelResult(
      request,
      await this.channels.status(siteId, code, dto),
      dto.status === 1 ? '启用站点通道' : '停用站点通道',
    );
  }

  @Patch(':code/configuration')
  @UsePermissions({ resource: 'site', action: 'update' })
  @UseInterceptors(LogInterceptor)
  @Log('通道管理', '修改通道密钥配置', { logBody: false, logResponse: false })
  @Header('Cache-Control', 'no-store')
  async configure(
    @Param('siteId') siteId: string,
    @Param('code') code: string,
    @Body() dto: ChannelConfigDto,
    @Request() request: any,
  ) {
    return loggedChannelResult(
      request,
      await this.channels.configure(siteId, code, dto),
      '修改通道密钥配置',
    );
  }

  @Delete(':code')
  @UsePermissions({ resource: 'site', action: 'delete' })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(LogInterceptor)
  @Log('通道管理', '验证密码并删除原站点通道', {
    logBody: false,
    logResponse: true,
  })
  async remove(
    @Param('siteId') siteId: string,
    @Param('code') code: string,
    @Body() dto: DeleteChannelDto,
    @Request() request: any,
  ) {
    return loggedChannelResult(
      request,
      await this.channels.remove(siteId, code, dto, request.user),
      '删除站点通道',
    );
  }
}
