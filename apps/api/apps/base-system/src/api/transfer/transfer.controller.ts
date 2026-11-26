import {
  Body,
  Controller,
  Delete,
  Get,
  Headers, Header,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthZGuard, UsePermissions } from '@lib/infra/casbin';
import { Public } from '@lib/infra/decorators/public.decorator';
import { ApiRes } from '@lib/infra/rest/res.response';

import {
  SetEnvironmentTransferDto, PayeeLimitsDto, ClaimTransferDto,
  CollectorTransferResultDto, CreateTransferTestDto, TransferProgressDto, TransferScreenshotDto, TransferQrDto,
  CreatePayeeDto,
  CreateTransferRuleDto, CreateTransferDraftDto,
  PageTransferDto,
  ResolveTransferDto,
  UpdatePayeeStatusDto,
  UpdateTransferRuleDto,
  UpdateTransferRuleFlagsDto,
  RenameTransferTemplateDto,
} from './dto/transfer.dto';
import { PageAccountDto } from '../account/dto/account.dto';
import { DeleteConfirmDto } from '../delete-check';
import { PayeeService } from './payee.service';
import { TransferRuleService } from './transfer-rule.service';
import { TransferService } from './transfer.service';

// 涉及资金的操作必须有真实的登录用户，取不到就拒绝，不能退化成共用的 system 账号
function actorOf(request: any): string {
  const uid = request?.user?.uid;
  if (typeof uid !== 'string' || !uid)
    throw new UnauthorizedException('登录状态无效');
  return uid;
}

// 开关使用规则编辑权限；异常结果核实保留独立权限。
@ApiTags('转账')
@UseGuards(AuthZGuard)
@Controller()
export class TransferController {
  constructor(
    private readonly payees: PayeeService,
    private readonly rules: TransferRuleService,
    private readonly transfers: TransferService,
  ) {}

  @Get('automatic-transfers')
  @UsePermissions({ resource: 'transfer-request', action: 'read' })
  async environments(@Query() query: PageAccountDto) {
    return ApiRes.success(await this.transfers.environments(query));
  }

  @Patch('accounts/:id/automatic-transfer')
  @UsePermissions({ resource: 'transfer-rule', action: 'update' })
  async setEnvironment(@Param('id') id: string, @Body() dto: SetEnvironmentTransferDto) {
    return ApiRes.success(await this.transfers.setEnvironment(id, dto));
  }

  @Patch('payees/:id/limits')
  @UsePermissions({ resource: 'payee', action: 'update' })
  async payeeLimits(@Param('id') id: string, @Body() dto: PayeeLimitsDto) { return ApiRes.success(await this.payees.updateLimits(id, dto)); }
  @Get('payees')
  @UsePermissions({ resource: 'payee', action: 'read' })
  @ApiOperation({ summary: '分页查询收款人（收款账号已脱敏）' })
  async pagePayees(@Query() query: PageTransferDto) {
    return ApiRes.success(await this.payees.page(query));
  }

  @Post('payees')
  @UsePermissions({ resource: 'payee', action: 'create' })
  @ApiOperation({ summary: '新增收款人（收款账号加密存放）' })
  async createPayee(@Body() dto: CreatePayeeDto, @Request() request: any) {
    return ApiRes.success(await this.payees.create(dto, actorOf(request)));
  }

  @Patch('payees/:id/status')
  @UsePermissions({ resource: 'payee', action: 'update' })
  @ApiOperation({ summary: '启用或停用收款人，停用会作废未发出的转账单' })
  async setPayeeStatus(@Param('id') id: string, @Body() dto: UpdatePayeeStatusDto) {
    return ApiRes.success(await this.payees.setStatus(id, dto.status));
  }

  @Get('payees/:id/delete-check')
  @UsePermissions({ resource: 'payee', action: 'delete' })
  @ApiOperation({ summary: '删除收款账号前检查：被哪些转账策略使用、是否有正在执行的转账' })
  async payeeDeleteCheck(@Param('id') id: string) {
    return ApiRes.success(await this.payees.deleteCheck(id));
  }

  @Delete('payees/:id')
  @UsePermissions({ resource: 'payee', action: 'delete' })
  @ApiOperation({ summary: '删除收款账号（软删除，历史转账记录保留）；需 confirm=删除，有占用时拒绝' })
  async deletePayee(@Param('id') id: string, @Body() _dto: DeleteConfirmDto) {
    return ApiRes.success(await this.payees.delete(id));
  }

  @Get('transfer-rules/:id/delete-check')
  @UsePermissions({ resource: 'transfer-rule', action: 'delete' })
  @ApiOperation({ summary: '删除转账策略前检查：被哪些环境绑定、是否有正在执行的转账' })
  async ruleDeleteCheck(@Param('id') id: string) {
    return ApiRes.success(await this.rules.deleteCheck(id));
  }

