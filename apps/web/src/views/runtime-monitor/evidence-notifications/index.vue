<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { fetchNotificationIncidents, acknowledgeNotification } from '@/service/api/telegram';
import type { NotificationIncident } from '@/service/api/telegram';
import { useAuth } from '@/hooks/business/auth';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { useUIPaginatedTable } from '@/hooks/common/table';
import { formatTime } from '@/views/site-management/modules/shared';
import StrategyEvidence from './modules/strategy-evidence.vue';
const { hasAuth } = useAuth();
const tab = ref(hasAuth('notification:read') ? 'incidents' : 'strategy');
const status = ref('OPEN');
const acknowledging = ref(false);
const { data: rows, loading, getData: load, refreshData, getDataByPage, pagination } = useUIPaginatedTable<
  Awaited<ReturnType<typeof fetchNotificationIncidents>> | null,
  NotificationIncident
>({
  immediate: false,
  columns: () => [],
  paginationProps: { pageSize: 20 },
  api: async (): Promise<Awaited<ReturnType<typeof fetchNotificationIncidents>> | null> => {
    if (!hasAuth('notification:read')) return null;
    return fetchNotificationIncidents({ current: pagination.currentPage ?? 1, size: 20, status: status.value || undefined });
  },
  transform: (result): { data: NotificationIncident[]; total: number; pageNum: number; pageSize: number } => ({
    data: result?.data?.records ?? [],
    total: result?.data?.total ?? 0,
    pageNum: pagination.currentPage ?? 1,
    pageSize: 20
  })
});
async function acknowledge(id: string) {
  if (acknowledging.value) return;
  acknowledging.value = true;
  try {
    const result = await acknowledgeNotification(id);
    if (!result.error) await load();
  } finally {
    acknowledging.value = false;
  }
}
onMounted(load);
useAutoRefresh(refreshData, undefined, () => tab.value === 'incidents' && hasAuth('notification:read') && !acknowledging.value);
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <ElCard class="card-wrapper">
      <ElAlert class="mb-16px" type="info" :closable="false" title="事件来自账号采集、采集端离线检测和策略执行失败。确认告警不会改变业务状态；Telegram 投递结果在系统设置中查看。" />
      <ElTabs v-model="tab"><ElTabPane label="业务异常" name="incidents">
      <ElEmpty v-if="!hasAuth('notification:read')" description="暂无通知查看权限" />
      <template v-else>
        <div class="mb-16px flex flex-wrap gap-8px">
          <ElSelect v-model="status" class="w-160px" @change="getDataByPage()"><ElOption label="当前异常" value="OPEN" /><ElOption label="全部事件" value="" /></ElSelect>
        </div>
        <ElTable v-loading="loading" :data="rows" row-key="id" border>
          <ElTableColumn prop="entityType" label="来源类型" min-width="130" />
          <ElTableColumn prop="title" label="事件" min-width="180" />
          <ElTableColumn prop="id" label="事件 ID" min-width="220" show-overflow-tooltip />
          <ElTableColumn prop="entityId" label="业务对象" min-width="220" show-overflow-tooltip />
          <ElTableColumn label="发生时间" min-width="180"><template #default="{ row }">{{ formatTime(row.occurredAt) }}</template></ElTableColumn>
          <ElTableColumn label="恢复时间" min-width="180"><template #default="{ row }">{{ formatTime(row.recoveredAt) }}</template></ElTableColumn>
          <ElTableColumn label="确认状态" width="120"><template #default="{ row }">{{ row.acknowledgedAt ? '已确认' : '未确认' }}</template></ElTableColumn>
          <ElTableColumn v-if="hasAuth('notification:update')" label="操作" width="90"><template #default="{ row }"><ElButton v-if="!row.acknowledgedAt" link type="primary" @click="acknowledge(row.id)">确认</ElButton></template></ElTableColumn>
        </ElTable>
        <ElPagination v-model:current-page="pagination.currentPage" class="mt-16px" :total="pagination.total" :page-size="20" layout="total, prev, pager, next" />
      </template>
      </ElTabPane>
      <ElTabPane label="策略调整记录" name="strategy">
        <StrategyEvidence v-if="tab === 'strategy' && hasAuth('adjustment:read')" />
        <ElEmpty v-else-if="!hasAuth('adjustment:read')" description="暂无策略记录查看权限" />
      </ElTabPane>
      </ElTabs>
    </ElCard>
  </div>
</template>