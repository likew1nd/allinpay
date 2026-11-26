<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { fetchSiteSummary } from '@/service/api';
import type { SiteSummary } from '@/service/api';
import { $t } from '@/locales';
import { formatTime } from './shared';
const props = defineProps<{ siteId: string }>();
const summary = ref<SiteSummary | null>(null);
const failed = ref(false);
let sequence = 0;
async function refresh() {
  sequence += 1;
  const current = sequence;
  if (!props.siteId) {
    summary.value = null;
    return;
  }
  const result = await fetchSiteSummary(props.siteId);
  if (current !== sequence) return;
  failed.value = Boolean(result.error);
  if (!result.error) summary.value = result.data;
}
watch(
  () => props.siteId,
  () => {
    summary.value = null;
    failed.value = false;
    refresh();
  },
  { immediate: true }
);
useAutoRefresh(refresh, undefined, () => Boolean(props.siteId));
defineExpose({ refresh });
</script>

<template>
  <div v-if="siteId" class="flex-col gap-8px">
    <ElAlert v-if="failed" :title="$t('page.site.loadFailed')" type="error" :closable="false" />
    <template v-else-if="summary">
      <ElAlert
        :type="!summary.lastSyncAt || summary.stale ? 'warning' : 'success'"
        :closable="false"
        :title="
          $t(
            summary.lastSyncAt
              ? summary.stale
                ? 'page.site.dataStale'
                : 'page.site.dataFresh'
              : 'page.site.waitingSync'
          )
        "
      />
      <p class="text-12px opacity-75">
        {{ $t('page.site.lastSync') }}: {{ formatTime(summary.lastSyncAt) }} · {{ $t('page.site.coverage') }}:
        {{ formatTime(summary.windowStart) }} ~ {{ formatTime(summary.windowEnd) }}
      </p>
      <ElAlert v-if="summary.latest?.error" :title="summary.latest.error" type="error" :closable="false" />
    </template>
  </div>
</template>