  @Delete('transfer-rules/:id')
  @UsePermissions({ resource: 'transfer-rule', action: 'delete' })
  @ApiOperation({ summary: '删除转账策略（软删除，历史转账记录保留）；需 confirm=删除，有占用时拒绝' })
  async deleteRule(@Param('id') id: string, @Body() _dto: DeleteConfirmDto, @Request() request: any) {
    return ApiRes.success(await this.rules.delete(id, actorOf(request)));
  }

  @Get('transfer-rules')
  @UsePermissions({ resource: 'transfer-rule', action: 'read' })
  @ApiOperation({ summary: '分页查询转账规则' })
  async pageRules(@Query() query: PageTransferDto) {
    return ApiRes.success(await this.rules.page(query));
  }

  @Post('transfer-rules/drafts')
  @UsePermissions({ resource: 'transfer-rule', action: 'create' })
  @ApiOperation({ summary: '先填写名称和说明，创建停用的转账策略草稿' })
  async createRuleDraft(@Body() dto: CreateTransferDraftDto, @Request() request: any) {
    return ApiRes.success(await this.rules.createDraft(dto, actorOf(request)));
  }

  @Post('transfer-rules')
  @UsePermissions({ resource: 'transfer-rule', action: 'create' })
  @ApiOperation({ summary: '创建转账策略（环境开启且达到条件后自动执行）' })
  async createRule(@Body() dto: CreateTransferRuleDto, @Request() request: any) {
    return ApiRes.success(await this.rules.create(dto, actorOf(request)));
  }

