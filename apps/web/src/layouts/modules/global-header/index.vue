<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { GLOBAL_HEADER_MENU_ID } from '@/constants/app';
import { $t } from '@/locales';
import { useAppStore } from '@/store/modules/app';
import { useThemeStore } from '@/store/modules/theme';
import { useAuth } from '@/hooks/business/auth';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { request } from '@/service/request';
import { hasReleaseUpdate } from '@/utils/release';
import GlobalLogo from '../global-logo/index.vue';
import GlobalBreadcrumb from '../global-breadcrumb/index.vue';
import GlobalSearch from '../global-search/index.vue';
import ThemeButton from './components/theme-button.vue';

defineOptions({ name: 'GlobalHeader' });

interface Props {
  /** Whether to show the logo */
  showLogo?: App.Global.HeaderProps['showLogo'];
  /** Whether to show the menu toggler */
  showMenuToggler?: App.Global.HeaderProps['showMenuToggler'];
  /** Whether to show the menu */
  showMenu?: App.Global.HeaderProps['showMenu'];
}

defineProps<Props>();

const appStore = useAppStore();
const themeStore = useThemeStore();
const router = useRouter();
const route = useRoute();
const { hasAuth } = useAuth();
const canCheckRelease = computed(() => hasAuth('system-setting:read'));
const updateVersion = ref<string>();
let announcedVersion: string | undefined;

function openReleaseSettings() {
  appStore.openThemeDrawer();
}

async function checkCenterRelease() {
  const { data, error } = await request<{
    managed: boolean;
    source?: boolean;
    current?: string;
    available?: { center?: { version: string } };
  }>({ url: '/releases' });
  if (error || !canCheckRelease.value) return;
  const latest = data?.available?.center?.version;
  updateVersion.value = (data?.managed || data?.source) && data.current && hasReleaseUpdate(data.current, latest) ? latest : undefined;
  if (!updateVersion.value || updateVersion.value === announcedVersion) return;
  announcedVersion = updateVersion.value;
  window.$notification?.({
    title: `中心 v${updateVersion.value} 可更新`,
    message: '点击打开系统设置查看更新',
    type: 'info',
    onClick: openReleaseSettings
  });
}

watch(canCheckRelease, enabled => {
  if (enabled) void checkCenterRelease().catch(() => {});
  else {
    updateVersion.value = undefined;
    announcedVersion = undefined;
  }
}, { immediate: true });
useAutoRefresh(checkCenterRelease, 60_000, canCheckRelease);

function goBack() {
  const previous = router.options.history.state.back;
  if (typeof previous === 'string' && previous.startsWith('/') && !previous.startsWith('//')) {
    router.back();
    return;
  }
  if (route.name === 'fund-management_transfer-strategies' && typeof route.query.strategy === 'string' && route.query.strategy) {
    const query = { ...route.query };
    delete query.strategy;
    router.replace({ path: route.path, query, hash: route.hash });
    return;
  }
  if (route.name === 'account-management_collectors' && typeof route.query.collectorId === 'string' && route.query.collectorId) {
    const query = { ...route.query };
    delete query.collectorId;
    router.replace({ path: route.path, query, hash: route.hash });
    return;
  }
  router.replace({ name: 'root' });
}
</script>

<template>
  <DarkModeContainer class="epay-header h-full flex-y-center px-12px shadow-header">
    <GlobalLogo v-if="showLogo" class="h-full" :style="{ width: themeStore.sider.width + 'px' }" />
    <MenuToggler
      v-if="showMenuToggler || appStore.isMobile"
      :collapsed="appStore.siderCollapse"
      @click="appStore.toggleSiderCollapse"
    />
    <ElTooltip :content="$t('common.back')" :trigger-keys="[]">
      <ElButton class="epay-header-back" text circle :aria-label="$t('common.back')" @click="goBack">
        <SvgIcon icon="tabler:arrow-left" />
      </ElButton>
    </ElTooltip>
    <div v-if="showMenu" :id="GLOBAL_HEADER_MENU_ID" class="h-full flex-y-center flex-1-hidden"></div>
    <div v-else class="epay-breadcrumb h-full flex-y-center flex-1-hidden">
      <span v-if="!appStore.isMobile" class="epay-workspace-label">
        工作空间
        <span>/</span>
      </span>
      <GlobalBreadcrumb v-if="!appStore.isMobile" class="ml-12px" />
    </div>
    <div class="epay-header-actions h-full flex-y-center justify-end">
      <GlobalSearch v-if="themeStore.header.globalSearch.visible" />
      <LangSwitch
        v-if="themeStore.header.multilingual.visible"
        :lang="appStore.locale"
        :lang-options="appStore.localeOptions"
        @change-lang="appStore.changeLocale"
      />
      <ThemeSchemaSwitch
        :theme-schema="themeStore.themeScheme"
        :is-dark="themeStore.darkMode"
        @switch="themeStore.toggleThemeScheme"
      />
      <div>
        <ElTooltip content="通知与证据">
          <ElButton text circle aria-label="通知与证据" @click="router.push('/runtime-monitor/evidence-notifications')">
            <SvgIcon icon="tabler:bell" />
          </ElButton>
        </ElTooltip>
      </div>
      <ThemeButton :update-version="updateVersion" />
    </div>
  </DarkModeContainer>
</template>

<style scoped></style>
