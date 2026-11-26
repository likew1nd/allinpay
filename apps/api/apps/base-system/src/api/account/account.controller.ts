import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthZGuard, UsePermissions } from '@lib/infra/casbin';
import { Public } from '@lib/infra/decorators/public.decorator';
import { Log } from '@lib/infra/decorators/log.decorator';
import { ApiRes } from '@lib/infra/rest/res.response';

import { AccountService } from './account.service';
import { ScriptBundleService } from './script-bundle.service';
import {
  CollectorHeartbeatDto,
  CreateFundAccountDto,
  UpdateFundAccountDto,
  CreateBindingDto,
  CreateCollectorDto,
  UpdateCollectorDto,
  UpdateAccountCredentialsDto,
  PageAccountDto,
  PageCollectorDto,
  PageFundAccountDto,
  CreateSettlementDto,
  PageSettlementDto,
  UpdateBindingDto,
  UpdateScriptSettingsDto,
  UpdateMonitoringDto,
  UpdateAccountModeDto,
  BatchUpdateMonitoringDto,
  BatchRefreshAppIdsDto,
  NotifyScriptUpdateDto,
} from './dto/account.dto';

@ApiTags('账号采集')
@UseGuards(AuthZGuard)
@Controller()
export class AccountController {
  constructor(
    private readonly accounts: AccountService,
    private readonly bundle: ScriptBundleService,
  ) {}

  @Get('script-settings')
  @UsePermissions({ resource: 'collector', action: 'read' })
  async getScriptSettings() {
    return ApiRes.success(await this.accounts.getScriptSettings());
  }

  @Patch('script-settings')
  @UsePermissions({ resource: 'collector', action: 'update' })
  async updateScriptSettings(@Body() dto: UpdateScriptSettingsDto, @Request() request: any) {
    return ApiRes.success(await this.accounts.updateScriptSettings(dto, request.user?.uid ?? 'system'));
  }

  /** 管理端查询当前发布的脚本包版本 */
  @Get('script-bundle/version') @Header('Cache-Control', 'no-store')
  @UsePermissions({ resource: 'collector', action: 'read' })
  @ApiOperation({ summary: '查询当前发布的 Agent 脚本版本' })
  async getScriptBundleVersion() {
    return ApiRes.success(await this.bundle.getVersion());
  }

  /** 按指定范围下发更新命令，离线 Agent 上线后领取。 */
  @Post('script-bundle/notify-update')
  @UsePermissions({ resource: 'collector', action: 'update' })
  @ApiOperation({ summary: '通知指定采集端或显式通知全部采集端更新脚本' })
  async notifyScriptUpdate(@Body() dto: NotifyScriptUpdateDto) {
    const { version } = await this.bundle.getVersion();
    const notified = await this.accounts.notifyScriptUpdate(version, dto);
    return ApiRes.success({ notified });
  }

  @Get('collectors/statistics')
  @UsePermissions({ resource: 'collector', action: 'read' })
  async getCollectorStatistics(@Query('collectorId') collectorId?: string) {
    if (collectorId !== undefined && (typeof collectorId !== 'string' || !collectorId.trim())) {
      throw new BadRequestException('采集端编号无效');
    }
    return ApiRes.success(await this.accounts.getCollectorStatistics(collectorId));
  }

  @Get('collectors')
  @UsePermissions({ resource: 'collector', action: 'read' })
  async pageCollectors(@Query() query: PageCollectorDto) {
    return ApiRes.success(await this.accounts.pageCollectors(query));
  }

  @Get('fund-accounts')
  @UsePermissions({ resource: 'fund-account', action: 'read' })
  async pageFundAccounts(@Query() query: PageFundAccountDto) {
    return ApiRes.success(await this.accounts.pageFundAccounts(query));
  }

  @Post('fund-accounts')
  @UsePermissions({ resource: 'fund-account', action: 'create' })
  async createFundAccount(@Body() dto: CreateFundAccountDto) {
    return ApiRes.success(await this.accounts.createFundAccount(dto));
  }

