import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { OperationLogProperties } from '@app/base-system/lib/bounded-contexts/log-audit/operation-log/domain/operation-log.read.model';
import { OperationLogReadRepoPort } from '@app/base-system/lib/bounded-contexts/log-audit/operation-log/ports/operation-log.read.repo-port';
import { PageOperationLogsQuery } from '@app/base-system/lib/bounded-contexts/log-audit/operation-log/queries/page-operation-logs.query';

import { PaginationResult } from '@lib/shared/prisma/pagination';
import { PrismaService } from '@lib/shared/prisma/prisma.service';

@Injectable()
export class OperationLogReadRepository implements OperationLogReadRepoPort {
  constructor(private prisma: PrismaService) {}

  async pageOperationLogs(
    query: PageOperationLogsQuery,
  ): Promise<PaginationResult<OperationLogProperties>> {
    const where: Prisma.SysOperationLogWhereInput = {};

    if (query.username) {
      where.username = {
        contains: query.username,
      };
    }

    if (query.domain) {
      where.domain = query.domain;
    }

    if (query.moduleName) {
      where.moduleName = {
        contains: query.moduleName,
      };
    }

    if (query.method) {
      where.method = query.method;
    }

    if (query.source) where.source = query.source;
    if (query.levels?.length) where.level = { in: query.levels };
    if (query.status) where.status = query.status;
    if (query.startAt || query.endAt) {
      where.endTime = {
        ...(query.startAt ? { gte: new Date(query.startAt) } : {}),
        ...(query.endAt ? { lte: new Date(query.endAt) } : {}),
      };
    }
    if (query.keyword) {
      where.OR = [
        { description: { contains: query.keyword } },
        { moduleName: { contains: query.keyword } },
        { objectName: { contains: query.keyword } },
        { username: { contains: query.keyword } },
        ...[
          '$.audit.siteName',
          '$.audit.strategyName',
          '$.audit.strategyGroupName',
          '$.audit.targetName',
          '$.audit.searchText',
          '$.ruleName',
        ].map((path) => ({
          body: { path, string_contains: query.keyword },
        })),
      ];
    }

    const operationLogs = await this.prisma.sysOperationLog.findMany({
      where: where,
      skip: (query.current - 1) * query.size,
      take: query.size,
      orderBy: [{ endTime: 'desc' }, { id: 'desc' }],
    });

    const total = await this.prisma.sysOperationLog.count({ where: where });

    return new PaginationResult<OperationLogProperties>(
      query.current,
      query.size,
      total,
      operationLogs,
    );
  }
}
