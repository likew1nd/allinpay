import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { AuthZGuard, UsePermissions } from '@lib/infra/casbin';
import {
  Log,
  setOperationLogContext,
} from '@lib/infra/decorators/log.decorator';
import { LogInterceptor } from '@lib/infra/interceptors/log.interceptor';
import { ApiRes } from '@lib/infra/rest/res.response';

import { CreateSiteDto } from './dto/create-site.dto';
import { DeleteSiteDto } from './dto/delete-site.dto';
import { PageSitesDto } from './dto/page-sites.dto';
import { PageSiteDataDto } from './dto/site-data.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { UpdateSiteAutomationDto } from './dto/update-site-automation.dto';
import { SiteDataService } from './site-data.service';
import { SiteService } from './site.service';

@ApiTags('站点管理')
@UseGuards(AuthZGuard)
@Controller('sites')
export class SiteController {
  constructor(
    private readonly sites: SiteService,
    private readonly data: SiteDataService,
  ) {}

  @Get()
  @UsePermissions({ resource: 'site', action: 'read' })
  @ApiOperation({ summary: '分页查询站点' })
  async page(@Query() query: PageSitesDto) {
    return ApiRes.success(await this.sites.page(query));
  }

  @Get('data')
  @UsePermissions({ resource: 'site', action: 'read' })
  @ApiOperation({ summary: '分页查询站点及业务数据摘要' })
  async pageData(@Query() query: PageSitesDto) {
    const page = await this.sites.page(query, true);
    const summaries = new Map(
      (await this.data.overviews(page.records.map((site) => site.id))).map(
        (summary) => [summary.siteId, summary],
      ),
    );
    return ApiRes.success({
      ...page,
      records: page.records.map((site) => ({
        ...site,
        summary: summaries.get(site.id) ?? null,
      })),
    });
  }

  @Get('channels')
  @UsePermissions({ resource: 'site', action: 'read' })
  @ApiOperation({ summary: '分页查询跨站点通道数据' })
  async allChannels(@Query() query: PageSiteDataDto) {
    return ApiRes.success(await this.data.pageChannels(query));
  }

  @Get('orders')
  @UsePermissions({ resource: 'site', action: 'read' })
  @ApiOperation({ summary: '分页查询跨站点订单数据' })
  async allOrders(@Query() query: PageSiteDataDto) {
    return ApiRes.success(await this.data.pageOrders(query));
  }

  @Get('orders/statistics')
  @UsePermissions({ resource: 'site', action: 'read' })
  @ApiOperation({ summary: '查询跨站点订单汇总' })
  async allOrderStatistics() {
    return ApiRes.success(await this.data.allOrderStatistics());
  }

  @Get(':id')
  @UsePermissions({ resource: 'site', action: 'read' })
  @ApiOperation({ summary: '查询站点详情' })
  async findOne(@Param('id') id: string) {
    return ApiRes.success(await this.sites.findOne(id));
  }

  @Post()
  @UsePermissions({ resource: 'site', action: 'create' })
  @Log('站点管理', '新增站点')
  @ApiOperation({ summary: '新增站点' })
  async create(@Body() dto: CreateSiteDto, @Request() request: any) {
    return ApiRes.success(
      await this.sites.create(dto, request.user?.uid ?? 'system'),
    );
  }

  @Patch(':id')
  @UsePermissions({ resource: 'site', action: 'update' })
  @Log('站点管理', '修改站点设置')
  @ApiOperation({ summary: '更新站点配置' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSiteDto,
    @Request() request: any,
  ) {
    const result = await this.sites.update(
      id,
      dto,
      request.user?.uid ?? 'system',
    );
    const { audit, ...site } = result;
    setOperationLogContext(request, {
      objectId: id,
      objectName: audit.objectName,
      body: { audit },
    });
    return ApiRes.success(site);
  }

  @Patch(':id/automation')
  @UsePermissions({ resource: 'site', action: 'update' })
  @Log('站点管理', '修改站点自动调整状态')
  @ApiOperation({ summary: '暂停或恢复站点自动调整' })
  async automation(
    @Param('id') id: string,
    @Body() dto: UpdateSiteAutomationDto,
    @Request() request: any,
  ) {
    const result = await this.sites.setAutomationPaused(id, dto.paused);
    const { audit, ...site } = result;
    setOperationLogContext(request, {
      description: dto.paused ? '暂停站点自动调整' : '恢复站点自动调整',
      objectId: id,
      objectName: audit.objectName,
      body: { audit },
    });
    return ApiRes.success(site);
  }

  @Delete(':id')
  @UsePermissions({ resource: 'site', action: 'delete' })
  @UseGuards(ThrottlerGuard)
  @UseInterceptors(LogInterceptor)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Log('站点管理', '验证当前登录密码并删除站点', {
    logBody: false,
    logResponse: true,
  })
  @ApiOperation({ summary: '验证当前登录密码并删除站点及中心关联数据' })
  async remove(
    @Param('id') id: string,
    @Body() dto: DeleteSiteDto,
    @Request() request: any,
  ) {
    const result = await this.sites.remove(id, dto.password, request.user);
    const { audit, ...data } = result;
    setOperationLogContext(request, {
      objectId: id,
      objectName: audit.objectName,
      body: { audit },
    });
    return ApiRes.success(data);
  }

  @Post(':id/reconnect')
  @UsePermissions({ resource: 'site', action: 'update' })
  @ApiOperation({ summary: '重新连接并同步站点' })
  async reconnect(@Param('id') id: string) {
    return ApiRes.success(await this.sites.retryConnection(id));
  }

  @Get(':id/summary')
  @UsePermissions({ resource: 'site', action: 'read' })
  async summary(@Param('id') id: string) {
    return ApiRes.success(await this.data.summary(id));
  }

  @Get(':id/channels')
  @UsePermissions({ resource: 'site', action: 'read' })
  async channels(@Param('id') id: string, @Query() query: PageSiteDataDto) {
    return ApiRes.success(await this.data.pageChannels(query, id));
  }

  @Get(':id/polling-groups')
  @UsePermissions({ resource: 'site', action: 'read' })
  async pollingGroups(
    @Param('id') id: string,
    @Query() query: PageSiteDataDto,
  ) {
    return ApiRes.success(await this.data.page(id, 'polling-groups', query));
  }

  @Get(':id/orders')
  @UsePermissions({ resource: 'site', action: 'read' })
  async orders(@Param('id') id: string, @Query() query: PageSiteDataDto) {
    return ApiRes.success(await this.data.pageOrders(query, id));
  }

  @Get(':id/sync-history')
  @UsePermissions({ resource: 'site', action: 'read' })
  async history(@Param('id') id: string, @Query() query: PageSiteDataDto) {
    return ApiRes.success(await this.data.page(id, 'sync-history', query));
  }
}
