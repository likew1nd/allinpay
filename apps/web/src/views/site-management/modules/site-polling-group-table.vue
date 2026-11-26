<script setup lang="tsx">
import { ref, watch } from 'vue';
import { useTableQuery } from '@/hooks/common/table-query';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { fetchSitePollingGroups } from '@/service/api';
import type { OrderCollectionStatistics, SiteDataParams, SitePollingGroup } from '@/service/api';
import { defaultTransform, useUIPaginatedTable } from '@/hooks/common/table';
import { $t } from '@/locales';
import EpaySearchFields from '@/components/custom/epay-search-fields.vue';
import SiteCollectionCards from './site-collection-cards.vue';
import { availability, formatTime, pollingMode } from './shared';

const props = defineProps<{ siteId: string; active: boolean; statisticsTarget: HTMLElement | null }>();
const search = ref<SiteDataParams>({ current: 1, size: 10 });
const { query, applyQuery } = useTableQuery(search);
const failed = ref(false);
const statistics = ref<OrderCollectionStatistics>();
let sequence = 0;
const statuses = ['ENABLED', 'DISABLED', 'UNKNOWN'];
const { columns, columnChecks, data, loading, getData, getDataByPage, refreshData, mobilePagination } =
  useUIPaginatedTable({
    onSearch: applyQuery,
    immediate: false,
    api: async () => {
      const current = ++sequence;
      if (!props.active) return null;
      const result = await fetchSitePollingGroups(props.siteId, { ...query.value, status: query.value.status || undefined });
      if (current === sequence) failed.value = Boolean(result.error);
      return result;
    },
    transform: response => {
      statistics.value = response?.data?.statistics;
      return defaultTransform(response!);
    },
    onPaginationParamsChange: params => {
      search.value.current = query.value.current = params.currentPage ?? 1;
      search.value.size = query.value.size = params.pageSize ?? 10;
    },
    columns: (): UI.TableColumn<SitePollingGroup>[] => [
      { prop: 'code', label: $t('page.site.code'), width: 90 },
      { prop: 'name', label: $t('page.site.name'), minWidth: 150 },
      {
        prop: 'paymentTypeName',
        label: $t('page.site.paymentType'),
        minWidth: 120
      },
      {
        prop: 'status',
        label: $t('page.site.effectiveStatus'),
        width: 140,
        formatter: row => (
          <ElTag type={row.status === 'ENABLED' ? 'success' : 'info'}>{availability(row.status)}</ElTag>
        )
      },
      {
        prop: 'kind',
        label: $t('page.site.mode'),
        minWidth: 140,
        formatter: row => pollingMode(row.kind)
      },
      { prop: 'position', label: $t('page.site.position'), width: 90 },
      {
        prop: 'members',
        label: $t('page.site.members'),
        minWidth: 350,
        formatter: row => (
          <ElSpace wrap>
            {row.members.map(member => (
              <ElTag type={member.enabled ? 'success' : 'info'}>
                {member.channel.name} (#{member.channel.code}) ·{' '}
                {row.kind === 1
                  ? `${$t('page.site.weight')}: ${member.weight}`
                  : `${$t('page.site.position')}: ${member.position + 1}`}{' '}
                · {availability(member.channel.status)}
              </ElTag>
            ))}
          </ElSpace>
        )
      },
      {
        prop: 'updatedAt',
        label: $t('page.site.lastSync'),
        minWidth: 180,
        formatter: row => formatTime(row.updatedAt)
      }
    ]
  });
function reset() {
  search.value = { current: 1, size: search.value.size };
  return getDataByPage();
}
watch(() => props.active, active => {
  if (active) getData();
}, { immediate: true });
useAutoRefresh(refreshData, undefined, () => props.active);
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <SiteCollectionCards
      v-if="active && statisticsTarget"
      :statistics="statistics"
      :has-rows="Boolean(statistics?.cumulative.total)"
      :target="statisticsTarget"
      :scope-note="$t('page.site.pollingGroupOrderScope')"
    />
    <ElCard class="epay-table-card card-wrapper">
      <div class="epay-table-toolbar">
        <EpaySearchFields
          :fields="[
            { key: 'keyword', width: 180, value: search.keyword },
            { key: 'status', width: 144, value: search.status }
          ]"
          :search-disabled="!siteId"
          @search="getDataByPage()"
          @reset="reset"
        >
          <template #keyword>
            <ElInput v-model="search.keyword" clearable placeholder="轮询组名称或编号" aria-label="轮询组名称或编号" />
          </template>
          <template #status>
            <ElSelect v-model="search.status" clearable :placeholder="$t('page.site.effectiveStatus')" :aria-label="$t('page.site.effectiveStatus')">
              <ElOption v-for="status in statuses" :key="status" :value="status" :label="availability(status)" />
            </ElSelect>
          </template>
        </EpaySearchFields>
      </div>

      <ElAlert v-if="failed" :title="$t('page.site.loadFailed')" type="error" :closable="false" class="mb-12px" />
      <p class="mb-12px text-12px opacity-75">
        {{ $t('page.site.readOnlyHint') }}
      </p>
      <div class="min-w-0">
        <ElTable
          v-loading="loading"
          :data="data"
          row-key="id"
          border
          :empty-text="$t(siteId ? 'page.site.noSyncRows' : 'page.site.selectHint')"
        >
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
      </div>
    </ElCard>
  </div>
</template>
