import {
  Body,
  Controller,
  ConflictException,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthZGuard, UsePermissions } from '@lib/infra/casbin';
import {
  Log,
  setOperationLogContext,
} from '@lib/infra/decorators/log.decorator';
import { ApiRes } from '@lib/infra/rest/res.response';

import { DeleteConfirmDto } from '../delete-check';

import {
  CreateStrategyDto,
  CreateStrategyGroupDto,
  PageStrategyDto,
  UpdateStrategyDto,
  UpdateStrategyGroupDto,
} from './dto/strategy.dto';
import { StrategyService } from './strategy.service';
import { TemplateStrategyService } from './template-strategy.service';
import {
  BindTargetsDto,
  ObjectCatalogDto,
  SaveTemplateDto,
  SaveWorkspaceGroupDto,
} from './dto/template.dto';

const CONFIGURATION_FIELDS = [
  ['controlType', '控制方式'],
  ['windowMinutes', '统计窗口（分钟）'],
  ['minSamples', '最少样本数'],
  ['cooldownSeconds', '冷却时间（秒）'],
  ['minWeight', '权重下限'],
  ['maxWeight', '权重上限'],
] as const;
const METRIC_NAMES: Record<string, string> = {
  SUCCESS_RATE: '成功率',
  FAILURE_RATE: '失败率',
  ORDER_COUNT: '订单数',
  CHANNEL_COUNT: '通道数',
};
const OPERATOR_NAMES: Record<string, string> = {
  LT: '低于',
  LTE: '不高于',
  GT: '高于',
  GTE: '不低于',
  EQ: '等于',
};
const ACTION_NAMES: Record<string, string> = {
  ADJUST_MEMBER_WEIGHT: '调整通道权重',
  SET_MEMBER_WEIGHT: '设置通道权重',
  SET_CHANNEL_STATUS: '调整通道状态',
  ADD_POLLING_MEMBER: '补入备用通道',
  REMOVE_POLLING_MEMBER: '移除轮询通道',
  REMOVE_REPLACEMENT_MEMBER: '回切备用通道',
};
export function rulesSummary(rules: unknown) {
  if (!Array.isArray(rules)) return '未设置';
  return rules
    .map((item: any, index) => {
      const conditions = [item, ...(item.conditions ?? [])]
        .map((condition: any) => {
          const metric = METRIC_NAMES[condition.metric] ?? condition.metric;
          const operator =
            OPERATOR_NAMES[condition.operator] ?? condition.operator;
          const isRate = ['SUCCESS_RATE', 'FAILURE_RATE'].includes(
            condition.metric,
          );
          const value = isRate
            ? `${Number(condition.value) * 100}%`
            : condition.value;
          return `${metric}${operator}${value}`;
        })
        .join('且');
      const action =
        ACTION_NAMES[item.action?.type] ?? item.action?.type ?? '未知动作';
      const value = item.action?.value;
      const actionSummary =
        item.action?.type === 'SET_CHANNEL_STATUS'
          ? Number(value) === 1
            ? '启用通道'
            : '停用通道'
          : item.action?.type === 'SET_MEMBER_WEIGHT'
            ? `通道权重设为 ${value}`
            : item.action?.type === 'ADJUST_MEMBER_WEIGHT'
              ? `通道权重${Number(value) >= 0 ? '增加' : '减少'} ${Math.abs(Number(value))}`
              : item.action?.type === 'ADD_POLLING_MEMBER'
                ? `补入备用通道，初始权重 ${value}`
                : `${action}${value === undefined ? '' : ` ${value}`}`;
      return `${index + 1}. ${item.name ? `${item.name}：` : ''}当${conditions}时，${actionSummary}`;
    })
    .join('；');
}
export function configurationChanges(before: any, after: any) {
  const changes: { field: string; before: unknown; after: unknown }[] =
    CONFIGURATION_FIELDS.flatMap(([field]) =>
      String(before?.[field] ?? '') === String(after?.[field] ?? '')
        ? []
        : [
            {
              field,
              before: before?.[field] ?? null,
              after: after?.[field] ?? null,
            },
          ],
    );
  const oldRules = rulesSummary(before?.rules);
  const newRules = rulesSummary(after?.rules);
  if (oldRules !== newRules)
    changes.push({ field: 'rules', before: oldRules, after: newRules });
  return changes;
}
function setStrategyLog(
  request: any,
  description: string,
  result: any,
  changes: any[],
) {
  const targets = targetSnapshot(result.bindings ?? []);
  const sites = [
    ...new Map<string, { siteId: string; siteName: string | undefined }>(
      targets.map((row: any) => [
        row.siteId,
        {
          siteId: row.siteId,
          siteName: row.siteName,
        },
      ]),
    ).values(),
  ];
  setOperationLogContext(request, {
    description,
    objectId: result.id,
    objectName: result.name,
    body: {
      audit: {
        objectName: result.name,
        strategyGroupId: result.id,
        strategyGroupName: result.name,
        strategyId: result.template?.id ?? result.templateId ?? null,
        strategyName: result.template?.name ?? null,
        searchText: [
          result.name,
          result.template?.name,
          ...sites.map((site) => site.siteName),
          ...targets.map((target: any) =>
            [
              target.pollingGroupName,
              target.channelName,
              target.pollingGroupCode,
              target.channelCode,
            ]
              .filter(Boolean)
              .join(' '),
          ),
        ]
          .filter(Boolean)
          .join(' '),
        ...(sites.length === 1 ? sites[0] : {}),
        sites,
        targets,
        changes,
      },
    },
  });
}

