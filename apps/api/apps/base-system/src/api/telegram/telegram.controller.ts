import { Body, Controller, Delete, ForbiddenException, Get, Header, Param, Patch, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthZGuard, UsePermissions } from '@lib/infra/casbin';
import { Log } from '@lib/infra/decorators/log.decorator';
import { ApiRes } from '@lib/infra/rest/res.response';
import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { TelegramService } from './telegram.service';
import { TelegramRuntimeService } from './telegram-runtime.service';
import { TelegramAuthService } from './telegram-auth.service';
import { ACTIONS } from './telegram-policy';
import { page, text } from './telegram-input';

type ActorRequest = { user: { uid: string } };

@ApiTags('Telegram 设置')
@Controller('telegram')
@UseGuards(AuthZGuard)
export class TelegramController {
  constructor(private readonly telegram: TelegramService, private readonly botRuntime: TelegramRuntimeService, private readonly prisma: PrismaService, private readonly auth: TelegramAuthService) {}
  @Get('config') @UsePermissions({ resource: 'telegram', action: 'read' })
  async config() { return ApiRes.success(await this.telegram.config()); }
  @Get('notification-routes') @UsePermissions({ resource: 'telegram', action: 'read' })
  async notificationRoutes() { return ApiRes.success(await this.telegram.notificationRoutes()); }
  @Post('notification-routes/:key/test') @UsePermissions({ resource: 'telegram', action: 'test' }) @Log('Telegram', '测试发送指定通知')
  async testNotificationRoute(@Param('key') key: string) { return ApiRes.success(await this.botRuntime.testNotificationRoute(key)); }
  @Post('notification-routes/revoke-test') @UsePermissions({ resource: 'telegram', action: 'test' }) @Log('Telegram', '撤销测试发送')
  async revokeNotificationTest(@Body() body: unknown) { return ApiRes.success(await this.botRuntime.revokeNotificationTest(body)); }
  @Put('notification-routes/:key') @UsePermissions({ resource: 'telegram', action: 'update' }) @Log('Telegram', '保存通知接收群')
  async saveNotificationRoute(@Param('key') key: string, @Body() body: unknown) { return ApiRes.success(await this.telegram.saveNotificationRoute(key, body)); }
  @Get('environment-notice') @UsePermissions({ resource: 'telegram', action: 'read' })
  async environmentNotice() { return ApiRes.success(await this.telegram.environmentNoticeConfig()); }
  @Post('environment-notice/test') @UsePermissions({ resource: 'telegram', action: 'test' }) @Log('Telegram', '测试发送环境通知', { logBody: false })
  async testEnvironmentNotice(@Body() body: unknown) { return ApiRes.success(await this.botRuntime.testEnvironmentNotice(body)); }
  @Post('environment-notice/templates') @UsePermissions({ resource: 'telegram', action: 'update' }) @Log('Telegram', '保存环境通知模板')
  async saveEnvironmentTemplate(@Body() body: unknown) { return ApiRes.success(await this.telegram.editEnvironmentTemplate(body)); }
  @Delete('environment-notice/templates') @UsePermissions({ resource: 'telegram', action: 'update' }) @Log('Telegram', '删除环境通知模板')
  async deleteEnvironmentTemplate(@Body() body: unknown) { return ApiRes.success(await this.telegram.editEnvironmentTemplate(body, true)); }
  @Put('environment-notice') @UsePermissions({ resource: 'telegram', action: 'update' }) @Log('Telegram', '保存环境通知设置')
  async saveEnvironmentNotice(@Body() body: unknown) { return ApiRes.success(await this.telegram.saveEnvironmentNoticeConfig(body)); }
  @Get('channel-notice') @UsePermissions({ resource: 'telegram', action: 'read' })
  async channelNotice() { return ApiRes.success(await this.telegram.channelNoticeConfig()); }
  @Post('channel-notice/test') @UsePermissions({ resource: 'telegram', action: 'test' })
  @Log('Telegram', '测试发送通道状态通知', { logBody: false })
  async testChannelNotice(@Body() body: unknown) { return ApiRes.success(await this.botRuntime.testChannelNotice(body)); }
  @Put('channel-notice') @UsePermissions({ resource: 'telegram', action: 'update' }) @Log('Telegram', '更新通道状态通知配置')
  async saveChannelNotice(@Body() body: unknown) { return ApiRes.success(await this.telegram.saveChannelNoticeConfig(body)); }
  @Post('channel-notice/templates') @UsePermissions({ resource: 'telegram', action: 'update' }) @Log('Telegram', '保存自定义通道通知模板')
  async saveChannelNoticeTemplate(@Body() body: unknown) { return ApiRes.success(await this.telegram.saveChannelNoticeTemplate(body)); }
  @Delete('channel-notice/templates') @UsePermissions({ resource: 'telegram', action: 'update' }) @Log('Telegram', '删除自定义通道通知模板')
  async deleteChannelNoticeTemplate(@Body() body: unknown) { return ApiRes.success(await this.telegram.deleteChannelNoticeTemplate(body)); }
  @Get('runtime') @UsePermissions({ resource: 'telegram', action: 'read' })
  async runtime() { return ApiRes.success(await this.telegram.config()); }
  @Patch('config') @UsePermissions({ resource: 'telegram', action: 'update' })
  @Log('Telegram', '更新 Bot 配置', { logBody: false, logResponse: false })
  async save(@Body() body: unknown) { return ApiRes.success(await this.telegram.saveConfig(body)); }
  @Post('connection-test') @UsePermissions({ resource: 'telegram', action: 'test' })
  @Log('Telegram', '检查 Bot 连接', { logBody: false, logResponse: false })
  async test() { return ApiRes.success(await this.telegram.connectionTest()); }
  @Get('targets') @UsePermissions({ resource: 'telegram', action: 'read' })
  async targets() { return ApiRes.success(await this.telegram.targets()); }
  @Patch('targets/:id') @UsePermissions({ resource: 'telegram', action: 'update' }) @Log('Telegram', '更新群配置')
  async target(@Param('id') id: string, @Body() body: unknown) { return ApiRes.success(await this.telegram.saveTarget(id, body)); }
  @Delete('targets/:id') @UsePermissions({ resource: 'telegram', action: 'delete' }) @Log('Telegram', '归档目标群')
  async deleteTarget(@Param('id') id: string) { return ApiRes.success(await this.telegram.deleteTarget(id)); }
  @Post('targets/:id/test') @UsePermissions({ resource: 'telegram', action: 'test' }) @Log('Telegram', '发送群测试消息')
  async testTarget(@Param('id') id: string) { return ApiRes.success(await this.telegram.testTarget(id)); }
  @Get('targets/:id/subscriptions') @UsePermissions({ resource: 'telegram', action: 'read' })
  async subscriptions(@Param('id') id: string) { return ApiRes.success(await this.telegram.subscriptions(id)); }
  @Put('targets/:id/subscriptions') @UsePermissions({ resource: 'telegram', action: 'update' }) @Log('Telegram', '保存群订阅')
  async saveSubscriptions(@Param('id') id: string, @Body() body: unknown) { return ApiRes.success(await this.telegram.saveSubscriptions(id, body)); }
  @Post('connect-code') @Header('Cache-Control', 'no-store') @UsePermissions({ resource: 'telegram', action: 'create' })
  @Log('Telegram', '生成群接入码', { logBody: false, logResponse: false })
  async connect(@Request() request: ActorRequest) { return ApiRes.success(await this.telegram.challenge('CONNECT', request.user.uid)); }
  @Post('me/binding-code') @Header('Cache-Control', 'no-store')
  @Log('Telegram', '生成本人绑定码', { logBody: false, logResponse: false })
  async bind(@Request() request: ActorRequest) { return ApiRes.success(await this.telegram.challenge('BIND', request.user.uid)); }
  @Get('actions') @UsePermissions({ resource: 'telegram', action: 'read' })
  actions() { return ApiRes.success(ACTIONS); }
  @Get('commands') @UsePermissions({ resource: 'telegram', action: 'read' })
  async commands() { return ApiRes.success(await this.telegram.commands()); }
  @Post('commands') @UsePermissions({ resource: 'telegram', action: 'create' }) @Log('Telegram', '新增业务命令')
  async addCommand(@Body() body: unknown) { return ApiRes.success(await this.telegram.saveCommand(undefined, body)); }
  @Patch('commands/:id') @UsePermissions({ resource: 'telegram', action: 'update' }) @Log('Telegram', '更新业务命令')
  async command(@Param('id') id: string, @Body() body: unknown) { return ApiRes.success(await this.telegram.saveCommand(id, body)); }
  @Delete('commands/:id') @UsePermissions({ resource: 'telegram', action: 'delete' }) @Log('Telegram', '删除业务命令')
  async deleteCommand(@Param('id') id: string) { return ApiRes.success(await this.telegram.deleteCommand(id)); }
  @Get('bindings') @UsePermissions({ resource: 'telegram', action: 'read' })
  async bindings() { return ApiRes.success(await this.telegram.bindings()); }
  @Patch('bindings/:id') @UsePermissions({ resource: 'telegram', action: 'update' }) @Log('Telegram', '设置用户绑定权限')
  async binding(@Param('id') id: string, @Body() body: unknown) { return ApiRes.success(await this.telegram.saveBinding(id, body)); }
  @Delete('bindings/:id') @UsePermissions({ resource: 'telegram', action: 'delete' }) @Log('Telegram', '解除用户绑定')
  async deleteBinding(@Param('id') id: string) { return ApiRes.success(await this.telegram.deleteBinding(id)); }
  @Get('deliveries') @UsePermissions({ resource: 'telegram', action: 'read' })
  async deliveries(@Query() query: Record<string, unknown>, @Request() request: ActorRequest) { return ApiRes.success(await this.telegram.records('deliveries', query, request.user.uid)); }
  @Get('executions') @UsePermissions({ resource: 'telegram', action: 'read' })
  async executions(@Query() query: Record<string, unknown>, @Request() request: ActorRequest) { return ApiRes.success(await this.telegram.records('executions', query, request.user.uid)); }
  @Post('deliveries/:id/retry') @UsePermissions({ resource: 'telegram', action: 'retry' }) @Log('Telegram', '重试消息投递')
  async retry(@Param('id') id: string, @Body() body: unknown) { return ApiRes.success(await this.telegram.retry(id, body)); }
  @Get('options') @UsePermissions({ resource: 'telegram', action: 'read' })
  async options(@Request() request: ActorRequest, @Query('keyword') keyword?: string) {
    const query = keyword ? text(keyword, 100) : '';
    return ApiRes.success({
      sites: await this.auth.allowed(request.user.uid, 'site:read') ? await this.prisma.epaySite.findMany({ where: { name: { contains: query } }, select: { id: true, name: true }, take: 500 }) : [],
      collectors: await this.auth.allowed(request.user.uid, 'collector:read') ? await this.prisma.collector.findMany({ where: { name: { contains: query } }, select: { id: true, name: true }, take: 500 }) : [],
      accounts: await this.auth.allowed(request.user.uid, 'account:read') ? await this.prisma.account.findMany({ where: { OR: [{ id: { contains: query } }, { profileNo: { contains: query } }] }, select: { id: true, profileNo: true }, take: 500 }) : [],
    });
  }
}

