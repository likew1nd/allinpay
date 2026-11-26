<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '@/hooks/business/auth';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { useRefreshInterval } from '@/hooks/common/refresh-interval';
import { useUITable } from '@/hooks/common/table';
import { fetchAdjustments, fetchAllSiteOrders, fetchCollectorStatistics, fetchSiteDataList } from '@/service/api';
import type { AdjustmentRecord, CollectorStatistics, OrderListStatistics, SiteDataRecord, SiteListStatistics } from '@/service/api';
import EpaySegments from '@/components/custom/epay-segments.vue';
import SiteCollectionCards from '@/views/site-management/modules/site-collection-cards.vue';
import SiteDetailsDialog from '@/views/site-management/modules/site-details-dialog.vue';
import SiteNameCell from '@/views/site-management/modules/site-name-cell.vue';
import { connectionLabel, connectionType, formatOrderRate, formatTime } from '@/views/site-management/modules/shared';
import SiteChart from './modules/site-chart.vue';
import { actionLabels, statusLabels } from '@/views/strategy-center/adjustments/labels';

const router = useRouter();
const { hasAuth } = useAuth();
const canSites = computed(() => hasAuth('site:read'));
const canCollectors = computed(() => hasAuth('collector:read'));
const canAdjustments = computed(() => hasAuth('adjustment:read'));
const hasDataAccess = computed(() => canSites.value || canCollectors.value || canAdjustments.value);
const adjustments = ref<AdjustmentRecord[]>([]);
const collectors = ref<CollectorStatistics>();
const orders = ref<OrderListStatistics>();
const siteStats = ref<SiteListStatistics>();
const totalSites = ref(0);
const refreshedAt = ref('');
const failed = ref(false);
const filter = ref('all');
const search = ref('');
const detailVisible = ref(false);
const detailSiteId = ref('');
const { seconds: refreshSeconds } = useRefreshInterval();

const { data: sites, loading, refreshData } = useUITable({
  columns: () => [],
  api: async () => {
    const [site, order, collector, adjustment] = await Promise.all([
      canSites.value ? fetchSiteDataList({ current: 1, size: 100 }) : null,
      canSites.value ? fetchAllSiteOrders({ current: 1, size: 1 }) : null,
      canCollectors.value ? fetchCollectorStatistics() : null,
      canAdjustments.value ? fetchAdjustments({ current: 1, size: 10 }) : null
    ]);
    return { site, order, collector, adjustment };
  },
  isResponseValid: ({ site, order, collector, adjustment }) => {
    failed.value = Boolean(site?.error || order?.error || collector?.error || adjustment?.error);
    return !failed.value;
  },
  transform: ({ site, order, collector, adjustment }) => {
    orders.value = order?.data?.statistics;
    collectors.value = collector?.data ?? undefined;
    adjustments.value = adjustment?.data?.records ?? [];
    siteStats.value = site?.data?.statistics;
    totalSites.value = site?.data?.total ?? 0;
    refreshedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    return site?.data?.records ?? [];
  }
});
useAutoRefresh(refreshData, undefined, () => hasDataAccess.value && !detailVisible.value);

function syncLabel(site: SiteDataRecord) {
  if (site.summary?.latest?.status === 'FAILED') return '同步失败';
  if (!site.summary?.lastSyncAt) return '尚未同步';
  return site.summary.stale ? '快照已过期' : '正常';
}
const exceptions = computed(() => sites.value.filter(site => site.connectionStatus !== 'ONLINE' || syncLabel(site) !== '正常'));
const pausedCount = computed(() => sites.value.filter(site => site.automationPaused).length);
const filteredSites = computed(() => {
  const rows = filter.value === 'exceptions' ? exceptions.value : sites.value;
  const keyword = search.value.trim().toLowerCase();
  return rows.filter(site => (filter.value !== 'paused' || site.automationPaused) && `${site.name} ${site.baseUrl}`.toLowerCase().includes(keyword));
});
const rankedSites = computed(() => sites.value.filter(site => site.summary?.lastSyncAt)
  .sort((a, b) => b.summary!.orderCount - a.summary!.orderCount).slice(0, 8));
