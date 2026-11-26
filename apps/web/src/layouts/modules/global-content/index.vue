<script setup lang="ts">
import { computed } from 'vue';
import { LAYOUT_SCROLL_EL_ID } from '@sa/materials';
import { useAppStore } from '@/store/modules/app';
import { useThemeStore } from '@/store/modules/theme';
import { useRouteStore } from '@/store/modules/route';
import { useTabStore } from '@/store/modules/tab';
import { $t } from '@/locales';

defineOptions({ name: 'GlobalContent' });

interface Props {
  /** Show padding for content */
  showPadding?: boolean;
}

withDefaults(defineProps<Props>(), {
  showPadding: true
});

const appStore = useAppStore();
const themeStore = useThemeStore();
const routeStore = useRouteStore();
const tabStore = useTabStore();

const transitionName = computed(() => {
  if (themeStore.reducedMotion) return '';
  return themeStore.layout.mode === 'vertical' ? 'epay-page' : themeStore.page.animateMode;
});

const descriptions: Record<string, string> = {
  'site-management': '站点状态、同步数据与自动运营，在同一处管理。',
  'account-management': '集中管理账号、采集任务与可用状态。',
  'strategy-center': '配置运营规则，追踪每一次自动调整。',
  'fund-management': '掌握资金流转，清晰处理结算与付款。',
  'runtime-monitor': '从异常到执行证据，快速定位运行问题。',
  'system-settings': '管理团队权限、站点接入与平台配置。'
};

function resetScroll() {
  const el = document.querySelector(`#${LAYOUT_SCROLL_EL_ID}`);

  el?.scrollTo({ left: 0, top: 0 });
}
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <div class="epay-page-content" :class="{ 'p-16px': showPadding, 'is-overview': route.name === 'overview' }">
      <!-- 标题和内容同步退出后再替换，避免新标题将旧页面顶动。 -->
      <Transition
        v-if="
          themeStore.layout.mode === 'vertical' &&
          route.name !== 'account-management_collectors' &&
          route.name !== 'account-management_bindings' &&
          route.name !== 'site-management_data' &&
          route.name !== 'site-management_channels' &&
          route.name !== 'site-management_orders' &&
          !(route.name === 'strategy-center_groups' && route.query.group) &&
          !(
            route.name === 'fund-management_transfer-strategies' &&
            typeof route.query.strategy === 'string' &&
            !['', 'new', 'template'].includes(route.query.strategy)
          )
        "
        :name="transitionName"
        mode="out-in"
        appear
      >
        <div
          :key="tabStore.getTabIdByRoute(route)"
          :class="{ 'epay-page-intro epay-page-heading': route.name !== 'overview' }"
        >
          <template v-if="route.name !== 'overview'">
            <div class="epay-page-heading-main">
              <span class="epay-page-heading-icon" aria-hidden="true">
                <SvgIcon :icon="route.meta.icon || 'tabler:layout-dashboard'" :local-icon="route.meta.localIcon" />
              </span>
              <div class="epay-page-heading-copy">
                <h1>{{ route.meta.i18nKey ? $t(route.meta.i18nKey) : route.meta.title }}</h1>
                <p>{{ descriptions[String(route.name).split('_')[0]] || '管理工作事项，所有操作与数据保持同步。' }}</p>
              </div>
            </div>
          </template>
        </div>
      </Transition>
      <Transition
        :name="transitionName"
        mode="out-in"
        appear
        @before-leave="appStore.setContentXScrollable(true)"
        @after-leave="resetScroll"
        @after-enter="appStore.setContentXScrollable(false)"
      >
        <KeepAlive :include="routeStore.cacheRoutes" :exclude="routeStore.excludeCacheRoutes">
          <component
            :is="Component"
            v-if="appStore.reloadFlag"
            :key="tabStore.getTabIdByRoute(route)"
            class="epay-page-view"
          />
        </KeepAlive>
      </Transition>
    </div>
  </RouterView>
</template>
