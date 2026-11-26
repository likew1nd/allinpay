/** 运行时和管理端分别只读取需要公开的脚本设置。 */
export const taskSettingsFields = {
  enabled: true, tab1Url: true, tab2Url: true, tab3Url: true,
  minRefreshSeconds: true, maxRefreshSeconds: true, navigationTimeoutSeconds: true,
  maxConcurrentAccounts: true, retryCount: true, actionTimeoutSeconds: true,
  loginMaxAttempts: true, loginTimeoutMinutes: true, sliderOffsetPx: true,
} as const;

/** 打码平台字段（含密文）：只在中心内部读取；下发采集端前必须经 withCaptchaCredentials 解密并去掉密文，管理端读取经 publicScriptSettings。 */
export const captchaSettingsFields = {
  captchaProvider: true, ttshituUsername: true, ttshituPasswordEncrypted: true,
  bingtopUsername: true, bingtopPasswordEncrypted: true,
} as const;

export const agentSettingsFields = {
  ...taskSettingsFields, environmentSyncMinutes: true, qrWaitMinutes: true, updatedAt: true,
} as const;

export const publicSettingsFields = {
  ...agentSettingsFields, ...captchaSettingsFields, id: true, loginCooldownMinutes: true, balanceFreshMinutes: true,
  createdAt: true, updatedBy: true,
} as const;
