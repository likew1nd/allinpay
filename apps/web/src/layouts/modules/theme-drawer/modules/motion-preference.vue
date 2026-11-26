<script setup lang="ts">
import { useThemeStore } from '@/store/modules/theme';
import { $t } from '@/locales';

const themeStore = useThemeStore();
const modes = ['full', 'reduced'] as const;
</script>

<template>
  <section class="appearance-group" aria-labelledby="appearance-motion-title">
    <h3 id="appearance-motion-title" class="appearance-title">{{ $t('theme.motion.title') }}</h3>
    <ElRadioGroup
      v-model="themeStore.motionPreference"
      class="appearance-options"
      :aria-label="$t('theme.motion.title')"
      aria-describedby="appearance-motion-description"
    >
      <ElRadio v-for="mode in modes" :key="mode" :value="mode" border>
        {{ $t(mode === 'full' ? 'theme.motion.full' : 'theme.motion.reduced') }}
      </ElRadio>
    </ElRadioGroup>
    <p id="appearance-motion-description" class="motion-description" role="status">
      {{ $t(themeStore.reducedMotion ? 'theme.motion.reducedDescription' : 'theme.motion.fullDescription') }}
    </p>
  </section>
</template>

<style scoped>
.motion-description {
  min-height: 36px;
  margin: 10px 0 0;
  color: var(--epay-muted);
  font-size: 12px;
  line-height: 1.5;
}
</style>
