import { Injectable } from '@nestjs/common';

import { PrismaService } from '@lib/shared/prisma/prisma.service';

export const MFA_ENABLED_KEY = 'mfa.enabled';

// 系统设置：键值开关，值存字符串 'true' / 'false'；没有记录时按默认值（关）处理
@Injectable()
export class SystemSettingService {
  constructor(private readonly prisma: PrismaService) {}

  async getBoolean(key: string, fallback = false) {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return row ? row.value === 'true' : fallback;
  }

  async setBoolean(key: string, value: boolean, actor: string) {
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: String(value), updatedBy: actor },
      update: { value: String(value), updatedBy: actor },
    });
  }
}
