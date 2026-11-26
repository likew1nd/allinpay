import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  applicationAdjustmentAudit = false;
  constructor() {
    // 只保留警告和错误；逐条 SQL 日志会让开发日志迅速膨胀
    super({
      log: [
        { level: 'warn', emit: 'stdout' },
        { level: 'error', emit: 'stdout' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    const writer = await this.systemSetting.findUnique({ where: { key: 'audit.adjustmentWriter' } });
    this.applicationAdjustmentAudit = writer?.value === 'application';
  }
}
