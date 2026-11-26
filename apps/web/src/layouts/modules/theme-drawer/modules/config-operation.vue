<script setup lang="ts">
import { useAppStore } from '@/store/modules/app';
import { useThemeStore } from '@/store/modules/theme';
import { $t } from '@/locales';

defineOptions({ name: 'ConfigOperation' });

const appStore = useAppStore();
const themeStore = useThemeStore();

function handleReset() {
  themeStore.resetStore();
  window.$message?.success($t('theme.configOperation.resetSuccessMsg'));
}

function handleSave() {
  try {
    themeStore.saveSettings();
  } catch {
    window.$message?.error($t('theme.configOperation.saveErrorMsg'));
    return;
  }

  window.$message?.success($t('theme.configOperation.saveSuccessMsg'));
  appStore.themeDrawerVisible = false;
}
</script>

<template>
  <p class="config-save-hint">{{ $t('theme.configOperation.saveHint') }}</p>
  <div class="config-actions">
    <ElButton @click="handleReset">{{ $t('theme.configOperation.resetConfig') }}</ElButton>
    <ElButton type="primary" @click="handleSave">{{ $t('theme.configOperation.saveConfig') }}</ElButton>
  </div>
</template>

<style scoped>
.config-save-hint {
  margin: 0 0 10px;
  color: var(--epay-muted);
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
}

.config-actions {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.config-actions :deep(.el-button) {
  width: 100%;
  min-width: 0;
  height: 44px;
  margin: 0;
  border-radius: 12px;
}
</style>