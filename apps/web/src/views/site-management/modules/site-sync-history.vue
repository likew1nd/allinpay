<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { fetchSiteSyncHistory } from '@/service/api';
import type { SiteSyncRun } from '@/service/api';
import { $t } from '@/locales';
import { formatTime } from './shared';

const props = defineProps<{ siteId: string }>();
const visible = defineModel<boolean>('visible', { required: true });
const history = ref<SiteSyncRun[]>([]);
const current = ref(1);
const total = ref(0);
const loading = ref(false);
const failed = ref(false);
let sequence = 0;
function statusLabel(status: string) {
  if (status === 'SUCCESS') return $t('page.site.syncSuccess');
  if (status === 'RUNNING') return $t('page.site.syncRunning');
  return $t('page.site.syncFailed');
}
let fetching = false;
async function refresh(silent = false) {
  if (silent && fetching) return;
  sequence += 1;
  const requestId = sequence;
  if (!props.siteId || !visible.value) return;
  fetching = true;
  if (!silent) loading.value = true;
  try {
    const result = await fetchSiteSyncHistory(props.siteId, { current: current.value, size: 5 });
    if (requestId !== sequence) return;
    failed.value = Boolean(result.error);
    if (!result.error) {
      history.value = result.data.records;
      total.value = result.data.total;
    }
  } finally {
    if (requestId === sequence) {
      fetching = false;
      loading.value = false;
    }
  }
}
watch([() => props.siteId, visible], () => {
  history.value = [];
  total.value = 0;
  current.value = 1;
  failed.value = false;
  fetching = false;
  loading.value = false;
  refresh();
});
useAutoRefresh(() => refresh(true), undefined, () => visible.value);
</script>

<template>
  <ElDialog v-model="visible" :title="$t('page.site.syncHistory')" width="1000px" class="max-w-[calc(100%-32px)]">
    <ElAlert v-if="failed" :title="$t('page.site.loadFailed')" type="error" :closable="false" class="mb-12px" />
    <ElTable v-loading="loading" :data="history" row-key="id" border>
      <ElTableColumn :label="$t('page.site.checkResult')" width="130">
        <template #default="{ row }">
          <ElTag :type="row.status === 'SUCCESS' ? 'success' : row.status === 'FAILED' ? 'danger' : 'info'">
            {{ statusLabel(row.status) }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn :label="$t('page.site.syncCount')" width="160">
        <template #default="{ row }">{{ row.orderCount }} / {{ row.expectedCount }}</template>
      </ElTableColumn>
      <ElTableColumn :label="$t('page.site.syncStarted')" min-width="180">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </ElTableColumn>
      <ElTableColumn :label="$t('page.site.syncCompleted')" min-width="180">
        <template #default="{ row }">{{ formatTime(row.completedAt) }}</template>
      </ElTableColumn>
      <ElTableColumn prop="error" :label="$t('page.site.lastError')" min-width="180" />
    </ElTable>
    <div class="mt-16px flex justify-end">
      <ElPagination
        v-if="total"
        v-model:current-page="current"
        :page-size="5"
        :total="total"
        layout="total,prev,pager,next"
        @current-change="refresh()"
      />
    </div>
    <template #footer>
      <ElButton @click="visible = false">{{ $t('common.close') }}</ElButton>
    </template>
  </ElDialog>
</template>
