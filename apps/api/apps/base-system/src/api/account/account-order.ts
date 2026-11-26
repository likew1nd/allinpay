export interface AccountOrderKey {
  id: string;
  profileNo: string | null;
  externalId: string;
}

/** 列表上显示的“编号”：优先用环境编号，没有时回退到环境 ID（与前端显示保持一致）。 */
function displayNo(item: AccountOrderKey) {
  return item.profileNo?.trim() || item.externalId;
}

/**
 * 环境列表排序：按编号的数字大小升序，纯数字编号排在非数字编号之前；编号相同再按 id，保证每次刷新顺序完全一致。
 * 纯数字编号按“去前导零后先比位数、再比字符”处理，不会出现字符串排序时 1000 排在 355 前面的问题，也不受数字长度限制。
 */
export function compareAccountOrder(a: AccountOrderKey, b: AccountOrderKey): number {
  const left = displayNo(a);
  const right = displayNo(b);
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) {
    const l = left.replace(/^0+(?=\d)/, '');
    const r = right.replace(/^0+(?=\d)/, '');
    if (l.length !== r.length) return l.length - r.length;
    if (l !== r) return l < r ? -1 : 1;
  } else if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  } else if (left !== right) {
    return left < right ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
