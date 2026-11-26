<script setup lang="ts">
import { computed } from 'vue';
import { themePageAnimationModeOptions, themeScrollModeOptions } from '@/constants/app';
import { useThemeStore } from '@/store/modules/theme';
import { refreshSeconds } from '@/hooks/common/refresh-interval';
import { translateOptions } from '@/utils/common';
import { $t } from '@/locales';
import SettingItem from '../components/setting-item.vue';

defineOptions({ name: 'PageFun' });

const themeStore = useThemeStore();

const layoutMode = computed(() => themeStore.layout.mode);

const isMixLayoutMode = computed(() => layoutMode.value.includes('mix'));

const isWrapperScrollMode = computed(() => themeStore.layout.scrollMode === 'wrapper');
</script>

<template>
  <section class="appearance-group" aria-labelledby="appearance-page-title">
    <h3 id="appearance-page-title" class="appearance-title">{{ $t('theme.pageFunTitle') }}</h3>
    <TransitionGroup tag="div" name="setting-list" class="appearance-rows">
      <SettingItem key="auto-refresh" :label="$t('theme.page.autoRefresh')" data-auto-refresh-setting>
        <ElSelect
          v-model="themeStore.page.autoRefreshSeconds"
          :aria-label="$t('theme.page.autoRefresh')"
          size="small"
          class="w-120px"
        >
          <ElOption
            v-for="seconds in refreshSeconds"
            :key="seconds"
            :label="$t('theme.page.refreshSeconds', { seconds })"
            :value="seconds"
          />
        </ElSelect>
      </SettingItem>
      <SettingItem key="1" :label="$t('theme.scrollMode.title')">
        <ElSelect v-model="themeStore.layout.scrollMode" :aria-label="$t('theme.scrollMode.title')" size="small" class="w-120px">
          <ElOption
            v-for="{ label, value } in translateOptions(themeScrollModeOptions)"
            :key="value"
            :label="label"
            :value="value"
          />
        </ElSelect>
      </SettingItem>

      <SettingItem v-if="!themeStore.reducedMotion" key="1-2" :label="$t('theme.page.mode.title')">
        <ElSelect v-model="themeStore.page.animateMode" :aria-label="$t('theme.page.mode.title')" size="small" class="w-120px">
          <ElOption
            v-for="{ label, value } in translateOptions(themePageAnimationModeOptions)"
            :key="value"
            :label="label"
            :value="value"
          />
        </ElSelect>
      </SettingItem>
      <SettingItem v-if="isWrapperScrollMode" key="2" :label="$t('theme.fixedHeaderAndTab')">
        <ElSwitch v-model="themeStore.fixedHeaderAndTab" :aria-label="$t('theme.fixedHeaderAndTab')" />
      </SettingItem>
      <SettingItem v-if="isMixLayoutMode" key="6-3" :label="$t('theme.sider.mixWidth')">
        <ElInputNumber v-model="themeStore.sider.mixWidth" size="small" :step="1" class="w-120px" />
      </SettingItem>
      <SettingItem v-if="isMixLayoutMode" key="6-4" :label="$t('theme.sider.mixCollapsedWidth')">
        <ElInputNumber v-model="themeStore.sider.mixCollapsedWidth" size="small" :step="1" class="w-120px" />
      </SettingItem>
      <SettingItem v-if="layoutMode === 'vertical-mix'" key="6-5" :label="$t('theme.sider.mixChildMenuWidth')">
        <ElInputNumber v-model="themeStore.sider.mixChildMenuWidth" size="small" :step="1" class="w-120px" />
      </SettingItem>
      <SettingItem key="8" :label="$t('theme.watermark.visible')">
        <ElSwitch v-model="themeStore.watermark.visible" :aria-label="$t('theme.watermark.visible')" />
      </SettingItem>
      <SettingItem v-if="themeStore.watermark.visible" key="8-1" :label="$t('theme.watermark.enableUserName')">
        <ElSwitch v-model="themeStore.watermark.enableUserName" :aria-label="$t('theme.watermark.enableUserName')" />
      </SettingItem>
      <SettingItem v-if="themeStore.watermark.visible" key="8-2" :label="$t('theme.watermark.text')">
        <ElInput
          v-model="themeStore.watermark.text"
          :aria-label="$t('theme.watermark.text')"
          autosize
          type="text"
          size="small"
          class="w-120px"
          placeholder="Epay"
        />
      </SettingItem>
    </TransitionGroup>
  </section>
</template>

<style scoped>
.setting-list-move,
.setting-list-enter-active,
.setting-list-leave-active {
  --uno: transition-all-300;
}

.setting-list-enter-from,
.setting-list-leave-to {
  --uno: opacity-0 -translate-x-30px;
}

.setting-list-leave-active {
  --uno: absolute;
}
</style>
