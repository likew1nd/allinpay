import { Prisma } from '@prisma/client';

import { prisma } from '../helper';

export const initCasbinRule = async () => {
  const data: Prisma.CasbinRuleCreateInput[] = [
    {
      ptype: 'p',
      v0: 'ROLE_SUPER',
      v1: 'authorization',
      v2: 'assign-permission',
      v3: 'built-in',
      v4: null,
      v5: null,
    },
    {
      ptype: 'p',
      v0: 'ROLE_SUPER',
      v1: 'authorization',
      v2: 'assign-routes',
      v3: 'built-in',
      v4: null,
      v5: null,
    },
    {
      ptype: 'p',
      v0: 'ROLE_SUPER',
      v1: 'authorization',
      v2: 'assign-users',
      v3: 'built-in',
      v4: null,
      v5: null,
    },
    {
      ptype: 'p',
      v0: 'ROLE_SUPER',
      v1: 'api-endpoint',
      v2: 'read',
      v3: 'built-in',
      v4: null,
      v5: null,
    },
    {
      ptype: 'p',
      v0: 'ROLE_SUPER',
      v1: 'login-log',
      v2: 'read',
      v3: 'built-in',
      v4: null,
      v5: null,
    },
    {
      ptype: 'p',
      v0: 'ROLE_SUPER',
      v1: 'operation-log',
      v2: 'read',
      v3: 'built-in',
      v4: null,
      v5: null,
    },
    {
      ptype: 'p',
      v0: 'ROLE_ADMIN',
      v1: 'login-log',
      v2: 'read',
      v3: 'built-in',
      v4: null,
      v5: null,
    },
    {
      ptype: 'p',
      v0: 'ROLE_ADMIN',
      v1: 'operation-log',
      v2: 'read',
      v3: 'built-in',
      v4: null,
      v5: null,
    },
  ];

  for (const role of ['ROLE_SUPER', 'ROLE_ADMIN']) {
    for (const action of ['read', 'create', 'update', 'delete', 'test', 'retry']) {
      data.push({ ptype: 'p', v0: role, v1: 'telegram', v2: action, v3: 'built-in' });
    }
    for (const action of ['read', 'update']) {
      data.push({ ptype: 'p', v0: role, v1: 'notification', v2: action, v3: 'built-in' });
    }
    for (const resource of ['route', 'user', 'role', 'site', 'strategy']) {
      // site:delete 首版未开放，不分配给任何角色
      const actions = resource === 'site' ? ['read', 'create', 'update'] : ['read', 'create', 'update', 'delete'];
      for (const action of actions) {
        data.push({
          ptype: 'p',
          v0: role,
          v1: resource,
          v2: action,
          v3: 'built-in',
        });
      }
    }
    data.push({ ptype: 'p', v0: role, v1: 'adjustment', v2: 'read', v3: 'built-in' });
    data.push({ ptype: 'p', v0: role, v1: 'collector', v2: 'read', v3: 'built-in' });
    data.push({ ptype: 'p', v0: role, v1: 'collector', v2: 'create', v3: 'built-in' });
    data.push({ ptype: 'p', v0: role, v1: 'collector', v2: 'update', v3: 'built-in' });
    // 系统设置（含 MFA 开关和验证器绑定）
    for (const action of ['read', 'update']) {
      data.push({ ptype: 'p', v0: role, v1: 'system-setting', v2: action, v3: 'built-in' });
    }
    // 转账：收款人、转账规则、转账单。环境转账使用规则开关，异常结果标记只给 ROLE_SUPER
    for (const action of ['read', 'create', 'update', 'delete']) {
      data.push({ ptype: 'p', v0: role, v1: 'payee', v2: action, v3: 'built-in' });
    }
    for (const action of ['read', 'create', 'update', 'delete']) {
      data.push({ ptype: 'p', v0: role, v1: 'transfer-rule', v2: action, v3: 'built-in' });
    }
    for (const action of ['read', 'cancel']) {
      data.push({ ptype: 'p', v0: role, v1: 'transfer-request', v2: action, v3: 'built-in' });
    }
    if (role === 'ROLE_SUPER') {
      data.push({ ptype: 'p', v0: role, v1: 'transfer-request', v2: 'resolve', v3: 'built-in' });
      // 转账测试会真实付款，只给超级管理员
      data.push({ ptype: 'p', v0: role, v1: 'transfer-request', v2: 'test', v3: 'built-in' });
    }
    data.push({ ptype: 'p', v0: role, v1: 'collector', v2: 'delete', v3: 'built-in' });
    data.push({ ptype: 'p', v0: role, v1: 'account', v2: 'read', v3: 'built-in' });
    data.push({ ptype: 'p', v0: role, v1: 'account', v2: 'update', v3: 'built-in', v4: 'allow' });
    // 资金管理：资金账户
    for (const action of ['read', 'create', 'update']) {
      data.push({ ptype: 'p', v0: role, v1: 'fund-account', v2: action, v3: 'built-in' });
    }
    for (const action of ['read', 'create']) {
      data.push({ ptype: 'p', v0: role, v1: 'settlement', v2: action, v3: 'built-in' });
    }
    for (const action of ['read', 'create', 'update', 'delete']) {
      data.push({ ptype: 'p', v0: role, v1: 'account-binding', v2: action, v3: 'built-in' });
    }
    for (const action of [
      'assign-routes',
      'assign-users',
      'assign-permission',
    ]) {
      data.push({
        ptype: 'p',
        v0: role,
        v1: 'authorization',
        v2: action,
        v3: 'built-in',
      });
    }
    data.push({
      ptype: 'p',
      v0: role,
      v1: 'api-endpoint',
      v2: 'read',
      v3: 'built-in',
    });
  }
  data.push({
    ptype: 'p',
    v0: 'ROLE_USER',
    v1: 'site',
    v2: 'read',
    v3: 'built-in',
  });
  for (const rule of data) {
    const existing = await prisma.casbinRule.findFirst({
      where: {
        ptype: rule.ptype,
        v0: rule.v0,
        v1: rule.v1,
        v2: rule.v2,
        v3: rule.v3,
      },
    });
    if (!existing) await prisma.casbinRule.create({ data: rule });
  }
};
