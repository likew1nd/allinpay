import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  OperationLogProperties,
  OperationLogReadModel,
} from '@app/base-system/lib/bounded-contexts/log-audit/operation-log/domain/operation-log.read.model';
import { PageOperationLogsQuery } from '@app/base-system/lib/bounded-contexts/log-audit/operation-log/queries/page-operation-logs.query';

import { AuthActionVerb, AuthZGuard, UsePermissions } from '@lib/infra/casbin';
import { ApiResponseDoc } from '@lib/infra/decorators/api-result.decorator';
import { LogInterceptor } from '@lib/infra/interceptors/log.interceptor';
import { ApiRes } from '@lib/infra/rest/res.response';
import { PaginationResult } from '@lib/shared/prisma/pagination';
import { IAuthentication } from '@lib/typings/global';

import { PageOperationLogsQueryDto } from '../dto/page-operation-log.dto';

@UseGuards(AuthZGuard)
@UseInterceptors(LogInterceptor)
@ApiTags('Operation Log - Module')
@Controller('operation-log')
export class OperationLogController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @UsePermissions({ resource: 'operation-log', action: AuthActionVerb.READ })
  @ApiOperation({
    summary: 'Retrieve Paginated Operation Logs',
  })
  @ApiResponseDoc({ type: OperationLogReadModel, isPaged: true })
  async page(
    @Query() queryDto: PageOperationLogsQueryDto,
    @Req() request: FastifyRequest & { user: IAuthentication },
  ): Promise<ApiRes<PaginationResult<OperationLogProperties>>> {
    const query = new PageOperationLogsQuery({
      current: queryDto.current,
      size: queryDto.size,
      username: queryDto.username,
      domain: request.user.domain,
      moduleName: queryDto.moduleName,
      method: queryDto.method,
      source: queryDto.source,
      levels: queryDto.levels?.split(','),
      status: queryDto.status,
      keyword: queryDto.keyword,
      startAt: queryDto.startAt,
      endAt: queryDto.endAt,
    });
    const result = await this.queryBus.execute<
      PageOperationLogsQuery,
      PaginationResult<OperationLogProperties>
    >(query);

    return ApiRes.success(result);
  }
}
