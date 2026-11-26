<script setup lang="ts">
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { useUITable } from '@/hooks/common/table';
import { onMounted, ref } from 'vue';
import { fetchAdjustments } from '@/service/api';
import { actionLabels, statusLabels } from './labels';

const current = ref(1);
const total = ref(0);
const { data: rows, loading, getData: load, refreshData } = useUITable({
  immediate: false,
  columns: () => [],
  api: () => fetchAdjustments({ current: current.value, size: 20 }),
  isResponseValid: result => !result.error,
  transform: result => {
    total.value = result.data!.total;
    return result.data!.records;
  },
  onFetched: () => {
    const lastPage = Math.max(1, Math.ceil(total.value / 20));
    if (current.value > lastPage) { current.value = lastPage; void load(); }
  }
});
onMounted(load);
useAutoRefresh(refreshData);
</script>

<template>
  <ElCard class="epay-table-card card-wrapper">
    <ElTable v-loading="loading" :data="rows" row-key="id" border>
      <ElTableColumn type="expand">
        <template #default="{ row }">
          <div class="grid grid-cols-2 gap-16px p-16px">
            <div>
              调整前
              <pre class="overflow-auto text-12px">{{ JSON.stringify(row.beforeState, null, 2) }}</pre>
            </div>
            <div>
              目标状态
              <pre class="overflow-auto text-12px">{{
                JSON.stringify(row.desiredState?.command?.desiredState ?? {}, null, 2)
              }}</pre>
            </div>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="createdAt" label="创建时间" min-width="180" />
      <ElTableColumn label="策略组 / 模板" min-width="180">
        <template #default="{ row }">
          {{ row.desiredState?.groupName || '旧策略' }}
          <br />
          {{ row.desiredState?.templateName || '—' }}
        </template>
      </ElTableColumn>
      <ElTableColumn prop="ruleName" label="命中规则" min-width="150" />
      <ElTableColumn prop="siteId" label="站点" min-width="170" />
      <ElTableColumn label="对象" min-width="150">
        <template #default="{ row }">
          {{ row.target.groupCode ? `轮询组 ${row.target.groupCode} / ` : '' }}通道
          {{ row.desiredState?.affectedChannelCode || row.desiredState?.channelCode || row.target.channelCode || '—' }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="动作" min-width="130">
        <template #default="{ row }">
          {{ actionLabels[row.action] || row.action }}
        </template>
      </ElTableColumn>
      <ElTableColumn prop="status" label="状态" width="120">
        <template #default="{ row }">
          <ElTag :type="row.status === 'SUCCEEDED' ? 'success' : row.status === 'FAILED' ? 'danger' : 'warning'">
            {{ statusLabels[row.status] || row.status }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="failureReason" label="结果说明" min-width="220" />
      <ElTableColumn prop="completedAt" label="完成时间" min-width="180" />
    </ElTable>
    <ElPagination
      v-model:current-page="current"
      :page-size="20"
      :total="total"
      layout="total, prev, pager, next"
      class="mt-16px justify-end"
      @current-change="load"
    />
  </ElCard>
</template>
