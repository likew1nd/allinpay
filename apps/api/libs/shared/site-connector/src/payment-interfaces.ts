/** Interface choices belong to the payment plugin, not the plugin's display title. */
export const alipayInterfaces = [
  '电脑网站支付',
  '手机网站支付',
  '当面付扫码',
  '当面付JS',
  '预授权支付(线上)',
  'APP支付',
  'JSAPI支付',
  '订单码支付',
  '预授权支付(线下)',
  '预授权支付(小程序)',
].map((label, index) => ({ value: String(index + 1), label }));

export function availablePaymentInterfaces(
  plugin: string,
  apptype: unknown,
): string[] {
  const selected = [
    ...new Set(
      String(apptype ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  const options = plugin === 'alipay' ? alipayInterfaces : [];
  return selected.map(
    (value) =>
      options.find((option) => option.value === value)?.label ??
      `接口 ${value}`,
  );
}