const executionIssues = computed(() => adjustments.value.filter(row => row.status === 'FAILED' || row.status === 'EXPIRED').length);
const emptyLabel = computed(() => failed.value ? '数据暂不可用' : loading.value ? '正在读取数据' : '暂无同步数据');
const siteScope = computed(() => sites.value.length < totalSites.value ? `前 ${sites.value.length} / ${totalSites.value} 个站点` : `全部 ${totalSites.value} 个站点`);
function openSite(id: string) {
  detailSiteId.value = id;
  detailVisible.value = true;
}
</script>

<template>
  <div class="epay-overview">
    <header class="epay-page-heading epay-statistics-heading">
      <div class="epay-page-heading-main">
        <span class="epay-page-heading-icon" aria-hidden="true"><SvgIcon icon="tabler:layout-dashboard" /></span>
        <div class="epay-page-heading-copy">
          <h1>{{ $t('route.overview') }}</h1>
          <p v-if="hasDataAccess">{{ refreshedAt ? `最近更新 ${refreshedAt}` : emptyLabel }} · 每 {{ refreshSeconds }} 秒刷新</p>
          <ElButton v-if="canSites" link type="primary" @click="router.push('/site-management/orders')">查看订单明细 →</ElButton>
        </div>
      </div>
      <SiteCollectionCards v-if="canSites" :statistics="orders?.collections" :status-counts="orders" :has-rows="Boolean(orders)" scope-note="全部已同步站点。" />
    </header>
    <ElAlert v-if="failed" :title="refreshedAt ? '本轮更新失败，保留上次完整数据。' : '暂时无法读取运营数据，将在下一轮自动重试。'" type="warning" :closable="false" />
    <ElEmpty v-if="!hasDataAccess" description="当前账号无运营数据查看权限" />
    <div v-else :class="canSites ? 'epay-overview-middle' : ''">
      <section v-if="canSites" class="epay-panel epay-chart-panel">
        <div class="epay-panel-heading">
          <h2>站点订单量排行</h2>
          <span class="epay-caption-chip">已同步快照 · 最多 8 站</span>
        </div>
        <p class="epay-statistics__hint mt-12px">{{ refreshedAt ? `范围：${siteScope}，按快照内订单量排序。` : emptyLabel }}</p>
        <div class="epay-chart-legend mt-12px"><span><i></i>订单量</span><span><i></i>成功率</span></div>
        <SiteChart v-if="rankedSites.length" :sites="rankedSites" />
        <ElEmpty v-else :description="emptyLabel" :image-size="68" />
      </section>
      <section class="epay-panel epay-tasks-panel">
        <div class="epay-panel-heading"><h2>运行巡检</h2></div>
        <div class="epay-task-list">
          <button v-if="canSites" class="epay-task" @click="router.push('/site-management/data')">
            <span class="epay-color-icon"><SvgIcon icon="tabler:world" /></span>
            <span><strong>在线站点　{{ siteStats ? `${siteStats.online} / ${siteStats.total}` : '—' }}</strong>
              <small>{{ siteStats ? `离线 ${siteStats.offline} · 待连接 ${siteStats.pending} · 错误 ${siteStats.error}` : emptyLabel }}</small></span>
            <span class="epay-task-chevron">›</span>
          </button>
          <button v-if="canCollectors" class="epay-task" @click="router.push('/account-management/collectors')">
            <span class="epay-color-icon"><SvgIcon icon="tabler:device-desktop-code" /></span>
            <span><strong>采集端在线　{{ collectors ? `${collectors.collectors.online} / ${collectors.collectors.total}` : '—' }}</strong>
              <small>{{ collectors ? `环境 ${collectors.environments.total} · 监控开启 ${collectors.environments.monitoring} · 异常账号 ${collectors.environments.abnormal}` : emptyLabel }}</small></span>
            <span class="epay-task-chevron">›</span>
          </button>
          <button v-if="canAdjustments" class="epay-task" @click="router.push('/strategy-center/adjustments')">
            <span class="epay-color-icon"><SvgIcon icon="tabler:history" /></span>
            <span><strong>策略执行异常　{{ refreshedAt ? executionIssues : '—' }}</strong>
              <small>{{ refreshedAt ? `最近 ${adjustments.length} 条执行记录中的失败或过期数` : emptyLabel }}</small></span>
            <span class="epay-task-chevron">›</span>
          </button>
        </div>
      </section>
    </div>
    <section v-if="canSites" class="epay-panel epay-overview-sites">
      <div class="epay-panel-heading">
        <h2>站点经营明细</h2>
        <ElButton link type="primary" @click="router.push('/site-management/data')">全部站点 →</ElButton>
      </div>
      <div class="epay-site-toolbar">
        <EpaySegments v-model="filter" label="站点筛选" :options="[
          { value: 'all', label: '全部', count: refreshedAt ? sites.length : undefined },
          { value: 'exceptions', label: '需关注', count: refreshedAt ? exceptions.length : undefined },
          { value: 'paused', label: '自动调整已停', count: refreshedAt ? pausedCount : undefined }
        ]" />
        <ElInput v-model="search" placeholder="搜索站点名称或域名" aria-label="搜索站点名称或域名" clearable class="epay-site-search" />
      </div>
      <ElTable v-loading="loading" :data="filteredSites" row-key="id" :empty-text="refreshedAt ? '暂无符合条件的站点' : emptyLabel" max-height="520">
        <ElTableColumn label="站点" min-width="210">
          <template #default="{ row }"><SiteNameCell :name="row.name" :base-url="row.baseUrl" :to="{ path: '/site-management/data', query: { siteId: row.id, tab: 'channels' } }" /></template>
        </ElTableColumn>
        <ElTableColumn label="成功订单金额" min-width="145" align="right">
          <template #default="{ row }">{{ row.summary?.lastSyncAt ? row.summary.successAmount : '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="订单量 / 成功率" min-width="145" align="right">
          <template #default="{ row }">{{ row.summary?.lastSyncAt ? `${row.summary.orderCount.toLocaleString()} / ${formatOrderRate(row.summary.successRate)}` : '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="通道 / 轮询组" min-width="118" align="center">
          <template #default="{ row }">{{ row.summary?.lastSyncAt ? `${row.summary.channelCount} / ${row.summary.pollingGroupCount}` : '—' }}</template>
        </ElTableColumn>
        <ElTableColumn label="连接 / 同步" min-width="180">
          <template #default="{ row }">
            <ElTag size="small" :type="connectionType(row.connectionStatus)">{{ connectionLabel(row.connectionStatus) }}</ElTag>
            <span class="ml-8px">{{ syncLabel(row) }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="自动调整" width="100">
          <template #default="{ row }">{{ row.automationPaused ? '已停止' : '已开启' }}</template>
        </ElTableColumn>
        <ElTableColumn label="最近同步" min-width="170">
          <template #default="{ row }">{{ formatTime(row.summary?.lastSyncAt) }}</template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="88" fixed="right">
          <template #default="{ row }"><ElButton link type="primary" @click="openSite(row.id)">详情</ElButton></template>
        </ElTableColumn>
      </ElTable>
      <div v-if="refreshedAt" class="epay-overview-foot">{{ siteScope }} · 金额与订单量来自各站点最近完整快照</div>
    </section>
    <section v-if="canAdjustments" class="epay-panel epay-recent-panel">
      <div class="epay-panel-heading">
        <h2>最近策略执行</h2>
        <ElButton link type="primary" @click="router.push('/strategy-center/adjustments')">策略日志 →</ElButton>
      </div>
      <div v-for="row in adjustments.slice(0, 5)" :key="row.id" class="epay-recent-row">
        <span>{{ sites.find(site => site.id === row.siteId)?.name || row.siteId }} · {{ row.ruleName || actionLabels[row.action] || row.action }}</span>
        <span class="epay-time">{{ formatTime(row.createdAt) }}</span>
        <ElTag size="small" :type="row.status === 'SUCCEEDED' ? 'success' : row.status === 'FAILED' ? 'danger' : 'warning'">{{ statusLabels[row.status] || row.status }}</ElTag>
      </div>
      <ElEmpty v-if="!adjustments.length" :description="refreshedAt ? '暂无策略执行记录' : emptyLabel" :image-size="48" />
    </section>
    <SiteDetailsDialog v-if="canSites" v-model:visible="detailVisible" :site-id="detailSiteId" />
  </div>
</template>