function targetSummary(bindings: any[]) {
  return (
    bindings
      .map((row) =>
        [
          row.site?.name ?? row.siteId,
          row.pollingGroupCode
            ? `${row.pollingGroupName ?? '轮询组'}（轮询组 ${row.pollingGroupCode}）`
            : null,
          `${row.channelName ?? '通道'}（通道 ${row.channelCode}）`,
        ]
          .filter(Boolean)
          .join(' / '),
      )
      .join('；') || '无'
  );
}

function targetSnapshot(bindings: any[]) {
  return bindings.map((row) => ({
    siteId: row.siteId,
    siteName: row.site?.name ?? row.siteName,
    pollingGroupCode: row.pollingGroupCode,
    pollingGroupName: row.pollingGroupName,
    channelCode: row.channelCode,
    channelName: row.channelName,
  }));
}

function targetChange(before: any[], after: any[]) {
  return {
    field: 'targets',
    before: targetSummary(before),
    after: targetSummary(after),
    beforeTargetCount: before.length,
    afterTargetCount: after.length,
    beforeTargets: targetSnapshot(before),
    afterTargets: targetSnapshot(after),
  };
}

function setTemplateLog(
  request: any,
  description: string,
  result: any,
  changes: any[],
) {
  setOperationLogContext(request, {
    description,
    objectId: result.id,
    objectName: result.name,
    body: {
      audit: {
        objectName: result.name,
        strategyId: result.id,
        strategyName: result.name,
        changes,
      },
    },
  });
}

@ApiTags('策略中心')
@UseGuards(AuthZGuard)
@Controller()
export class StrategyController {
  constructor(
    private readonly strategies: StrategyService,
    private readonly templates: TemplateStrategyService,
  ) {}

  private async groupLogSnapshot(result: any, fallbackBindings: any[] = []) {
    // 审计补全失败不能把已成功保存的业务操作变成失败。
    try {
      const snapshot = await this.templates.workspaceGroup(result.id);
      return {
        ...snapshot,
        ...result,
        bindings: snapshot.bindings,
        template: snapshot.template,
      };
    } catch {
      return { ...result, bindings: fallbackBindings };
    }
  }

  @Get('strategy-groups')
  @UsePermissions({ resource: 'strategy', action: 'read' })
  async pageGroups(@Query() query: PageStrategyDto) {
    return ApiRes.success(await this.templates.pageGroups(query));
  }

  @Get('strategy-workspace/objects')
  @UsePermissions({ resource: 'strategy', action: 'read' })
  async objectCatalog(@Query() query: ObjectCatalogDto) {
    return ApiRes.success(
      await this.templates.objectCatalog(query.windowMinutes),
    );
  }

  @Get('strategy-groups/:id/configuration')
  @UsePermissions({ resource: 'strategy', action: 'read' })
  async workspaceGroup(@Param('id') id: string) {
    return ApiRes.success(await this.templates.workspaceGroup(id));
  }

  @Post('strategy-workspace/groups')
  @UsePermissions({ resource: 'strategy', action: 'create' })
  @Log('策略中心', '新建策略组')
  async createWorkspaceGroup(
    @Body() dto: SaveWorkspaceGroupDto,
    @Request() request: any,
  ) {
    const result = await this.templates.saveWorkspaceGroup(dto);
    const snapshot = await this.groupLogSnapshot(result, dto.targets);
    setStrategyLog(request, '新建策略组', snapshot, [
      { field: 'name', before: null, after: result.name },
      ...configurationChanges(null, result.configuration),
      targetChange([], snapshot.bindings ?? []),
    ]);
    return ApiRes.success(result);
  }

