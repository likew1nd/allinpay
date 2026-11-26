<script setup lang="ts">
import { $t } from '@/locales';

defineOptions({ name: 'GlobalLogo' });
withDefaults(defineProps<{ showTitle?: boolean }>(), { showTitle: true });
</script>

<template>
  <RouterLink to="/" class="epay-brand" :aria-label="$t('system.title')">
    <SystemLogo class="senlin-sidebar-mark" aria-hidden="true" />
    <span v-if="showTitle" class="epay-brand-copy">
      <strong>{{ $t('system.title') }}</strong>
      <small>SENLIN TECHNOLOGY</small>
    </span>
  </RouterLink>
</template>

<style scoped>
.senlin-sidebar-mark {
  width: 40px;
  height: 40px;
}

.epay-brand-copy strong {
  font-size: 18px;
  letter-spacing: 1px;
}
</style>
