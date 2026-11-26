import { prisma } from '../helper';
import { menus, roleMenus } from './menu-baseline';

export const initSysMenu = async () => {
  await prisma.$transaction(async tx => {
    if (await tx.sysMenu.count()) return;
    await tx.sysMenu.createMany({ data: menus });
    await tx.sysRoleMenu.createMany({ data: Object.entries(roleMenus).flatMap(([roleId, ids]) =>
      ids.map(menuId => ({ roleId, menuId, domain: 'built-in' }))), skipDuplicates: true });
  });
};