  @Put('strategy-groups/:id/configuration')
  @UsePermissions({ resource: 'strategy', action: 'update' })
  @Log('策略中心', '保存策略组设置')
  async saveWorkspaceGroup(
    @Param('id') id: string,
    @Body() dto: SaveWorkspaceGroupDto,
    @Request() request: any,
  ) {
    const previous = await this.templates.workspaceGroup(id);
    setStrategyLog(
      request,
      '保存策略组设置',
      previous,
      configurationChanges(previous.configuration, dto.configuration),
    );
    const result = await this.templates.saveWorkspaceGroup(dto, id);
    const snapshot = await this.groupLogSnapshot(result, dto.targets);
    const changes = configurationChanges(
      previous.configuration,
      dto.configuration,
    );
    if (previous.name !== result.name)
      changes.unshift({
        field: 'name',
        before: previous.name,
        after: result.name,
      });
    if (previous.status !== result.status)
      changes.push({
        field: 'status',
        before: previous.status,
        after: result.status,
      });
    if (previous.description !== result.description)
      changes.push({
        field: 'description',
        before: previous.description,
        after: result.description,
      });
    if (previous.templateId !== result.templateId)
      changes.push({
        field: 'strategyName',
        before: previous.template?.name ?? '自定义规则',
        after: snapshot.template?.name ?? '自定义规则',
      });
    const oldTargets = previous.bindings
      .map((row) =>
        [row.siteId, row.pollingGroupCode, row.channelCode].join(':'),
      )
      .sort();
    const newTargets = dto.targets
      .map((row) =>
        [row.siteId, row.pollingGroupCode, row.channelCode].join(':'),
      )
      .sort();
    if (JSON.stringify(oldTargets) !== JSON.stringify(newTargets))
      changes.push(
        targetChange(previous.bindings, snapshot.bindings ?? dto.targets),
      );
    setStrategyLog(
      request,
      changes.some((change) => change.field === 'targets')
        ? '修改策略组执行对象'
        : '修改策略组设置',
      snapshot,
      changes,
    );
    return ApiRes.success(result);
  }

  @Post('strategy-groups')
  @UsePermissions({ resource: 'strategy', action: 'create' })
  @Log('策略中心', '新建策略组')
  async createGroup(
    @Body() dto: CreateStrategyGroupDto,
    @Request() request: any,
  ) {
    const result = await this.templates.saveGroup(dto);
    const snapshot = await this.groupLogSnapshot(result);
    setStrategyLog(request, '新建策略组', snapshot, [
      { field: 'name', before: null, after: result.name },
      ...configurationChanges(null, result.configuration),
    ]);
    return ApiRes.success(result);
  }

