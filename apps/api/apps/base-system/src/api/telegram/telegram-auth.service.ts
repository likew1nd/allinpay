import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Enforcer } from 'casbin';
import { Prisma } from '@prisma/client';
import { AUTHZ_ENFORCER } from '@lib/infra/casbin';
import { PrismaService } from '@lib/shared/prisma/prisma.service';
import { accountWhere, adjustmentWhere, collectorWhere, TelegramScope } from './telegram-policy';

@Injectable()
export class TelegramAuthService {
  constructor(private readonly prisma: PrismaService, @Inject(AUTHZ_ENFORCER) private readonly enforcer: Enforcer) {}
  async allowed(userId: string, permission: string) {
    const user = await this.prisma.sysUser.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ENABLED') return false;
    const memberships = await this.prisma.sysUserRole.findMany({ where: { userId } });
    const roles = await this.prisma.sysRole.findMany({ where: { id: { in: memberships.map(row => row.roleId) }, status: 'ENABLED' } });
    const [resource, action] = permission.split(':');
    for (const role of roles) if (await this.enforcer.enforce(role.code, resource, action, user.domain)) return true;
    return false;
  }
  async require(userId: string, permission: string) {
    if (!await this.allowed(userId, permission)) throw new ForbiddenException('没有执行此操作的权限');
  }
  async entityAllowed(entityType: string, entityId: string, scopes: TelegramScope[], userId?: string, tx: Prisma.TransactionClient = this.prisma) {
    const permission = { ACCOUNT: 'account:read', COLLECTOR: 'collector:read', ADJUSTMENT: 'adjustment:read' }[entityType];
    if (!permission || (userId && !await this.allowed(userId, permission))) return false;
    if (entityType === 'ACCOUNT') return !!await tx.account.findFirst({ where: { AND: [{ id: entityId }, accountWhere(scopes)] }, select: { id: true } });
    if (entityType === 'COLLECTOR') return !!await tx.collector.findFirst({ where: { AND: [{ id: entityId }, collectorWhere(scopes)] }, select: { id: true } });
    return !!await tx.adjustmentRecord.findFirst({ where: { AND: [{ id: entityId }, adjustmentWhere(scopes)] }, select: { id: true } });
  }
}
