import { hash } from 'bcryptjs';

import { prisma } from './helper';
import { initCasbinRule } from './sys/casbinRule';
import { initSysDomain } from './sys/sysDomain';
import { initSysMenu } from './sys/sysMenu';
import { initSysRole } from './sys/sysRole';

/** 默认管理员口令 */
const DEFAULT_ADMIN_PASSWORD = '123456';

/**
 * 初始化种子：域、角色、菜单和授权规则每次幂等补齐；库中没有任何用户时，才创建管理员。
 * 初始密码默认为 123456，可通过环境变量 INITIAL_ADMIN_PASSWORD 覆盖。
 * 默认口令很弱，首次登录后请立即修改；对外部署必须通过环境变量设置强密码。
 */
async function initialize() {
  await initSysDomain();
  await initSysRole();
  await initSysMenu();
  await initCasbinRule();

  if (await prisma.sysUser.count()) return;
  const username = process.env.INITIAL_ADMIN_USERNAME?.trim() || 'admin';
  const password = process.env.INITIAL_ADMIN_PASSWORD?.trim() || DEFAULT_ADMIN_PASSWORD;
  if (password === DEFAULT_ADMIN_PASSWORD) console.warn('[seed] 管理员 admin 使用默认口令 123456，请登录后立即修改；对外部署必须通过 INITIAL_ADMIN_PASSWORD 设置强密码');
  const encrypted = await hash(password, 12);
  await prisma.$transaction([
    prisma.sysUser.create({ data: { id: '1', username, password: encrypted,
      nickName: '管理员', built_in: true, status: 'ENABLED', domain: 'built-in', createdBy: '-1' } }),
    prisma.sysUserRole.create({ data: { userId: '1', roleId: '1' } })
  ]);
}

initialize().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
