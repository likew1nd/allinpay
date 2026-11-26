import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { ServiceUnavailableException } from '@nestjs/common';

type SecretPurpose =
  | 'telegram-bot-token'
  | 'account-password'
  | 'account-payment-password'
  | 'captcha-password'
  | 'ttshitu-password'
  | 'bingtop-password'
  | 'db-password'
  | 'collector-token'
  | 'collector-api-key'
  | 'totp-secret'
  | 'payee-account'
  | 'test-payee-account';

function encryptionKey(): Buffer {
  const value = process.env.SITE_CREDENTIALS_KEY;
  const key = Buffer.from(value ?? '', 'base64');
  if (!value || key.length !== 32 || key.toString('base64') !== value) {
    throw new ServiceUnavailableException(
      '站点凭据加密密钥未正确配置，请联系管理员',
    );
  }
  return key;
}

export function encryptSiteSecret(
  id: string,
  purpose: SecretPurpose,
  value: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${id}:${purpose}`));
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSiteSecret(
  id: string,
  purpose: SecretPurpose,
  value: string,
): string {
  const key = encryptionKey();
  try {
    const [version, iv, tag, encrypted, extra] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !encrypted || extra !== undefined)
      throw new Error();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAAD(Buffer.from(`${id}:${purpose}`));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new ServiceUnavailableException('站点凭据无法解密，请检查服务器密钥');
  }
}
