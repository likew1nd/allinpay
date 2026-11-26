import { computed, onActivated, onDeactivated, ref, toValue, watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core';
import { useRefreshInterval } from './refresh-interval';

/** 自动刷新统一入口：后台静默刷新，隐藏/缓存页面暂停，同一轮完成前不重入。 */
export function useAutoRefresh(
  refresh: () => Promise<unknown>,
  interval: MaybeRefOrGetter<number> | undefined = undefined,
  enabled: MaybeRefOrGetter<boolean> = true
) {
  const configuredInterval = interval ?? useRefreshInterval().interval;
  const active = ref(true);
  const visibility = useDocumentVisibility();
  let refreshing = false;
  onActivated(() => { active.value = true; });
  onDeactivated(() => { active.value = false; });
  const canRefresh = computed(() => active.value && visibility.value === 'visible' && toValue(enabled));
  const { pause, resume } = useIntervalFn(async () => {
    if (!canRefresh.value || refreshing) return;
    // 确认框和行内确认浮层打开时，不移动用户即将操作的目标。
    if (typeof document !== 'undefined' && Array.from(document.querySelectorAll?.('.el-message-box__wrapper, .el-popconfirm') ?? [])
      .some(element => element.getClientRects().length > 0)) return;
    // 输入筛选条件时不提交半成品查询；复选框和普通按钮不阻止刷新。
    const focused = typeof document === 'undefined' ? null : document.activeElement;
    if (!focused?.closest?.('[data-auto-refresh-setting]') && focused?.matches('textarea, select, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])')) return;
    refreshing = true;
    try {
      await refresh();
    } catch (error) {
      // 请求层负责用户提示，这里阻止定时回调产生未处理的 Promise 拒绝。
      console.warn('自动刷新失败，将在下一周期重试', error);
    } finally {
      refreshing = false;
    }
  }, configuredInterval, { immediate: false });
  watch(canRefresh, value => { if (value) resume(); else pause(); }, { immediate: true, flush: 'sync' });
}
