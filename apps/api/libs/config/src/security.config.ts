import { ConfigType, registerAs } from '@nestjs/config';

import { getEnvNumber, getEnvString } from '@lib/utils/env';

export const securityRegToken = 'security';

const developmentSecrets = {
  JWT_SECRET: 'JWT_SECRET-soybean-admin-nest!@#123.',
  REFRESH_TOKEN_SECRET: 'REFRESH_TOKEN_SECRET-soybean-admin-nest!@#123.',
};

function signingSecret(name: keyof typeof developmentSecrets): string {
  const value = process.env[name];
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return value?.trim() ? value : developmentSecrets[name];
  }
  if (!value?.trim() || Object.values(developmentSecrets).includes(value.trim())) {
    throw new Error(`请配置 ${name} 为私有签名密钥后再启动中心`);
  }
  return value;
}

export const SecurityConfig = registerAs(securityRegToken, () => ({
  casbinModel: getEnvString('CASBIN_MODEL', 'model.conf'),
  jwtSecret: signingSecret('JWT_SECRET'),
  jwtExpiresIn: getEnvNumber('JWT_EXPIRE_IN', 60 * 60 * 2),
  refreshJwtSecret: signingSecret('REFRESH_TOKEN_SECRET'),
  refreshJwtExpiresIn: getEnvNumber('REFRESH_TOKEN_EXPIRE_IN', 60 * 60 * 12),
  signReqTimestampDisparity: getEnvNumber(
    'SIGN_REQ_TIMESTAMP_DISPARITY',
    5 * 60 * 1000,
  ),
  signReqNonceTTL: getEnvNumber('SIGN_REQ_NONCE_TTL', 300),
}));

export type ISecurityConfig = ConfigType<typeof SecurityConfig>;
