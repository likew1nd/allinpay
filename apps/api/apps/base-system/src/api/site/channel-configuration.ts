import { BadRequestException } from '@nestjs/common';
import { parseChannelConfig } from './source-channel';
import { alipayInterfaces } from '../../../../../libs/shared/site-connector/src/payment-interfaces';

const alipayFields = [
  {
    key: 'sign_type',
    label: '接口加签方式',
    input: 'radio',
    required: true,
    options: [
      { value: '0', label: 'RSA2密钥' },
      { value: '1', label: 'RSA2证书' },
    ],
  },
  { key: 'appid', label: '应用APPID', input: 'text', required: true },
  {
    key: 'appsecret',
    label: '应用私钥',
    input: 'textarea',
    secret: true,
    required: true,
  },
  {
    key: 'appkey',
    label: '支付宝公钥',
    input: 'textarea',
    secret: true,
    required: true,
    signature: '0',
  },
  {
    key: 'app_cert_path',
    label: '应用公钥证书路径',
    input: 'text',
    required: true,
    signature: '1',
  },
  {
    key: 'alipay_cert_path',
    label: '支付宝公钥证书路径',
    input: 'text',
    required: true,
    signature: '1',
  },
  {
    key: 'root_cert_path',
    label: '支付宝根证书路径',
    input: 'text',
    required: true,
    signature: '1',
  },
  {
    key: 'appmchid',
    label: '卖家支付宝用户ID',
    input: 'text',
    placeholder: '可留空，默认为商户签约账号',
  },
];

export function configurationMetadata(row: Record<string, unknown>) {
  const config = parseChannelConfig(row.config);
  const alipay = row.plugin === 'alipay';
  const fields = alipay
    ? alipayFields
    : Object.keys(config).map((key) => ({ key }));
  return {
    plugin: String(row.plugin),
    schema: alipay ? 'alipay' : 'generic',
    apptype: String(row.apptype ?? '')
      .split(',')
      .filter(Boolean),
    interfaces: alipay ? alipayInterfaces : [],
    fields: fields.map((field) => {
      const value = config[field.key];
      const typed = field as (typeof alipayFields)[number];
      return {
        ...field,
        configured: value !== '' && value != null,
        kind: alipay
          ? 'text'
          : Array.isArray(value)
            ? 'array'
            : typeof value === 'boolean'
              ? 'boolean'
              : typeof value === 'number'
                ? 'number'
                : value && typeof value === 'object'
                  ? 'object'
                  : 'text',
        // Only known non-secret fields are returned. Unknown plugin values stay redacted.
        ...(alipay && !typed.secret
          ? { value: String(value ?? (field.key === 'sign_type' ? '0' : '')) }
          : {}),
      };
    }),
  };
}

export function validateAlipayConfiguration(config: string, apptype: string[]) {
  const parsed = parseChannelConfig(config);
  if (
    !apptype.length ||
    apptype.some(
      (value) => !alipayInterfaces.some((option) => option.value === value),
    )
  )
    throw new BadRequestException('请选择有效的可用接口');
  const signature = String(parsed.sign_type ?? '0');
  if (!['0', '1'].includes(signature))
    throw new BadRequestException('接口加签方式无效');
  for (const field of alipayFields) {
    if (!field.required || (field.signature && field.signature !== signature))
      continue;
    if (field.key === 'sign_type') continue;
    if (
      typeof parsed[field.key] !== 'string' ||
      !String(parsed[field.key]).trim()
    )
      throw new BadRequestException('请填写' + field.label);
  }
}