  @Patch('strategy-groups/:id')
  @UsePermissions({ resource: 'strategy', action: 'update' })
  @Log('策略中心', '修改策略组设置')
  async updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateStrategyGroupDto,
    @Request() request: any,
  ) {
    const previous = await this.templates.workspaceGroup(id);
    setStrategyLog(request, '修改策略组设置', previous, [
      ...(dto.status !== undefined
        ? [{ field: 'status', before: previous.status, after: dto.status }]
        : []),
      ...(dto.name !== undefined
        ? [{ field: 'name', before: previous.name, after: dto.name }]
        : []),
    ]);
    const result = await this.templates.saveGroup(dto, id);
    const snapshot =
      previous.templateId !== result.templateId
        ? await this.groupLogSnapshot(result, previous.bindings)
        : { ...previous, ...result };
    const changes: { field: string; before: unknown; after: unknown }[] = [
      ...(dto.name !== undefined && dto.name !== previous.name
        ? [{ field: 'name', before: previous.name, after: result.name }]
        : []),
      ...(dto.status !== undefined && dto.status !== previous.status
        ? [{ field: 'status', before: previous.status, after: result.status }]
        : []),
    ];
    for (const field of ['description', 'executionOrder'] as const)
      if (dto[field] !== undefined && previous[field] !== result[field])
        changes.push({
          field,
          before: previous[field] ?? null,
          after: result[field] ?? null,
        });
    if (previous.templateId !== result.templateId) {
      changes.push({
        field: 'strategyName',
        before: previous.template?.name ?? '自定义规则',
        after: snapshot.template?.name ?? result.templateId ?? '自定义规则',
      });
      changes.push(
        ...configurationChanges(previous.configuration, result.configuration),
      );
    }
    setStrategyLog(
      request,
      dto.status === 'RUNNING'
        ? '启用策略组'
        : dto.status === 'PAUSED'
          ? '暂停策略组'
          : '修改策略组设置',
      snapshot,
      changes,
    );
    return ApiRes.success(result);
  }

  @Get('strategy-groups/:id/bindings')
  @UsePermissions({ resource: 'strategy', action: 'read' })
  async groupBindings(@Param('id') id: string) {
    return ApiRes.success(await this.templates.bindings(id));
  }

  @Post('strategy-groups/:id/bindings')
  @UsePermissions({ resource: 'strategy', action: 'update' })
  @Log('策略中心', '为策略组添加执行对象')
  async addGroupBinding(
    @Param('id') id: string,
    @Body() dto: BindTargetsDto,
    @Request() request: any,
  ) {
    const group = await this.templates.workspaceGroup(id);
    setStrategyLog(request, '为策略组添加执行对象', group, []);
    const result = await this.templates.bind(id, dto);
    const snapshot = await this.groupLogSnapshot(group, [
      ...group.bindings,
      ...dto.channelCodes.map((channelCode) => ({
        siteId: dto.siteId,
        site: group.bindings.find((row) => row.siteId === dto.siteId)?.site,
        pollingGroupCode: dto.pollingGroupCode ?? '',
        channelCode,
      })),
    ]);
    setStrategyLog(request, '为策略组添加执行对象', snapshot, [
      targetChange(group.bindings, snapshot.bindings ?? []),
    ]);
    return ApiRes.success(result);
  }

  @Delete('strategy-groups/:id/bindings/:bindingId')
  @UsePermissions({ resource: 'strategy', action: 'update' })
  @Log('策略中心', '移除策略组执行对象')
  async removeGroupBinding(
    @Param('id') id: string,
    @Param('bindingId') bindingId: string,
    @Request() request: any,
  ) {
    const group = await this.templates.workspaceGroup(id);
    setStrategyLog(request, '移除策略组执行对象', group, []);
    const result = await this.templates.unbind(id, bindingId);
    const remaining = group.bindings.filter((row) => row.id !== bindingId);
    setStrategyLog(
      request,
      '移除策略组执行对象',
      { ...group, bindings: remaining },
      [targetChange(group.bindings, remaining)],
    );
    return ApiRes.success(result);
  }

  @Get('strategy-groups/:id/delete-check')
  @UsePermissions({ resource: 'strategy', action: 'update' })
  @ApiOperation({ summary: '删除站点策略前检查：是否运行中、仍绑定哪些执行对象' })
  async groupDeleteCheck(@Param('id') id: string) {
    return ApiRes.success(await this.templates.deleteCheck(id));
  }

  @Delete('strategy-groups/:id')
  @UsePermissions({ resource: 'strategy', action: 'update' })
  @Log('策略中心', '删除策略组')
  async deleteGroup(
    @Param('id') id: string,
    @Body() _dto: DeleteConfirmDto,
    @Request() request: any,
  ) {
    const group = await this.templates.workspaceGroup(id);
    setStrategyLog(request, '删除策略组', group, [
      { field: 'strategyGroupName', before: group.name, after: '已删除' },
    ]);
    return ApiRes.success(await this.templates.deleteGroup(id));
  }

  @Post('strategy-groups/:id/simulate')
  @UsePermissions({ resource: 'strategy', action: 'read' })
  @Log('策略中心', '模拟策略组（不执行站点操作）')
  async simulateGroup(@Param('id') id: string, @Request() request: any) {
    const group = await this.templates.workspaceGroup(id);
    setStrategyLog(request, '模拟策略组（不执行站点操作）', group, []);
    return ApiRes.success(await this.templates.evaluateGroup(id, true));
  }

  @Post('strategy-groups/:id/run')
  @UsePermissions({ resource: 'strategy', action: 'update' })
  @Log('策略中心', '手动运行策略组')
  async runGroup(@Param('id') id: string, @Request() request: any) {
    const group = await this.templates.workspaceGroup(id);
    setStrategyLog(request, '手动运行策略组', group, []);
    return ApiRes.success(await this.templates.evaluateGroup(id));
  }

  @Get('strategy-templates')
  @UsePermissions({ resource: 'strategy', action: 'read' })
  async pageTemplates(@Query() query: PageStrategyDto) {
    return ApiRes.success(await this.templates.pageTemplates(query));
  }

  @Post('strategy-templates')
  @UsePermissions({ resource: 'strategy', action: 'create' })
  @Log('策略中心', '新建策略模板')
  async createTemplate(@Body() dto: SaveTemplateDto, @Request() request: any) {
    const result = await this.templates.saveTemplate(dto);
    setTemplateLog(request, '新建策略模板', result, [
      { field: 'name', before: null, after: result.name },
      ...configurationChanges(null, result),
    ]);
    return ApiRes.success(result);
  }

  @Patch('strategy-templates/:id')
  @UsePermissions({ resource: 'strategy', action: 'update' })
  @Log('策略中心', '修改策略模板')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: SaveTemplateDto,
    @Request() request: any,
  ) {
    const previous = await this.templates.findTemplate(id);
    setTemplateLog(
      request,
      '修改策略模板',
      previous,
      configurationChanges(previous, dto),
    );
    const result = await this.templates.saveTemplate(dto, id);
    const changes = configurationChanges(previous, result);
    for (const field of ['name', 'description'] as const)
      if (previous[field] !== result[field])
        changes.push({
          field,
          before: previous[field] ?? null,
          after: result[field] ?? null,
        });
    setTemplateLog(request, '修改策略模板', result, changes);
    return ApiRes.success(result);
  }

  @Delete('strategy-templates/:id')
  @UsePermissions({ resource: 'strategy', action: 'update' })
  @Log('策略中心', '删除策略模板')
  async deleteTemplate(@Param('id') id: string, @Request() request: any) {
    const previous = await this.templates.findTemplate(id);
    setTemplateLog(request, '删除策略模板', previous, [
      { field: 'strategyName', before: previous.name, after: '已删除' },
    ]);
    return ApiRes.success(await this.templates.deleteTemplate(id));
  }

  @Get('strategies')
  @UsePermissions({ resource: 'strategy', action: 'read' })
  async pageStrategies(@Query() query: PageStrategyDto) {
    return ApiRes.success(await this.strategies.pageStrategies(query));
  }

  @Post('strategies')
  @UsePermissions({ resource: 'strategy', action: 'create' })
  @ApiOperation({ deprecated: true, summary: '旧策略创建入口已停用' })
  async createStrategy(@Body() _dto: CreateStrategyDto) {
    throw new ConflictException(
      '策略列表已合并到策略模板，请通过模板和策略组配置',
    );
  }

  @Patch('strategies/:id')
  @UsePermissions({ resource: 'strategy', action: 'update' })
  @ApiOperation({ deprecated: true, summary: '旧策略修改入口已停用' })
  async updateStrategy(@Body() _dto: UpdateStrategyDto) {
    throw new ConflictException('旧策略已停止执行，请通过模板和策略组配置');
  }

  @Get('strategies/:id/versions')
  @UsePermissions({ resource: 'strategy', action: 'read' })
  async versions(@Param('id') id: string) {
    return ApiRes.success(await this.strategies.pageVersions(id));
  }

  @Post('strategies/:id/versions/:version/replay')
  @UsePermissions({ resource: 'strategy', action: 'read' })
  @ApiOperation({ summary: '回放指定策略版本，不创建调整命令' })
  async replay(@Param('id') id: string, @Param('version') version: string) {
    return ApiRes.success(
      await this.strategies.replayVersion(id, Number(version)),
    );
  }

  @Post('strategies/:id/run')
  @UsePermissions({ resource: 'strategy', action: 'update' })
  @ApiOperation({ deprecated: true, summary: '旧策略执行入口已停用' })
  async run() {
    throw new ConflictException('旧策略已停止执行，请选择模板并绑定执行对象');
  }

  @Post('strategies/:id/simulate')
  @UsePermissions({ resource: 'strategy', action: 'read' })
  @ApiOperation({ summary: '模拟评估策略，不创建调整命令' })
  async simulate(@Param('id') id: string) {
    return ApiRes.success(await this.strategies.simulate(id));
  }

  @Get('adjustments')
  @UsePermissions({ resource: 'adjustment', action: 'read' })
  async pageAdjustments(@Query() query: PageStrategyDto) {
    return ApiRes.success(await this.strategies.pageAdjustments(query));
  }
}
