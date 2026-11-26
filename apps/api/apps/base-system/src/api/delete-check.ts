import { IsIn } from 'class-validator';

// 删除前检查的统一返回结构：收款账号、转账策略、站点策略（策略组）共用。
// blockers 非空表示不能删除，items 逐项列出占用方，前端据此提示“需要先脱离哪些绑定”。
export interface DeleteBlockerItem {
  id: string;
  label: string;
  hint?: string;
}
export interface DeleteBlocker {
  kind: string;
  title: string;
  items: DeleteBlockerItem[];
}
export interface DeleteCheck {
  name: string;
  canDelete: boolean;
  blockers: DeleteBlocker[];
  /** 没有占用时，删除会自动处理的事项（如作废待领取的转账单），弹窗里提前告知 */
  willAutoHandle: string[];
}

export function deleteCheckOf(name: string, blockers: DeleteBlocker[], willAutoHandle: string[]): DeleteCheck {
  const active = blockers.filter(blocker => blocker.items.length > 0);
  return { name, canDelete: active.length === 0, blockers: active, willAutoHandle };
}

/** 服务端拒绝删除时的报错文案：和弹窗里列的内容一致，直接调接口的人也能看明白 */
export function blockedMessage(check: DeleteCheck): string {
  const detail = check.blockers
    .map(blocker => `${blocker.title}（${blocker.items.slice(0, 5).map(item => item.label).join('、')}${blocker.items.length > 5 ? ' 等' : ''}）`)
    .join('；');
  return `无法删除“${check.name}”：${detail}`;
}

/** 删除请求必须带 confirm: '删除'，和前端弹窗里要求手动输入的两个字一致，避免绕过前端误调接口 */
export class DeleteConfirmDto {
  @IsIn(['删除'], { message: '请输入“删除”二字确认' }) confirm!: string;
}
