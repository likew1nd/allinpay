<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { SimpleScrollbar } from '@sa/materials';
import type { RouteKey } from '@elegant-router/types';
import { useAppStore } from '@/store/modules/app';
import { useRouteStore } from '@/store/modules/route';
import { useThemeStore } from '@/store/modules/theme';
import { useMenu } from '../../../context';
import MenuItem from '../components/menu-item.vue';
import { getMenuScrollTop } from './menu-scroll';

defineOptions({ name: 'VerticalMenu' });

const route = useRoute();
const appStore = useAppStore();
const routeStore = useRouteStore();
const { selectedKey, selectedKeyDummy, handleSelect } = useMenu();

// const inverted = computed(() => !themeStore.darkMode && themeStore.sider.inverted);

const toggleBesideOverview = computed(() => !appStore.siderCollapse && routeStore.menus.some(item => item.key === 'overview'));
const expandedKeys = ref<string[]>([]);
const menuRoot = ref<HTMLElement>();
const menuTrack = ref<HTMLElement>();
const indicator = ref<HTMLElement>();
const themeStore = useThemeStore();
const indicatorStyle = ref<Record<string, string>>({ opacity: '0' });
let menuResizeObserver: ResizeObserver | undefined;
let previousActive: HTMLElement | undefined;
let stretch: Animation | undefined;
let revealRequest = 0;

function getActiveMenu() {
  return Array.from(
    menuTrack.value?.querySelectorAll<HTMLElement>(
      '.el-menu-item.is-active, .el-sub-menu.is-active > .el-sub-menu__title'
    ) ?? []
  )
    .reverse()
    .find(
      el => el.getBoundingClientRect().height > 0 && !el.closest('.el-menu')?.closest('.el-sub-menu:not(.is-opened)')
    );
}

function cancelMenuReveal() {
  revealRequest += 1;
}

async function revealMenu(key?: string) {
  revealRequest += 1;
  const request = revealRequest;
  await nextTick();
  if (appStore.siderCollapse || !menuTrack.value) return;

  // 等待菜单收放完成，避免用动画中的旧位置滚动。
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  if (request !== revealRequest || !menuTrack.value) return;
  const animations = Array.from(menuTrack.value.querySelectorAll('.el-menu--inline')).flatMap(el => el.getAnimations());
  await Promise.allSettled(animations.map(animation => animation.finished));
  await nextTick();
  if (request !== revealRequest || appStore.siderCollapse) return;

  const viewport = menuRoot.value?.querySelector<HTMLElement>('.simplebar-content-wrapper');
  const target = key
    ? menuTrack.value?.querySelector<HTMLElement>(`[data-menu-key="${CSS.escape(key)}"]`)
    : getActiveMenu();
  if (!viewport || !target || !viewport.clientHeight) return;
  const bounds = target.getBoundingClientRect();
  if (!bounds.height) return;
  const top = getMenuScrollTop({
    scrollTop: viewport.scrollTop,
    viewportHeight: viewport.clientHeight,
    scrollHeight: viewport.scrollHeight,
    itemTop: bounds.top - viewport.getBoundingClientRect().top + viewport.scrollTop,
    itemHeight: bounds.height
  });
  if (Math.abs(top - viewport.scrollTop) < 1) return;
  viewport.scrollTo({ top, behavior: themeStore.reducedMotion ? 'instant' : 'smooth' });
}

function handleMenuToggle(key: string) {
  updateMenuIndicator();
  revealMenu(key);
}

async function updateMenuIndicator() {
  await nextTick();
  const root = menuTrack.value;
  if (!root) return;
  const active = getActiveMenu();
  if (!active) {
    indicatorStyle.value = { opacity: '0' };
    previousActive = undefined;
    return;
  }

  const rootRect = root.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  const width = `${rootRect.right - activeRect.left}px`;
  const height = `${activeRect.height}px`;
  // 独立位移避免伸缩同时放大菜单坐标。
  const translate = `${activeRect.left - rootRect.left}px ${activeRect.top - rootRect.top}px`;
  const changed = active !== previousActive;
  if (
    !changed &&
    indicatorStyle.value.width === width &&
    indicatorStyle.value.height === height &&
    indicatorStyle.value.translate === translate
  )
    return;

  const animate = Boolean(previousActive && changed && !themeStore.reducedMotion);
  // 底板与菜单同处滚动内容中；尺寸变化即时跟随，只有选择变化播放滑动。
  indicatorStyle.value = {
    opacity: '1',
    width,
    height,
    translate,
    transition: animate || stretch?.playState === 'running' ? '' : 'none'
  };
  previousActive = active;
  if (animate && indicator.value) {
    const scale = getComputedStyle(indicator.value).scale;
    stretch?.cancel();
    stretch = indicator.value.animate([{ scale }, { scale: '1 1.08', offset: 0.35 }, { scale: '1 1' }], {
      duration: 380,
      easing: 'ease-out'
    });
  }
}

