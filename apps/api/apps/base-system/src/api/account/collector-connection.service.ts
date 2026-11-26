import { randomUUID } from 'node:crypto';

import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { ulid } from 'ulid';

import { PrismaService } from '@lib/shared/prisma/prisma.service';

import { decryptSiteSecret } from '../site/site-credentials';
import { AdsPowerFailure, listAdsPowerProfiles } from './adspower-api';

@Injectable()
export class CollectorConnectionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CollectorConnectionService.name);
  private scanning = false;
  private stopping = false;
  private task?: Promise<void>;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() { void this.scan(); }
  async onModuleDestroy() { this.stopping = true; await this.task; }

  @Interval(2000)
  async scan() {
    if (this.stopping || this.scanning || process.env.COLLECTOR_AUTO_CONNECT_DISABLED === 'Y') return;
    this.scanning = true;
    this.task = this.syncNext();
    try { await this.task; }
    catch { this.logger.error('采集端同步失败，将自动重试'); }
    finally { this.scanning = false; }
  }

  private async syncNext() {
    const now = new Date();
    const collector = await this.prisma.collector.findFirst({
      where: {
        apiEndpoint: { not: null }, nextSyncAt: { lte: now },
        OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: now } }],
      },
      orderBy: { nextSyncAt: 'asc' },
    });
    if (!collector || !collector.apiEndpoint || !collector.apiKeyEncrypted) return;
    const owner = randomUUID();
    const claimed = await this.prisma.collector.updateMany({
      where: { id: collector.id, configRevision: collector.configRevision, OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lt: now } }] },
      data: { syncLeaseUntil: new Date(Date.now() + 120_000), syncLeaseOwner: owner },
    });
    if (!claimed.count) return;
    const where = { id: collector.id, configRevision: collector.configRevision, syncLeaseOwner: owner };
    try {
      const key = decryptSiteSecret(collector.id, 'collector-api-key', collector.apiKeyEncrypted);
      const profiles = await listAdsPowerProfiles(collector.apiEndpoint, key);
      await this.prisma.$transaction(async tx => {
        // 发布时锁定配置；编辑、删除或换连接后，旧同步结果不得覆盖新配置。
        await tx.$queryRaw(Prisma.sql`SELECT id FROM collector WHERE id = ${collector.id} FOR UPDATE`);
        const published = await tx.collector.updateMany({
          where,
          data: { status: 'ONLINE', lastError: null, lastHeartbeatAt: new Date(), nextSyncAt: new Date(Date.now() + 30_000), syncLeaseUntil: null, syncLeaseOwner: null },
        });
        if (!published.count) return;
        await tx.account.updateMany({ where: { collectorId: collector.id }, data: { profilePresent: false } });
        for (const profile of profiles) {
          const { externalId, ...fields } = profile;
          await tx.account.upsert({
            where: { collectorId_externalId: { collectorId: collector.id, externalId } },
            create: { id: `account-${ulid().toLowerCase()}`, collectorId: collector.id, externalId, ...fields },
            // 这里只同步环境资料，不能把连接成功当成支付账号正常或刷新余额时间。
            update: { ...fields, profilePresent: true },
          });
        }
        await tx.account.updateMany({
          where: { collectorId: collector.id, profilePresent: false },
          data: { status: 'ENV_UNAVAILABLE', lastError: 'AdsPower 环境已不在当前列表中' },
        });
      }, { timeout: 60_000 });
    } catch (error) {
      await this.prisma.collector.updateMany({
        where,
        data: {
          status: 'ERROR',
          lastError: error instanceof AdsPowerFailure ? error.message : '采集端同步失败，请检查配置或稍后重试',
          nextSyncAt: new Date(Date.now() + 30_000), syncLeaseUntil: null, syncLeaseOwner: null,
        },
      });
    }
  }
}
