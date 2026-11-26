<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '@/store/modules/app';
import { $t } from '@/locales';

defineOptions({ name: 'ThemeButton' });

interface Props {
  /** 有可用的中心新版本时显示红点 */
  updateVersion?: string;
}

const props = defineProps<Props>();

const appStore = useAppStore();

// 有中心新版时，在提示文字里说明红点的原因
const tooltip = computed(() =>
  props.updateVersion
    ? `${$t('theme.themeDrawerTitle')} · 中心 v${props.updateVersion} 可更新`
    : $t('theme.themeDrawerTitle')
);
</script>

<template>
  <ElBadge is-dot :hidden="!updateVersion">
    <ButtonIcon icon="tabler:adjustments-horizontal" :tooltip-content="tooltip" @click="appStore.openThemeDrawer" />
  </ElBadge>
</template>

<style scoped></style>
