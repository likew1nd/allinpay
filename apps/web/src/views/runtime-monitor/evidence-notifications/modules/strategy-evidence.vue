<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { fetchAdjustments } from '@/service/api';
import { useUITable } from '@/hooks/common/table';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { formatTime } from '@/views/site-management/modules/shared';
const { data: rows, loading, getData: load, refreshData } = useUITable({
  immediate: false,
  columns: () => [],
  api: () => fetchAdjustments({ current: 1, size: 100 }),
  transform: result => result.data?.records.filter(row => ['FAILED', 'EXPIRED', 'SKIPPED'].includes(row.status)) ?? []
});
const urgent = computed(() => rows.value.filter(row => ['FAILED', 'EXPIRED'].includes(row.status)).length);
const skipped = computed(() => rows.value.filter(row => row.status === 'SKIPPED').length);
onMounted(load);
useAutoRefresh(refreshData);
</script>

<template>
  <div>
    <ElAlert :closable="false" type="info" class="mb-16px" title="来源：最近 100 条策略调整记录中的失败、过期和跳过项。此记录独立于 Telegram 启用时间，保留原有查询入口。" />
    <div class="mb-16px flex flex-wrap items-center gap-16px">
      <span>待关注 {{ urgent }}</span><span>已跳过 {{ skipped }}</span><span>合计 {{ rows.length }}</span>
    </div>
    <ElTable v-loading="loading" :data="rows" row-key="id" border>
      <ElTableColumn label="时间" min-width="180"><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></ElTableColumn>
      <ElTableColumn prop="siteId" label="站点" min-width="160" />
      <ElTableColumn prop="strategyId" label="策略" min-width="180" />
      <ElTableColumn prop="action" label="动作" min-width="200" />
      <ElTableColumn label="状态" width="120"><template #default="{ row }"><ElTag :type="row.status === 'FAILED' ? 'danger' : row.status === 'EXPIRED' ? 'warning' : 'info'">{{ row.status }}</ElTag></template></ElTableColumn>
      <ElTableColumn prop="failureReason" label="原因" min-width="240" show-overflow-tooltip />
      <ElTableColumn label="完成时间" min-width="180"><template #default="{ row }">{{ formatTime(row.completedAt) }}</template></ElTableColumn>
    </ElTable>
  </div>
</template>