  @Patch('transfer-rules/:id')
  @UsePermissions({ resource: 'transfer-rule', action: 'update' })
  @ApiOperation({ summary: '修改策略从下次触发生效，停用则撤销未领取任务' })
  async updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateTransferRuleDto,
    @Request() request: any,
  ) {
    return ApiRes.success(await this.rules.update(id, dto, actorOf(request)));
  }

  @Patch('transfer-rules/:id/template-name')
  @UsePermissions({ resource: 'transfer-rule', action: 'update' })
  @ApiOperation({ summary: '修改转账模板名称' })
  async renameTemplate(@Param('id') id: string, @Body() dto: RenameTransferTemplateDto, @Request() request: any) {
    return ApiRes.success(await this.rules.renameTemplate(id, dto.name, actorOf(request)));
  }

  @Patch('transfer-rules/:id/flags')
  @UsePermissions({ resource: 'transfer-rule', action: 'update' })
  @ApiOperation({ summary: '只切换转账策略的启用状态；停用会撤销未领取的转账单' })
  async setRuleFlags(@Param('id') id: string, @Body() dto: UpdateTransferRuleFlagsDto, @Request() request: any) {
    return ApiRes.success(await this.rules.setFlags(id, dto, actorOf(request)));
  }

  @Get('transfer-requests')
  @UsePermissions({ resource: 'transfer-request', action: 'read' })
  @ApiOperation({ summary: '分页查询转账单' })
  async pageRequests(@Query() query: PageTransferDto) {
    return ApiRes.success(await this.transfers.pageRequests(query));
  }

  @Get('transfer-requests/:id/progress-logs')
  @UsePermissions({ resource: 'transfer-request', action: 'read' })
  @ApiOperation({ summary: '查看转账脚本的执行日志（步骤、心跳和事件）' })
  async progressLogs(@Param('id') id: string) {
    return ApiRes.success(await this.transfers.progressLogs(id));
  }

  @Get('transfer-requests/:id/screenshot')
  @UsePermissions({ resource: 'transfer-request', action: 'read' })
  @ApiOperation({ summary: '读取转账终态截图（JPEG data URL）；列表接口不带图片，按需单独读取' })
  async screenshot(@Param('id') id: string) {
    return ApiRes.success(await this.transfers.getScreenshot(id));
  }

  @Post('transfer-requests/:id/cancel')
  @UsePermissions({ resource: 'transfer-request', action: 'cancel' })
  @ApiOperation({ summary: '取消还没交给采集端的转账单' })
  async cancel(@Param('id') id: string, @Request() request: any) {
    return ApiRes.success(await this.transfers.cancel(id, actorOf(request)));
  }

  @Post('transfer-requests/:id/force-stop')
  @UsePermissions({ resource: 'transfer-request', action: 'resolve' })
  @ApiOperation({ summary: '强制结束执行中的转账单：未点“下一步”判失败并释放环境，已点则转结果未知' })
  async forceStop(@Param('id') id: string, @Request() request: any) {
    return ApiRes.success(await this.transfers.forceStop(id, actorOf(request)));
  }

  @Post('transfer-requests/:id/resolve')
  @UsePermissions({ resource: 'transfer-request', action: 'resolve' })
  @ApiOperation({ summary: '人工核对后，把待人工处理或结果未知的转账单标记成成功或失败' })
  async resolve(
    @Param('id') id: string,
    @Body() dto: ResolveTransferDto,
    @Request() request: any,
  ) {
    return ApiRes.success(await this.transfers.resolve(id, dto, actorOf(request)));
  }

  @Post('collectors/:id/transfers/claim')
  @Header('Cache-Control', 'no-store')
  @Public()
  @ApiOperation({ deprecated: true, summary: '旧采集端须升级后才能领取转账单' })
  async legacyClaim(
    @Param('id') id: string,
    @Headers('x-collector-token') token: string | undefined,
    @Body() dto: ClaimTransferDto,
  ) {
    return ApiRes.success(await this.transfers.claim(id, token, dto.sessionId, false));
  }

  @Post('collectors/:id/transfers/claim-for-submit')
  @Public()
  @Header('Cache-Control', 'no-store')
  async claim(@Param('id') id: string, @Headers('x-collector-token') token: string | undefined, @Body() dto: ClaimTransferDto) {
    return ApiRes.success(await this.transfers.claim(id, token, dto.sessionId, true));
  }

  @Post('collectors/:id/transfers/:transferId/authorize-submission')
  @Public()
  @Header('Cache-Control', 'no-store')
  async authorizeSubmission(@Param('id') id: string, @Param('transferId') transferId: string,
    @Headers('x-collector-token') token: string | undefined, @Body() dto: ClaimTransferDto) {
    return ApiRes.success(await this.transfers.authorizeSubmission(id, token, transferId, dto.sessionId));
  }

  @Post('accounts/:id/transfer-test')
  @UsePermissions({ resource: 'transfer-request', action: 'test' })
  @ApiOperation({ summary: '手动转账测试：自带收款信息，真实付款，仅超级管理员' })
  async createTest(@Param('id') id: string, @Body() dto: CreateTransferTestDto, @Request() request: any) {
    const row = await this.transfers.createTest(id, dto, actorOf(request));
    return ApiRes.success({ id: row.id, outBizNo: row.outBizNo, status: row.status });
  }

  @Post('collectors/:id/transfers/:transferId/login')
  @Public()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '采集端转账时需要登录：按转账单下发登录凭据' })
  async login(
    @Param('id') id: string,
    @Param('transferId') transferId: string,
    @Headers('x-collector-token') token: string | undefined,
    @Body() dto: ClaimTransferDto,
  ) {
    return ApiRes.success(await this.transfers.loginCredentials(id, token, transferId, dto.sessionId));
  }

  @Post('collectors/:id/transfers/:transferId/login-rejected')
  @Public()
  @ApiOperation({ summary: '采集端转账登录时页面提示账号或密码错误' })
  async loginRejected(
    @Param('id') id: string,
    @Param('transferId') transferId: string,
    @Headers('x-collector-token') token: string | undefined,
    @Body() dto: ClaimTransferDto,
  ) {
    return ApiRes.success(await this.transfers.loginRejected(id, token, transferId, dto.sessionId));
  }

  @Post('collectors/:id/transfers/:transferId/progress')
  @Public()
  @ApiOperation({ summary: '采集端上报转账执行进度（3 秒心跳）' })
  async progress(
    @Param('id') id: string,
    @Param('transferId') transferId: string,
    @Headers('x-collector-token') token: string | undefined,
    @Body() dto: TransferProgressDto,
  ) {
    return ApiRes.success(await this.transfers.progress(id, token, transferId, dto));
  }

  @Post('collectors/:id/transfers/:transferId/screenshot')
  @Public()
  @ApiOperation({ summary: '采集端上报转账终态截图（单独接口，不进结果回报）' })
  async uploadScreenshot(
    @Param('id') id: string,
    @Param('transferId') transferId: string,
    @Headers('x-collector-token') token: string | undefined,
    @Body() dto: TransferScreenshotDto,
  ) {
    return ApiRes.success(await this.transfers.saveScreenshot(id, token, transferId, dto));
  }

  @Post('collectors/:id/transfers/:transferId/qr')
  @Public()
  @ApiOperation({ summary: '采集端上报扫码确认二维码，中心发送到业务范围内的 TG 群' })
  async uploadQr(
    @Param('id') id: string,
    @Param('transferId') transferId: string,
    @Headers('x-collector-token') token: string | undefined,
    @Body() dto: TransferQrDto,
  ) {
    return ApiRes.success(await this.transfers.saveQr(id, token, transferId, dto));
  }

  @Post('collectors/:id/transfers/:transferId/result')
  @Public()
  @ApiOperation({ summary: '采集端回报转账结果：成功、失败、待人工处理或结果未知' })
  async report(
    @Param('id') id: string,
    @Param('transferId') transferId: string,
    @Headers('x-collector-token') token: string | undefined,
    @Body() dto: CollectorTransferResultDto,
  ) {
    return ApiRes.success(await this.transfers.report(id, token, transferId, dto));
  }
}