function updateExpandedKeys() {
  if (appStore.siderCollapse || !selectedKey.value) {
    expandedKeys.value = [];
    return;
  }
  expandedKeys.value = routeStore.getSelectedMenuKeyPath(selectedKey.value);
}

watch(
  [() => route.name, () => appStore.siderCollapse],
  () => {
    updateExpandedKeys();
    updateMenuIndicator();
    revealMenu();
  },
  { immediate: true }
);

watch([selectedKeyDummy, () => appStore.siderCollapse, expandedKeys], updateMenuIndicator, { flush: 'post' });
watch(
  () => themeStore.reducedMotion,
  value => {
    if (value) stretch?.cancel();
  }
);

onMounted(() => {
  updateMenuIndicator();
  revealMenu();
  if (menuRoot.value) {
    menuResizeObserver = new ResizeObserver(updateMenuIndicator);
    menuResizeObserver.observe(menuRoot.value);
    if (menuTrack.value) menuResizeObserver.observe(menuTrack.value);
    const menu = menuRoot.value.querySelector('.el-menu');
    if (menu) menuResizeObserver.observe(menu);
  }
});

onBeforeUnmount(() => {
  cancelMenuReveal();
  menuResizeObserver?.disconnect();
  stretch?.cancel();
});
</script>

<template>
  <div
    ref="menuRoot"
    class="epay-menu-root"
    @wheel.passive="cancelMenuReveal"
    @touchstart.passive="cancelMenuReveal"
    @pointerdown="cancelMenuReveal"
  >
    <SimpleScrollbar>
      <div ref="menuTrack" class="epay-menu-track">
        <div v-if="!toggleBesideOverview" class="epay-nav-toggle epay-nav-toggle-standalone">
          <MenuToggler :collapsed="appStore.siderCollapse" @click="appStore.toggleSiderCollapse" />
        </div>
        <div ref="indicator" class="epay-menu-indicator" :style="indicatorStyle" aria-hidden="true"></div>
        <ElMenu
          mode="vertical"
          :default-active="selectedKeyDummy"
          :default-openeds="expandedKeys"
          :collapse="appStore.siderCollapse"
          :collapse-transition="false"
          @open="handleMenuToggle"
          @close="handleMenuToggle"
          @select="val => handleSelect(val as RouteKey)"
        >
          <template v-for="item in routeStore.menus" :key="item.key">
            <li v-if="toggleBesideOverview && item.key === 'overview'" role="none" class="epay-nav-toggle epay-overview-toggle">
              <MenuToggler @click="appStore.toggleSiderCollapse" />
            </li>
            <MenuItem :item="item" :index="item.key" />
          </template>
        </ElMenu>
      </div>
    </SimpleScrollbar>
  </div>
</template>

<style scoped>
.epay-menu-root {
  padding-block: 8px;
}

.epay-menu-root :deep(.simplebar-content-wrapper) {
  overscroll-behavior-y: contain;
  overflow-anchor: none;
  scroll-padding-block: 8px;
}

.epay-menu-root :deep(.el-menu) {
  --el-menu-item-height: 44px;
  --el-transition-duration: 220ms;
}

.epay-menu-root :deep(.el-menu > .el-menu-item),
.epay-menu-root :deep(.el-menu > .el-sub-menu) {
  margin-top: 0;
}

.epay-menu-root :deep(.el-menu > .el-menu-item),
.epay-menu-root :deep(.el-menu > .el-sub-menu > .el-sub-menu__title) {
  margin-bottom: 4px;
}

.epay-menu-root :deep(.el-menu--inline > .el-menu-item) {
  height: 44px;
  margin-bottom: 2px;
}

.epay-menu-root :deep(.el-sub-menu__icon-arrow) {
  transition: transform 220ms var(--epay-ease);
}

.epay-menu-root :deep(.el-menu-item:focus-visible),
.epay-menu-root :deep(.el-sub-menu:focus-visible > .el-sub-menu__title) {
  outline: 2px solid var(--epay-blue);
  outline-offset: -3px;
}
</style>
