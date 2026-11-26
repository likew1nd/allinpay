<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { useUITable } from '@/hooks/common/table';
import { fetchAdjustments, fetchSiteDataList } from '@/service/api';
import type { AdjustmentRecord } from '@/service/api';
import { useAuth } from '@/hooks/business/auth';
import { connectionLabel, connectionType, formatTime, structureLabel } from '@/views/site-management/modules/shared';

type ExceptionRow = {
  id: string;
  siteId: string;
  siteName: string;
  kind: string;
  reason: string;
  at: string | null;
};
const router = useRouter();
const { hasAuth } = useAuth();

const adjustments = ref<AdjustmentRecord[]>([]);

const exceptions = computed<ExceptionRow[]>(() => {
  const result: ExceptionRow[] = [];
  for (const site of sites.value) {
    if (site.automationPaused)
      result.push({
        id: `site-${site.id}-paused`,
        siteId: site.id,
        siteName: site.name,
        kind: '自动调整已停止',
        reason: '当前站点自动调整已停止，可在站点列表中检查后启用',
        at: null
      });
    if (site.connectionStatus !== 'ONLINE')
      result.push({
        id: `site-${site.id}-connection`,
        siteId: site.id,
        siteName: site.name,
        kind: '站点连接',
        reason: connectionLabel(site.connectionStatus),
        at: site.lastHeartbeatAt ?? null
      });
    if (site.structureStatus === 'INCOMPATIBLE')
      result.push({
        id: `site-${site.id}-structure`,
        siteId: site.id,
        siteName: site.name,
        kind: '结构兼容',
        reason: structureLabel(site.structureStatus),
        at: site.lastHeartbeatAt ?? null
      });
    if (site.summary?.stale || !site.summary?.lastSyncAt)
      result.push({
        id: `site-${site.id}-sync`,
        siteId: site.id,
        siteName: site.name,
        kind: '数据同步',
        reason: site.summary?.latest?.error || '数据未同步或已过期',
        at: site.summary?.lastSyncAt ?? null
      });
  }
  for (const adjustment of adjustments.value.filter(row => ['FAILED', 'EXPIRED'].includes(row.status))) {
    result.push({
      id: adjustment.id,
      siteId: adjustment.siteId,
      siteName: adjustment.siteId,
      kind: '策略执行',
      reason: adjustment.failureReason || adjustment.status,
      at: adjustment.completedAt || adjustment.createdAt
    });
  }
  return result;
});
const counts = computed(() => ({
  total: exceptions.value.length,
  sites: new Set(exceptions.value.map(row => row.siteId)).size,
  failed: exceptions.value.filter(row => row.kind === '策略执行').length,
  paused: sites.value.filter(site => site.automationPaused).length
}));

const { data: sites, loading, getData: load, refreshData } = useUITable({
  immediate: false,
  columns: () => [],
  api: () => Promise.all([
    hasAuth('site:read') ? fetchSiteDataList({ current: 1, size: 100 }) : null,
    hasAuth('adjustment:read') ? fetchAdjustments({ current: 1, size: 100 }) : null
  ]),
  isResponseValid: results => results.every(result => !result?.error),
  transform: ([siteResult, adjustmentResult]) => {
    adjustments.value = adjustmentResult?.data?.records ?? [];
    return siteResult?.data?.records ?? [];
  }
});
onMounted(load);
useAutoRefresh(refreshData);
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <ElRow :gutter="16">
      <ElCol :xs="12" :sm="6">
        <ElCard shadow="never">
          <div class="text-muted text-12px">异常与待处理</div>
          <div class="text-danger mt-8px text-26px font-600">
            {{ counts.total }}
          </div>
        </ElCard>
      </ElCol>
      <ElCol :xs="12" :sm="6">
        <ElCard shadow="never">
          <div class="text-muted text-12px">受影响站点</div>
          <div class="mt-8px text-26px font-600">{{ counts.sites }}</div>
        </ElCard>
      </ElCol>
      <ElCol :xs="12" :sm="6">
        <ElCard shadow="never">
          <div class="text-muted text-12px">调整失败或过期</div>
          <div class="mt-8px text-26px text-warning font-600">
            {{ counts.failed }}
          </div>
        </ElCard>
      </ElCol>
      <ElCol :xs="12" :sm="6">
        <ElCard shadow="never">
          <div class="text-muted text-12px">自动调整已停止</div>
          <div class="mt-8px text-26px text-warning font-600">
            {{ counts.paused }}
          </div>
        </ElCard>
      </ElCol>
    </ElRow>
    <ElCard class="epay-table-card card-wrapper">
      <ElAlert
        title="暂停项用于检查自动调整状态；确认后请到站点列表启用，启用后由策略重新评估。"
        type="info"
        :closable="false"
        class="mb-16px"
      />
      <ElTable v-loading="loading" :data="exceptions" row-key="id" border>
        <ElTableColumn prop="siteName" label="站点" min-width="180" />
        <ElTableColumn prop="kind" label="异常类型" width="140" />
        <ElTableColumn prop="reason" label="原因" min-width="260" />
        <ElTableColumn label="时间" min-width="180">
          <template #default="{ row }">{{ formatTime(row.at) }}</template>
        </ElTableColumn>
        <ElTableColumn label="站点状态" width="120">
          <template #default="{ row }">
            <ElTag :type="connectionType(sites.find(site => site.id === row.siteId)?.connectionStatus || 'ERROR')">
              {{ connectionLabel(sites.find(site => site.id === row.siteId)?.connectionStatus || 'ERROR') }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn v-if="hasAuth('site:read')" label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <ElButton
              size="small"
              @click="
                router.push({
                  path: '/site-management/list',
                  query: { siteId: row.siteId }
                })
              "
            >
              查看站点
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElEmpty v-if="!loading && !exceptions.length" description="当前没有异常或待处理项" />
    </ElCard>
  </div>
</template>
