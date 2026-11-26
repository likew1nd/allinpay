<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import type { ScrollbarInstance } from 'element-plus';
import dayjs from 'dayjs';
import { fetchAccountMonitoringLogs } from '@/service/api';
import type { AccountRecord, MonitoringLogEntry } from '@/service/api';
import { $t } from '@/locales';

const props = defineProps<{ collectorId: string; account: AccountRecord | null }>();
const visible = defineModel<boolean>('visible', { default: false });
const records = ref<MonitoringLogEntry[]>([]);
const newestFirstRecords = computed(() => [...records.value].reverse());
const scrollbarRef = ref<ScrollbarInstance>();

const loading = ref(false);
let fetching = false;
const failed = ref(false);
let requestVersion = 0;

async function load(silent = false) {
  if (!visible.value || !props.account || (silent && fetching)) return;
  requestVersion += 1;
  const version = requestVersion;
  fetching = true;
  if (!silent) loading.value = true;
  try {
    const result = await fetchAccountMonitoringLogs(props.collectorId, props.account.id);
    if (version !== requestVersion) return;
    failed.value = Boolean(result.error);
    if (!result.error) records.value = result.data.records;
  } catch {
    if (version === requestVersion) failed.value = true;
  } finally {
    if (version === requestVersion) { loading.value = false; fetching = false; }
  }
}

watch(
  () => [visible.value, props.collectorId, props.account?.id] as const,
  () => {
    requestVersion += 1;
    loading.value = false;
    fetching = false;
    records.value = [];
    failed.value = false;
    if (visible.value) load();
  },
  { immediate: true, flush: 'sync' }
);

useAutoRefresh(() => load(true), undefined, () => visible.value);
onDeactivated(() => {
  visible.value = false;
});
onBeforeUnmount(() => {
  requestVersion += 1;
});
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="$t('page.collector.monitoringLogs')"
    width="min(calc(100vw - 32px), 820px)"
    top="10vh"
    destroy-on-close
  >
    <div class="mb-12px flex flex-wrap items-center justify-between gap-12px">
      <span class="min-w-0 break-all">{{ account?.profileNo || account?.externalId }} · {{ account?.name }}</span>
    </div>
    <p class="text-muted mb-12px text-12px">{{ $t('page.collector.monitoringLogsHint') }}</p>
    <ElAlert
      v-if="failed"
      class="mb-12px"
      :title="$t('page.collector.monitoringLogsFailed')"
      type="error"
      :closable="false"
      show-icon
    />
    <div v-loading="loading" :aria-busy="loading">
      <ElScrollbar ref="scrollbarRef" height="min(55vh, 440px)">
        <ol
          v-if="records.length"
          class="m-0 list-none p-0"
          role="log"
          aria-live="off"
          :aria-label="$t('page.collector.monitoringLogs')"
        >
          <li
            v-for="(entry, index) in newestFirstRecords"
            :key="index"
            class="flex flex-wrap items-baseline gap-x-16px gap-y-4px py-8px text-14px"
          >
            <time :datetime="entry.at" class="shrink-0 font-mono">
              {{ dayjs(entry.at).format('YYYY-MM-DD HH:mm:ss') }}
            </time>
            <div class="min-w-0 flex-1 basis-240px">
              <div class="whitespace-pre-wrap break-words">{{ entry.message }}</div>
              <div v-if="entry.url" class="text-muted mt-4px break-all text-12px">{{ entry.url }}</div>
            </div>
          </li>
        </ol>
        <ElEmpty v-else-if="!loading && !failed" :description="$t('page.collector.monitoringLogsEmpty')" />
      </ElScrollbar>
    </div>
    <template #footer>
      <ElButton @click="visible = false">{{ $t('common.close') }}</ElButton>
    </template>
  </ElDialog>
</template>
