<script setup lang="ts">
import { useAppStore } from '@/store/modules/app';
import { $t } from '@/locales';
import DarkMode from './modules/dark-mode.vue';
import MotionPreference from './modules/motion-preference.vue';
import PageFun from './modules/page-fun.vue';
import ConfigOperation from './modules/config-operation.vue';
import ReleaseUpdate from './modules/release-update.vue';

defineOptions({ name: 'ThemeDrawer' });

const appStore = useAppStore();
</script>

<template>
  <ElDrawer
    v-model="appStore.themeDrawerVisible"
    class="appearance-drawer"
    :title="$t('theme.themeDrawerTitle')"
    :size="380"
  >
    <div class="appearance-sections">
      <ReleaseUpdate />
      <DarkMode />
      <MotionPreference />
      <PageFun />
    </div>
    <template #footer>
      <ConfigOperation />
    </template>
  </ElDrawer>
</template>

<style>
.appearance-drawer.el-drawer:not(.epay-mobile-navigation) {
  height: calc(100dvh - 24px);
  max-height: calc(100dvh - 24px);
}

.appearance-drawer .el-drawer__header {
  flex-shrink: 0;
  padding: 16px 20px;
}

.appearance-drawer .el-drawer__close-btn {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 10px;
  background: var(--epay-tint);
}

.appearance-drawer .el-drawer__body {
  flex: 1;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.appearance-drawer .el-drawer__footer {
  flex-shrink: 0;
  padding: 14px 16px;
}

.appearance-drawer .appearance-sections {
  display: grid;
  gap: 12px;
}

.appearance-drawer .appearance-group {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--epay-edge);
  border-radius: 16px;
  background: var(--epay-control);
}

.appearance-drawer .appearance-title {
  margin: 0 0 12px;
  color: var(--epay-heading);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}

.appearance-drawer .appearance-options {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.appearance-drawer .appearance-options .el-radio {
  width: 100%;
  min-width: 0;
  height: auto;
  min-height: 44px;
  margin: 0;
  padding: 10px;
  border-color: var(--epay-edge);
  border-radius: 10px;
  background: var(--epay-tint);
}

.appearance-drawer .appearance-options .el-radio.is-checked {
  border-color: var(--epay-blue);
  background: var(--epay-soft);
}

.appearance-drawer .appearance-options .el-radio__label {
  min-width: 0;
  padding-left: 8px;
  color: var(--epay-text);
  font-size: 13px;
  line-height: 1.5;
  white-space: normal;
}

.appearance-drawer .appearance-options .is-checked .el-radio__label {
  color: var(--epay-action-ink);
  font-weight: 600;
}

.appearance-drawer .appearance-rows {
  display: grid;
}

.appearance-drawer .appearance-rows > .appearance-setting + .appearance-setting {
  border-top: 1px solid var(--epay-edge);
}

.appearance-drawer .appearance-setting :is(.el-select, .el-input, .el-input-number) {
  width: 120px;
  min-width: 0;
  max-width: 100%;
}

.appearance-drawer .appearance-setting .el-switch {
  height: 44px;
}

@media (max-width: 640px) {
  .appearance-drawer.el-drawer:not(.epay-mobile-navigation) {
    height: calc(100dvh - 16px);
    max-height: calc(100dvh - 16px);
  }
}
</style>
