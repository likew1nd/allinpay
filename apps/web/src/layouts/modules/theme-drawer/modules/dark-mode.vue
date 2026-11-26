<script setup lang="ts">
import { themeSchemaRecord } from '@/constants/app';
import { useThemeStore } from '@/store/modules/theme';
import { $t } from '@/locales';
import SettingItem from '../components/setting-item.vue';

defineOptions({ name: 'DarkMode' });

const themeStore = useThemeStore();

const icons: Record<UnionKey.ThemeScheme, string> = {
  light: 'material-symbols:sunny',
  dark: 'material-symbols:nightlight-rounded'
};
</script>

<template>
  <section class="appearance-group" aria-labelledby="appearance-theme-title">
    <h3 id="appearance-theme-title" class="appearance-title">{{ $t('theme.themeSchema.title') }}</h3>
    <ElRadioGroup
      v-model="themeStore.themeScheme"
      class="appearance-options"
      :aria-label="$t('theme.themeSchema.title')"
    >
      <ElRadio v-for="(label, key) in themeSchemaRecord" :key="key" :value="key" border>
        <span class="theme-option-label">
          <SvgIcon :icon="icons[key]" class="theme-option-icon" />
          <span>{{ $t(label) }}</span>
        </span>
      </ElRadio>
    </ElRadioGroup>
    <div class="appearance-rows theme-accessibility">
      <SettingItem :label="$t('theme.grayscale')">
        <ElSwitch v-model="themeStore.grayscale" :aria-label="$t('theme.grayscale')" />
      </SettingItem>
      <SettingItem :label="$t('theme.colourWeakness')">
        <ElSwitch v-model="themeStore.colourWeakness" :aria-label="$t('theme.colourWeakness')" />
      </SettingItem>
    </div>
  </section>
</template>

<style scoped>
.theme-option-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.theme-option-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.theme-accessibility {
  margin-top: 8px;
}
</style>
