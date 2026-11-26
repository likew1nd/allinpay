<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { useUITable } from '@/hooks/common/table';
import { fetchSiteSyncHistory, fetchSites } from '@/service/api';
import type { SiteSyncRun } from '@/service/api';
import { formatTime } from '@/views/site-management/modules/shared';

type Row = SiteSyncRun & { siteId: string; siteName: string };


const failedCount = computed(() => rows.value.filter(row => row.status === 'FAILED').length);
const runningCount = computed(() => rows.value.filter(row => row.status === 'RUNNING').length);

const { data: rows, loading, getData: load, refreshData } = useUITable({
  immediate: false,
  columns: () => [],
  api: async () => {
    const sitesResult = await fetchSites({ current: 1, size: 100 });
    if (sitesResult.error) return null;
    const histories = await Promise.all(sitesResult.data.records.map(async site => {
      const result = await fetchSiteSyncHistory(site.id, { current: 1, size: 30 });
      if (result.error) return null;
      return result.data.records.map(run => ({ ...run, siteId: site.id, siteName: site.name }));
    }));
    // 任一站点读取失败时保留上次完整结果，避免误显示为批次消失。
    if (histories.some(history => history === null)) return null;
    return (histories as Row[][]).flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  transform: result => result ?? []
});
function statusType(status: string) {
  if (status === 'SUCCEEDED') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'RUNNING') return 'warning';
  return 'info';
}
onMounted(load);
useAutoRefresh(refreshData);
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <ElRow :gutter="16">
      <ElCol :xs="12" :sm="8">
        <ElCard shadow="never">
          <div class="text-muted text-12px">展示批次</div>
          <div class="mt-8px text-26px font-600">{{ rows.length }}</div>
        </ElCard>
      </ElCol>
      <ElCol :xs="12" :sm="8">
        <ElCard shadow="never">
          <div class="text-muted text-12px">运行中</div>
          <div class="mt-8px text-26px text-warning font-600">
            {{ runningCount }}
          </div>
        </ElCard>
      </ElCol>
      <ElCol :xs="12" :sm="8">
        <ElCard shadow="never">
          <div class="text-muted text-12px">失败批次</div>
          <div class="text-danger mt-8px text-26px font-600">
            {{ failedCount }}
          </div>
        </ElCard>
      </ElCol>
    </ElRow>
    <ElCard class="epay-table-card card-wrapper">
      <ElTable v-loading="loading" :data="rows" row-key="id" border>
        <ElTableColumn prop="siteName" label="站点" min-width="160" />
        <ElTableColumn label="状态" width="120">
          <template #default="{ row }">
            <ElTag :type="statusType(row.status)">{{ row.status }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="数据量" width="120">
          <template #default="{ row }">{{ row.orderCount }} / {{ row.expectedCount }}</template>
        </ElTableColumn>
        <ElTableColumn label="采集窗口" min-width="260">
          <template #default="{ row }">{{ formatTime(row.windowStart) }} - {{ formatTime(row.windowEnd) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="mappingVersion" label="映射版本" min-width="140" />
        <ElTableColumn label="创建时间" min-width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="完成时间" min-width="180">
          <template #default="{ row }">{{ formatTime(row.completedAt) }}</template>
        </ElTableColumn>
        <ElTableColumn prop="error" label="失败原因" min-width="220" show-overflow-tooltip />
      </ElTable>
    </ElCard>
  </div>
</template>
