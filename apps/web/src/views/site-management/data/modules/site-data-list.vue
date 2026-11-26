<script setup lang="tsx">
import { useTableQuery } from '@/hooks/common/table-query';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { fetchSiteDataList } from '@/service/api';
import type { SiteListStatistics, SiteSearchParams } from '@/service/api';
import { defaultTransform, useUIPaginatedTable } from '@/hooks/common/table';
import { $t } from '@/locales';
import SiteSearch from '../../list/modules/site-search.vue';
import SiteNameCell from '../../modules/site-name-cell.vue';
import SiteDataStatistics from '../../modules/site-data-statistics.vue';
import { formatTime, percent } from '../../modules/shared';

const props = defineProps<{ active: boolean }>();
const router = useRouter();
const route = useRoute();
const failed = ref(false);
const statistics = ref<SiteListStatistics>();
const cards = computed(() => {
  const s = statistics.value;
  return [
    { label: $t('page.site.siteTotal'), icon: 'tabler:world', value: s?.total },
    { label: $t('page.site.onlineCount'), icon: 'tabler:circle-check', value: s?.online, tone: 'green' as const },
    { label: $t('page.site.offlineCount'), icon: 'tabler:plug-off', value: s?.offline, tone: 'amber' as const },
    {
      label: $t('page.site.connectionAttention'),
      icon: 'tabler:alert-circle',
      value: s && s.pending + s.error,
      hint: s && `${$t('page.site.pending')} ${s.pending} · ${$t('page.site.error')} ${s.error}`
    }
  ];
});
let sequence = 0;
const searchParams = ref<SiteSearchParams>({ current: 1, size: 10 });
const { query, applyQuery } = useTableQuery(searchParams);
function viewData(id: string) {
  router.push({ query: { ...route.query, siteId: id, tab: 'channels' } });
}
const { columns, columnChecks, data, loading, getData, getDataByPage, refreshData, mobilePagination } = useUIPaginatedTable({
  onSearch: applyQuery,
  immediate: false,
  api: async () => {
    sequence += 1;
    const requestId = sequence;
    const result = await fetchSiteDataList(query.value);
    if (requestId === sequence) failed.value = Boolean(result.error);
    return result;
  },
  transform: response => {
    statistics.value = response.data?.statistics;
    return defaultTransform(response);
  },
  onPaginationParamsChange: params => {
    searchParams.value.current = query.value.current = params.currentPage ?? 1;
    searchParams.value.size = query.value.size = params.pageSize ?? 10;
  },
  columns: () => [
    {
      prop: 'name',
      label: $t('page.site.name'),
      minWidth: 220,
      fixed: 'left',
      formatter: row => (
        <SiteNameCell name={row.name} baseUrl={row.baseUrl} to={{ query: { ...route.query, siteId: row.id, tab: 'channels' } }} />
      )
    },
    {
      prop: 'channelCount',
      label: $t('page.site.channelCount'),
      width: 100,
      formatter: row => (row.summary?.lastSyncAt ? String(row.summary.channelCount) : '—')
    },
    {
      prop: 'pollingGroupCount',
      label: $t('page.site.groupCount'),
      width: 110,
      formatter: row => (row.summary?.lastSyncAt ? String(row.summary.pollingGroupCount) : '—')
    },
    {
      prop: 'orderCount',
      label: $t('page.site.orderCount'),
      width: 130,
      formatter: row => (row.summary?.lastSyncAt ? String(row.summary.orderCount) : '—')
    },
    {
      prop: 'successRate',
      label: $t('page.site.successRate'),
      width: 110,
      formatter: row => percent(row.summary?.successRate ?? null)
    },
    {
      prop: 'successAmount',
      label: $t('page.site.successAmount'),
      minWidth: 150,
      formatter: row => (row.summary?.lastSyncAt ? row.summary.successAmount : '—')
    },
    {
      prop: 'lastSyncAt',
      label: $t('page.site.lastSync'),
      minWidth: 185,
      formatter: row => formatTime(row.summary?.lastSyncAt)
    },
    {
      prop: 'operate',
      label: $t('common.operate'),
      width: 115,
      fixed: 'right',
      formatter: row => (
        <ElButton type="primary" plain size="small" onClick={() => viewData(row.id)}>
          {$t('page.site.viewData')}
        </ElButton>
      )
    }
  ]
});
async function resetSearch() {
  searchParams.value = { current: 1, size: searchParams.value.size };
  await getDataByPage();
}
watch(
  () => props.active,
  active => {
    if (active) getData();
  },
  { immediate: true }
);
useAutoRefresh(refreshData, undefined, () => props.active);
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <SiteDataStatistics :cards="cards" page="data" />
    <ElCard class="epay-table-card card-wrapper">
      <div class="epay-table-toolbar">
        <SiteSearch
          v-model:model="searchParams"
          hide-connection-status
          @reset="resetSearch"
          @search="getDataByPage()"
        />
      </div>

      <ElAlert v-if="failed" :title="$t('page.site.loadFailed')" type="error" :closable="false" class="mb-12px" />
      <ElTable v-loading="loading" :data="data" row-key="id" border>
        <TableDataColumns :columns="columns" v-model:checks="columnChecks" />
      </ElTable>
      <div class="mt-20px flex justify-end">
        <ElPagination
          v-if="mobilePagination.total"
          layout="total,prev,pager,next,sizes"
          v-bind="mobilePagination"
          @current-change="mobilePagination['current-change']"
          @size-change="mobilePagination['size-change']"
        />
      </div>
    </ElCard>
  </div>
</template>
