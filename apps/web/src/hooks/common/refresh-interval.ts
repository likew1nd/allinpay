import { computed } from 'vue';
import { useThemeStore } from '@/store/modules/theme';

export const refreshSeconds = [3, 5, 10] as const;

/** 所有业务列表和关联统计共用页面功能中的自动刷新周期。 */
export function useRefreshInterval() {
  const themeStore = useThemeStore();
  const seconds = computed(() => {
    const value = themeStore.page.autoRefreshSeconds;
    return refreshSeconds.includes(value) ? value : 5;
  });
  return { seconds, interval: computed(() => seconds.value * 1000) };
}