  @Patch('fund-accounts/:id')
  @UsePermissions({ resource: 'fund-account', action: 'update' })
  async updateFundAccount(
    @Param('id') id: string,
    @Body() dto: UpdateFundAccountDto,
  ) {
    return ApiRes.success(await this.accounts.updateFundAccount(id, dto));
  }

  @Get('settlements')
  @UsePermissions({ resource: 'settlement', action: 'read' })
  async pageSettlements(@Query() query: PageSettlementDto) {
    return ApiRes.success(await this.accounts.pageSettlements(query));
  }

  @Post('settlements')
  @UsePermissions({ resource: 'settlement', action: 'create' })
  async createSettlement(@Body() dto: CreateSettlementDto) {
    return ApiRes.success(await this.accounts.createSettlement(dto));
  }

  @Post('collectors')
  @UsePermissions({ resource: 'collector', action: 'create' })
  async createCollector(@Body() dto: CreateCollectorDto) {
    return ApiRes.success(await this.accounts.createCollector(dto));
  }

  @Get('collectors/:id/token')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @UsePermissions({ resource: 'collector', action: 'update' })
  @Log('账号采集', '查看采集端 Token', { logBody: false, logResponse: false })
  async getCollectorToken(@Param('id') id: string) {
    return ApiRes.success(await this.accounts.getCollectorToken(id));
  }

  @Post('collectors/:id/reset-token')
  @UsePermissions({ resource: 'collector', action: 'update' })
  async resetCollectorToken(@Param('id') id: string) {
    return ApiRes.success(await this.accounts.resetCollectorToken(id));
  }

  @Get('collectors/:id')
  @UsePermissions({ resource: 'collector', action: 'read' })
  async getCollector(@Param('id') id: string) {
    return ApiRes.success(await this.accounts.getCollector(id));
  }

  @Get('collectors/:id/accounts')
  @UsePermissions({ resource: 'collector', action: 'read' })
  async collectorAccounts(@Param('id') id: string, @Query() query: PageAccountDto) {
    return ApiRes.success(await this.accounts.pageCollectorAccounts(id, query));
  }

  @Post('collectors/:collectorId/accounts/app-ids/refresh')
  @UsePermissions({ resource: 'account', action: 'update' })
  async refreshAccountAppIds(@Param('collectorId') collectorId: string, @Body() dto: BatchRefreshAppIdsDto) {
    return ApiRes.success(await this.accounts.queueAccountAppIdRefresh(collectorId, dto.ids));
  }

  @Get('collectors/:collectorId/accounts/:id/credentials')
  @UsePermissions({ resource: 'account', action: 'update' })
  async accountCredentials(@Param('collectorId') collectorId: string, @Param('id') id: string) {
    return ApiRes.success(await this.accounts.getAccountCredentials(collectorId, id));
  }

  @Patch('collectors/:collectorId/accounts/:id/credentials')
  @UsePermissions({ resource: 'account', action: 'update' })
  @ApiOperation({ summary: '编辑环境账号信息' })
  async updateAccountCredentials(
    @Param('collectorId') collectorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAccountCredentialsDto,
  ) {
    return ApiRes.success(await this.accounts.updateAccountCredentials(collectorId, id, dto));
  }

  @Get('collectors/:collectorId/accounts/:id/monitoring-logs')
  @UsePermissions({ resource: 'collector', action: 'read' })
  async accountMonitoringLogs(@Param('collectorId') collectorId: string, @Param('id') id: string) {
    return ApiRes.success(await this.accounts.getAccountMonitoringLogs(collectorId, id));
  }

  @Get('collectors/:collectorId/accounts/:id/evidence/:kind')
  @UsePermissions({ resource: 'collector', action: 'read' })
  @ApiOperation({ summary: '查看环境账号的限制或司法截图' })
  async accountEvidence(@Param('collectorId') collectorId: string, @Param('id') id: string, @Param('kind') kind: string) {
    if (kind !== 'restriction' && kind !== 'judicial') throw new BadRequestException('截图类型无效');
    return ApiRes.success(await this.accounts.getAccountEvidence(collectorId, id, kind));
  }
  @Patch('collectors/:id')
  @UsePermissions({ resource: 'collector', action: 'update' })
  async updateCollector(@Param('id') id: string, @Body() dto: UpdateCollectorDto) {
    return ApiRes.success(await this.accounts.updateCollector(id, dto));
  }

