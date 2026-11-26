<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fetchSite, fetchSites } from '@/service/api';
import type { SiteRecord } from '@/service/api';
import { $t } from '@/locales';

defineProps<{ placeholder?: string }>();
const value = defineModel<string>();
const options = ref<SiteRecord[]>([]);
const selected = ref<SiteRecord | null>(null);
const loading = ref(false);
let sequence = 0;
const items = computed(() =>
  selected.value && !options.value.some(item => item.id === selected.value?.id)
    ? [selected.value, ...options.value]
    : options.value
);
async function search(keyword = '') {
  sequence += 1;
  const requestId = sequence;
  loading.value = true;
  try {
    const result = await fetchSites({ current: 1, size: 100, keyword });
    if (requestId === sequence) options.value = result.error ? [] : result.data.records;
  } finally {
    if (requestId === sequence) loading.value = false;
  }
}
watch(
  value,
  async id => {
    selected.value = null;
    if (!id) return;
    const result = await fetchSite(id);
    if (id === value.value && !result.error) selected.value = result.data;
  },
  { immediate: true }
);
search();
</script>

<template>
  <ElSelect
    v-model="value"
    :aria-label="$t('page.site.selectSite')"
    :placeholder="placeholder ?? $t('page.site.selectSite')"
    filterable
    remote
    :remote-method="search"
    :loading="loading"
    class="max-w-full w-260px"
  >
    <ElOption v-for="site in items" :key="site.id" :value="site.id" :label="site.name" />
  </ElSelect>
</template>
