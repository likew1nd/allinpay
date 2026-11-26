import { Injectable } from '@nestjs/common';

import { Role } from '@app/base-system/lib/bounded-contexts/iam/role/domain/role.model';
import { RoleWriteRepoPort } from '@app/base-system/lib/bounded-contexts/iam/role/ports/role.write.repo-port';

import { PrismaService } from '@lib/shared/prisma/prisma.service';

@Injectable()
export class RoleWritePostgresRepository implements RoleWriteRepoPort {
  constructor(private prisma: PrismaService) {}

  async deleteRoleMenuByRoleId(roleId: string): Promise<void> {
    await this.prisma.sysRoleMenu.deleteMany({
      where: { roleId },
    });
  }

  async deleteRoleMenuByDomain(domain: string): Promise<void> {
    await this.prisma.sysRoleMenu.deleteMany({
      where: { domain },
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.$transaction(async (prisma) => {
      const role = await prisma.sysRole.findUniqueOrThrow({
        where: { id },
        select: { code: true },
      });
      // Revocation must be persisted before the deletion response is returned.
      await prisma.sysRoleMenu.deleteMany({ where: { roleId: id } });
      await prisma.sysUserRole.deleteMany({ where: { roleId: id } });
      await prisma.casbinRule.deleteMany({
        where: { ptype: 'p', v0: role.code },
      });
      await prisma.sysRole.delete({ where: { id } });
    });
  }

  async save(role: Role): Promise<void> {
    await this.prisma.sysRole.create({
      data: { ...role },
    });
  }

  async update(role: Role): Promise<void> {
    await this.prisma.sysRole.update({
      where: { id: role.id },
      data: { ...role },
    });
  }
}
