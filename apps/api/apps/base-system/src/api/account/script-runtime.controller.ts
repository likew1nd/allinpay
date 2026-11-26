import { Body, Controller, Get, Headers, Header, HttpCode, Param, Post, Query, StreamableFile, BadRequestException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@lib/infra/decorators/public.decorator';
import { ApiRes } from '@lib/infra/rest/res.response';
import { AccountService } from './account.service';
import { AgentRuntimeService } from './agent-runtime.service';
import { ScriptBundleService } from './script-bundle.service';
import { ScriptMonitorHeartbeatDto } from './dto/script-runtime.dto';
import { AgentCommandReceiptDto, AgentConfigurationQueryDto, AgentLogsDto, AgentSessionDto, AgentSessionRefDto, AgentTaskClaimDto, AgentTaskResultDto, EnvironmentPageDto } from './dto/agent-runtime.dto';

@ApiTags('Agent 运行时')
@Public()
@Controller('collectors/:id')
export class ScriptRuntimeController {
  constructor(private readonly accounts: AccountService, private readonly runtime: AgentRuntimeService, private readonly bundle: ScriptBundleService) {}
  @Post('agent-session') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async openSession(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined, @Body() dto: AgentSessionDto) {
    await this.accounts.authenticateCollector(id, token);
    return ApiRes.success(await this.runtime.openSession(id, dto.scriptVersion));
  }

  @Get('agent-configuration') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async configuration(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined, @Query() dto: AgentConfigurationQueryDto) {
    await this.accounts.authenticateCollector(id, token);
    return ApiRes.success(await this.runtime.configuration(id, dto.sessionId));
  }

  @Post('environment-sync/start') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async inventoryStart(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined, @Body() dto: AgentSessionRefDto) {
    await this.accounts.authenticateCollector(id, token);
    return ApiRes.success(await this.runtime.startInventory(id, dto.sessionId));
  }

  @Post('environment-sync/page') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async inventoryPage(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined, @Body() dto: EnvironmentPageDto) {
    await this.accounts.authenticateCollector(id, token);
    return ApiRes.success(await this.runtime.inventoryPage(id, dto));
  }

  @Post('agent-commands/:commandId/receipt') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async receipt(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined, @Param('commandId') commandId: string, @Body() dto: AgentCommandReceiptDto) {
    await this.accounts.authenticateCollector(id, token);
    return ApiRes.success(await this.runtime.receipt(id, commandId, dto));
  }

  @Post('script-tasks/claim') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async claim(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined, @Body() dto: AgentTaskClaimDto) {
    await this.accounts.authenticateCollector(id, token);
    return ApiRes.success(await this.runtime.claimTasks(id, dto.sessionId, dto.capacity));
  }

  @Post('script-task-result') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async result(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined, @Body() dto: AgentTaskResultDto) {
    await this.accounts.authenticateCollector(id, token);
    return ApiRes.success(await this.runtime.completeTask(id, dto));
  }

  @Post('script-logs') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async logs(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined, @Body() dto: AgentLogsDto) {
    await this.accounts.authenticateCollector(id, token);
    return ApiRes.success(await this.runtime.logs(id, dto));
  }

  @Post('script-tasks/:taskId/active') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async active(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined, @Param('taskId') taskId: string, @Body() dto: AgentSessionRefDto) {
    await this.accounts.authenticateCollector(id, token);
    return ApiRes.success(await this.runtime.active(id, dto.sessionId, taskId));
  }

  @Post('script-tasks/:taskId/login') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async login(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined, @Param('taskId') taskId: string, @Body() dto: AgentSessionRefDto) {
    await this.accounts.authenticateCollector(id, token);
    return ApiRes.success(await this.runtime.login(id, dto.sessionId, taskId));
  }

  @Post('script-tasks/:taskId/login-failed') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async loginFailed(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined, @Param('taskId') taskId: string, @Body() dto: AgentSessionRefDto) {
    await this.accounts.authenticateCollector(id, token);
    return ApiRes.success(await this.runtime.loginFailed(id, dto.sessionId, taskId));
  }

  @Post('script-tasks/:taskId/login-rejected') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async rejected(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined, @Param('taskId') taskId: string, @Body() dto: AgentSessionRefDto) {
    await this.accounts.authenticateCollector(id, token);
    return ApiRes.success(await this.runtime.loginRejected(id, dto.sessionId, taskId));
  }

  @Get('script-settings/runtime') @Header('Cache-Control', 'no-store')
  async getScriptSettings(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined) {
    return ApiRes.success(await this.accounts.getScriptRuntimeSettings(id, token));
  }
  @Get('script-accounts/runtime') @Header('Cache-Control', 'no-store')
  async getScriptAccounts(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined) {
    return ApiRes.success(await this.accounts.getScriptRuntimeAccounts(id, token));
  }
  @Post('script-heartbeat') @HttpCode(200)
  async scriptHeartbeat(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined, @Body() dto: ScriptMonitorHeartbeatDto) {
    await this.accounts.authenticateCollector(id, token);
    if (dto.collectorId !== id) throw new BadRequestException('心跳采集端与请求路径不一致');
    if (!dto.sessionId) return ApiRes.success(await this.accounts.receiveScriptHeartbeat(id, token, dto));
    if (!process.env.DEPLOY_STATE) return ApiRes.success(await this.runtime.heartbeat(id, dto));
    const { version, bundleHash } = await this.bundle.getVersion();
    return ApiRes.success(await this.runtime.heartbeat(id, dto, bundleHash ? version : undefined));
  }
  @Get('script-version') @Header('Cache-Control', 'no-store')
  async getScriptVersion(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined) {
    await this.accounts.authenticateCollector(id, token);
    return ApiRes.success(await this.bundle.getVersion());
  }
  @Get('script-bundle') @Header('Cache-Control', 'no-store')
  async getScriptBundle(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined,
    @Query('version') expectedVersion?: string, @Query('hash') expectedHash?: string) {
    await this.accounts.authenticateCollector(id, token);
    const { buffer, version } = await this.bundle.getBundle(expectedVersion, expectedHash);
    return new StreamableFile(buffer, { type: 'application/zip', disposition: `attachment; filename="agent-script-${version}.zip"`, length: buffer.length });
  }
}