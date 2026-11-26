import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { accountObservations, EVENT_LABELS, hash, Observation } from './notification.types';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async observe(tx: Prisma.TransactionClient, entityType: string, entityId: string, sourceId: string, observations: Observation[]) {
    const bot = await tx.telegramBot.findUnique({ where: { id: 'default' } });
    const epoch = bot?.enabled ? bot.dispatchEpoch : null;
    for (const observation of observations) {
      const cause = observation.cause ?? '';
      const activeKey = hash(`${entityType}:${entityId}:${observation.eventType}:${cause}`);
      let incident = await tx.notificationIncident.findUnique({ where: { activeKey } });
      let phase: string | undefined;
      if (observation.active && !incident) {
        incident = await tx.notificationIncident.create({ data: { id: randomUUID(), entityType, entityId,
          eventType: observation.eventType, cause, activeKey, title: EVENT_LABELS[observation.eventType], lastAnnouncedEpoch: epoch ?? -1 } });
        phase = 'OPEN';
      } else if (observation.active && incident) {
        const announced = epoch !== null && incident.lastAnnouncedEpoch !== epoch;
        await tx.notificationIncident.update({ where: { id: incident.id }, data: { lastObservedAt: new Date(), ...(announced ? { lastAnnouncedEpoch: epoch } : {}) } });
        if (announced) phase = 'OBSERVE';
      } else if (!observation.active && incident) {
        await tx.notificationIncident.update({ where: { id: incident.id }, data: { activeKey: null, recoveredAt: new Date(), lastObservedAt: new Date() } });
      }
      if (phase && incident) {
        await tx.notificationEvent.upsert({ where: { eventKey: hash(`${incident.id}:${phase}:${sourceId}:${epoch}`) },
          create: { id: randomUUID(), incidentId: incident.id, phase, sourceId, telegramEpoch: epoch, eventKey: hash(`${incident.id}:${phase}:${sourceId}:${epoch}`) }, update: {} });
      }
    }
  }

  account(tx: Prisma.TransactionClient, id: string, sourceId: string, status: string, inspection?: Parameters<typeof accountObservations>[1]) {
    return this.observe(tx, 'ACCOUNT', id, sourceId, accountObservations(status, inspection));
  }

  async scan() {
    // 同一采集端的扫描与心跳都锁定其行，避免离线/恢复交错生成重复事件。
    const collectors = await this.prisma.collector.findMany({ select: { id: true } });
    for (const { id } of collectors) await this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM collector WHERE id = ${id} FOR UPDATE`);
      const collector = await tx.collector.findUnique({ where: { id } });
      if (!collector) return;
      await this.observe(tx, 'COLLECTOR', id, `heartbeat:${collector.lastHeartbeatAt?.toISOString() ?? 'none'}`, [
        { eventType: 'COLLECTOR_OFFLINE', active: !collector.lastHeartbeatAt || Date.now() - collector.lastHeartbeatAt.getTime() > 30_000 },
      ]);
    });
    const bot = await this.prisma.telegramBot.findUnique({ where: { id: 'default' } });
    if (!bot?.enabledAt) return;
    const records = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT a.id FROM adjustment_record a
      WHERE a.status IN ('FAILED', 'EXPIRED') AND a.completed_at >= ${bot.enabledAt}
        AND NOT EXISTS (SELECT 1 FROM notification_incident n WHERE n.entityType = 'ADJUSTMENT'
          AND n.entityId = a.id AND n.eventType = 'STRATEGY_EXECUTION_FAILED' AND n.lastAnnouncedEpoch = ${bot.dispatchEpoch})
      ORDER BY a.completed_at ASC, a.id ASC LIMIT 100
    `);
    for (const { id } of records) await this.prisma.$transaction(tx => this.observe(tx, 'ADJUSTMENT', id, id, [{ eventType: 'STRATEGY_EXECUTION_FAILED', active: true }]));
  }
}
