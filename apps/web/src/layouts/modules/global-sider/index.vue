<script setup lang="ts">
import { computed } from 'vue';
import { GLOBAL_SIDER_MENU_ID } from '@/constants/app';
import { useAppStore } from '@/store/modules/app';
import { useThemeStore } from '@/store/modules/theme';
import { useAuthStore } from '@/store/modules/auth';
import GlobalLogo from '../global-logo/index.vue';
import VerticalMenu from '../global-menu/modules/vertical-menu.vue';
import UserAvatar from '../global-header/components/user-avatar.vue';

defineOptions({ name: 'GlobalSider' });
const appStore = useAppStore();
const themeStore = useThemeStore();
const authStore = useAuthStore();
const isMix = computed(() => themeStore.layout.mode.includes('mix'));
</script>

<template>
  <DarkModeContainer class="epay-sider size-full flex-col-stretch" :inverted="false">
    <GlobalLogo v-if="!isMix" :show-title="!appStore.siderCollapse" />
    <div :id="GLOBAL_SIDER_MENU_ID" class="flex-1-hidden">
      <VerticalMenu v-if="themeStore.layout.mode === 'vertical'" />
    </div>
    <div v-if="!isMix" class="epay-sider-footer">
      <div v-if="!appStore.siderCollapse" class="epay-session">
        <span></span>
        当前已登录 · {{ authStore.userInfo.roles.includes('ROLE_SUPER') ? '管理员' : '运营工作空间' }}
      </div>
      <div class="epay-header-user">
        <UserAvatar />
      </div>
    </div>
  </DarkModeContainer>
</template>