@ApiTags('业务异常通知')
@Controller('notifications')
@UseGuards(AuthZGuard)
export class NotificationController {
  constructor(private readonly prisma: PrismaService, private readonly auth: TelegramAuthService) {}
  @Get('incidents') @UsePermissions({ resource: 'notification', action: 'read' })
  async incidents(@Query() query: Record<string, unknown>, @Request() request: ActorRequest) {
    const pagination = page(query), entityTypes: string[] = [];
    for (const [entity, permission] of [['ACCOUNT', 'account:read'], ['COLLECTOR', 'collector:read'], ['ADJUSTMENT', 'adjustment:read']]) if (await this.auth.allowed(request.user.uid, permission)) entityTypes.push(entity);
    const where = { entityType: { in: entityTypes }, ...(query.status === 'OPEN' ? { recoveredAt: null } : {}), ...(query.entityId ? { entityId: text(query.entityId) } : {}) };
    const [records, total] = await Promise.all([this.prisma.notificationIncident.findMany({ where, orderBy: { occurredAt: 'desc' }, skip: pagination.skip, take: pagination.take }), this.prisma.notificationIncident.count({ where })]);
    return ApiRes.success({ records, total, current: pagination.current, size: pagination.size });
  }
  @Post('incidents/:id/ack') @UsePermissions({ resource: 'notification', action: 'update' }) @Log('通知', '确认业务告警')
  async acknowledge(@Param('id') id: string, @Request() request: ActorRequest) {
    const incident = await this.prisma.notificationIncident.findUnique({ where: { id } });
    if (!incident || !await this.auth.entityAllowed(incident.entityType, incident.entityId, [], request.user.uid)) throw new ForbiddenException('事件不存在或没有查看权限');
    await this.prisma.notificationIncident.update({ where: { id }, data: { acknowledgedAt: new Date(), acknowledgedBy: request.user.uid } });
    return ApiRes.success({ acknowledged: true });
  }
}