  @Post('collectors/:id/sync')
  @UsePermissions({ resource: 'collector', action: 'update' })
  async syncCollector(@Param('id') id: string) {
    return ApiRes.success(await this.accounts.syncCollector(id));
  }

  @Patch('collectors/:id/monitoring')
  @UsePermissions({ resource: 'collector', action: 'update' })
  async updateCollectorMonitoring(@Param('id') id: string, @Body() dto: UpdateMonitoringDto) {
    return ApiRes.success(await this.accounts.updateCollectorMonitoring(id, dto.monitoringEnabled));
  }

  @Delete('collectors/:id')
  @UsePermissions({ resource: 'collector', action: 'delete' })
  async removeCollector(@Param('id') id: string) {
    return ApiRes.success(await this.accounts.removeCollector(id));
  }

  @Post('collectors/:id/heartbeat')
  @Public()
  @ApiOperation({ summary: '采集端上报账号和浏览器状态' })
  async heartbeat(
    @Param('id') id: string,
    @Headers('x-collector-token') token: string | undefined,
    @Body() dto: CollectorHeartbeatDto,
  ) {
    return ApiRes.success(await this.accounts.receiveHeartbeat(id, token, dto));
  }

  @Get('accounts/statistics')
  @UsePermissions({ resource: 'account', action: 'read' })
  async getAccountStatistics() {
    return ApiRes.success(await this.accounts.getCollectorStatistics());
  }

  @Get('accounts')
  @UsePermissions({ resource: 'account', action: 'read' })
  async pageAccounts(@Query() query: PageAccountDto) {
    return ApiRes.success(await this.accounts.pageAccounts(query));
  }

  @Get('account-bindings')
  @UsePermissions({ resource: 'account-binding', action: 'read' })
  async pageBindings(@Query() query: PageAccountDto) {
    return ApiRes.success(await this.accounts.pageBindings(query));
  }

  @Post('account-bindings')
  @UsePermissions({ resource: 'account-binding', action: 'create' })
  async createBinding(@Body() dto: CreateBindingDto) {
    return ApiRes.success(await this.accounts.createBinding(dto));
  }

  @Patch('account-bindings/:id')
  @UsePermissions({ resource: 'account-binding', action: 'update' })
  async updateBinding(@Param('id') id: string, @Body() dto: UpdateBindingDto) {
    return ApiRes.success(await this.accounts.updateBinding(id, dto));
  }

  @Patch('accounts/:id/mode')
  @UsePermissions({ resource: 'account', action: 'update' }, { resource: 'transfer-rule', action: 'update' })
  async updateAccountMode(@Param('id') id: string, @Body() dto: UpdateAccountModeDto) {
    return ApiRes.success(await this.accounts.updateAccountMode(id, dto.mode));
  }

  @Patch('accounts/:id/monitoring')
  @UsePermissions({ resource: 'account', action: 'update' })
  async updateAccountMonitoring(@Param('id') id: string, @Body() dto: UpdateMonitoringDto) {
    return ApiRes.success(await this.accounts.updateAccountMonitoring(id, dto.monitoringEnabled));
  }

  @Post('accounts/batch-monitoring')
  @UsePermissions({ resource: 'account', action: 'update' })
  async batchUpdateMonitoring(@Body() dto: BatchUpdateMonitoringDto) {
    return ApiRes.success(await this.accounts.batchUpdateAccountMonitoring(dto.ids, dto.monitoringEnabled));
  }

  @Delete('account-bindings/:id')
  @UsePermissions({ resource: 'account-binding', action: 'delete' })
  async removeBinding(@Param('id') id: string) {
    return ApiRes.success(await this.accounts.removeBinding(id));
  }
}
