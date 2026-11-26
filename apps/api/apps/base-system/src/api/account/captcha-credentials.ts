import { decryptSiteSecret } from '../site/site-credentials';

export type CaptchaProvider = 'NONE' | 'TTSHITU' | 'BINGTOP';

/** 数据库中与打码平台有关的字段；密文只在中心内部使用。 */
interface StoredCaptchaFields {
  captchaProvider?: string;
  ttshituUsername?: string;
  ttshituPasswordEncrypted?: string | null;
  bingtopUsername?: string;
  bingtopPasswordEncrypted?: string | null;
}

const SCRIPT_SETTING_ID = 'default';

/**
 * 下发给采集端之前：解密当前所选平台的账号密码，并去掉全部密文和另一个平台的字段。
 * 采集端只会拿到 captchaProvider、captchaUsername、captchaPassword 三项。
 */
export function withCaptchaCredentials<T extends StoredCaptchaFields>(settings: T) {
  const { captchaProvider, ttshituUsername, ttshituPasswordEncrypted, bingtopUsername, bingtopPasswordEncrypted, ...rest } = settings;
  let provider: CaptchaProvider = 'NONE';
  let captchaUsername = '';
  let captchaPassword = '';
  if (captchaProvider === 'TTSHITU') {
    provider = 'TTSHITU';
    if (ttshituUsername && ttshituPasswordEncrypted) {
      captchaUsername = ttshituUsername;
      captchaPassword = decryptSiteSecret(SCRIPT_SETTING_ID, 'ttshitu-password', ttshituPasswordEncrypted);
    }
  } else if (captchaProvider === 'BINGTOP') {
    provider = 'BINGTOP';
    if (bingtopUsername && bingtopPasswordEncrypted) {
      captchaUsername = bingtopUsername;
      captchaPassword = decryptSiteSecret(SCRIPT_SETTING_ID, 'bingtop-password', bingtopPasswordEncrypted);
    }
  }
  return { ...rest, captchaProvider: provider, captchaUsername, captchaPassword };
}

/** 管理端读取：只返回各平台是否已保存密码，不回显密文。 */
export function publicScriptSettings<T extends StoredCaptchaFields>(settings: T) {
  const { ttshituPasswordEncrypted, bingtopPasswordEncrypted, ...fields } = settings;
  return {
    ...fields,
    hasTtshituPassword: Boolean(ttshituPasswordEncrypted),
    hasBingtopPassword: Boolean(bingtopPasswordEncrypted),
  };
}
