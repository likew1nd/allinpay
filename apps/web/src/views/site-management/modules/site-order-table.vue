<script setup lang="tsx">
import { ref, watch } from 'vue';
import { ElCard } from 'element-plus';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { useTableQuery } from '@/hooks/common/table-query';
import { defaultTransform, useUIPaginatedTable } from '@/hooks/common/table';
import { fetchAllSiteOrders, fetchSiteOrders } from '@/service/api';
import type { OrderListStatistics, SiteDataParams, SiteOrder } from '@/service/api';
import { $t } from '@/locales';
import EpaySearchFields from '@/components/custom/epay-search-fields.vue';
import SiteNameCell from './site-name-cell.vue';
import SiteCollectionCards from './site-collection-cards.vue';
import { formatTime, orderLabel } from './shared';

const props = defineProps<{ siteId?: string; channelCode?: string; active: boolean; embedded?: boolean; statisticsTarget?: HTMLElement | null }>();
const search = ref<SiteDataParams>({ current: 1, size: 10, channelCode: props.channelCode });
const filtersExpanded = ref(Boolean(props.channelCode));
const dates = ref<[Date, Date] | null>(null);
const { query, applyQuery } = useTableQuery(() => ({
  ...search.value,
  status: search.value.status || undefined,
  sourceStatus: search.value.sourceStatus || undefined,
  channelCode: search.value.channelCode?.trim() || undefined,
  start: dates.value?.[0].toISOString(),
  end: dates.value?.[1].toISOString()
}));
const selected = ref<SiteOrder | null>(null);
const drawerVisible = ref(false);
const failed = ref(false);
const statistics = ref<OrderListStatistics>();
let sequence = 0;
const metricStatuses = ['SUCCESS', 'FAILED', 'PROCESSING', 'EXCLUDED'];
const paymentStatuses = {
  0: ['unpaid', 'info'],
  1: ['paid', 'success'],
  2: ['refunded', 'danger'],
  3: ['frozen', 'warning'],
  4: ['preauthorized', 'primary']
} as const;
function paymentStatus(status: string) {
  const code = /^\d+$/.test(status) ? Number(status) : NaN;
  const entry = paymentStatuses[code as keyof typeof paymentStatuses];
  return {
    label: entry ? $t(`page.site.paymentStatuses.${entry[0]}`) : $t('page.site.paymentStatuses.unknown', { code: status }),
    color: entry?.[1] ?? 'info'
  } as const;
}
function orderColor(status: string): UI.ThemeColor {
  if (status === 'SUCCESS') return 'success';
  if (status === 'FAILED') return 'danger';
  return 'info';
}
const { columns, columnChecks, data, loading, getData, getDataByPage, refreshData, mobilePagination } =
  useUIPaginatedTable({
    onSearch: applyQuery,
    immediate: false,
    api: async () => {
      const current = ++sequence;
      if (!props.active) return null;
      const result = await (props.siteId ? fetchSiteOrders(props.siteId, query.value) : fetchAllSiteOrders(query.value));
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
    columns: (): UI.TableColumn<SiteOrder>[] => [
      ...(!props.siteId ? [{
        prop: 'siteName',
        label: $t('page.site.name'),
        minWidth: 200,
        formatter: (row: SiteOrder) => <SiteNameCell name={row.siteName} baseUrl={row.siteBaseUrl} />
      }] : []),
        { prop: 'externalId', label: $t('page.site.orderId'), minWidth: 200 },
        { prop: 'merchantId', label: $t('page.site.merchantId'), width: 110 },
        {
          prop: 'paymentTypeName',
          label: $t('page.site.paymentType'),
          minWidth: 110
        },
        { prop: 'channelCode', label: $t('page.site.channelCode'), width: 110 },
        { prop: 'amount', label: $t('page.site.amount'), width: 120 },
        { prop: 'realAmount', label: $t('page.site.realAmount'), width: 120 },
        {
          prop: 'sourceStatus',
          label: $t('page.site.paymentStatus'),
          minWidth: 140,
          formatter: row => {
            const { label, color } = paymentStatus(row.sourceStatus);
            return <ElTag type={color}>{label}</ElTag>;
          }
        },
        {
          prop: 'status',
          label: $t('page.site.orderStatus'),
          minWidth: 140,
          formatter: row => <ElTag type={orderColor(row.status)}>{orderLabel(row.status)}</ElTag>
        },
        {
          prop: 'occurredAt',
          label: $t('page.site.occurredAt'),
          minWidth: 180,
          formatter: row => formatTime(row.occurredAt)
        },
        {
          prop: 'paidAt',
          label: $t('page.site.paidAt'),
          minWidth: 180,
          formatter: row => formatTime(row.paidAt)
        },
        {
          prop: 'operate',
          label: $t('common.operate'),
          width: 100,
          fixed: 'right',
          formatter: row => (
            <ElButton
              size="small"
              onClick={() => {
                selected.value = row;
                drawerVisible.value = true;
              }}
            >
              {$t('page.site.details')}
            </ElButton>
          )
        }
    ]
  });

function reset() {
  search.value = { current: 1, size: search.value.size };
  dates.value = null;
  return getDataByPage();
}
watch(() => props.active, active => {
  if (active) getData();
}, { immediate: true });
useAutoRefresh(refreshData, undefined, () => props.active && !drawerVisible.value);
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <SiteCollectionCards
      v-if="!embedded || (active && statisticsTarget)"
      :statistics="statistics?.collections"
      :status-counts="statistics"
      :has-rows="Boolean(mobilePagination.total)"
      :page="embedded ? undefined : 'orders'"
      :target="statisticsTarget"
    />
    <component :is="embedded ? 'div' : ElCard" :class="embedded ? undefined : 'epay-table-card card-wrapper'">
      <div class="epay-table-toolbar">
        <ElForm class="epay-table-search" inline @submit.prevent="getDataByPage()">
          <EpaySearchFields v-model:expanded="filtersExpanded" :values="[search.channelCode, dates, search.status]">
            <ElFormItem :label="$t('common.keywordSearch')">
              <ElInput v-model="search.keyword" clearable :placeholder="$t('page.site.orderId')" />
            </ElFormItem>
            <ElFormItem :label="$t('page.site.paymentStatus')">
              <ElSelect v-model="search.sourceStatus" clearable class="w-170px">
                <ElOption v-for="code in Object.keys(paymentStatuses)" :key="code" :value="code" :label="paymentStatus(code).label" />
              </ElSelect>
            </ElFormItem>
            <template #actions>
              <ElButton type="primary" native-type="submit">{{ $t('common.search') }}</ElButton>
              <ElButton @click="reset">{{ $t('common.reset') }}</ElButton>
            </template>
            <template #advanced>
              <ElFormItem :label="$t('page.site.orderStatus')">
                <ElSelect v-model="search.status" clearable class="w-170px">
                  <ElOption v-for="status in metricStatuses" :key="status" :value="status" :label="orderLabel(status)" />
                </ElSelect>
              </ElFormItem>
              <ElFormItem :label="$t('page.site.channelCode')">
                <ElInput v-model="search.channelCode" clearable class="w-120px" />
              </ElFormItem>
              <ElFormItem :label="$t('page.site.dateRange')">
                <ElDatePicker v-model="dates" type="datetimerange" class="max-w-full" />
              </ElFormItem>
            </template>
          </EpaySearchFields>
        </ElForm>
        <div class="epay-table-actions">
          <div class="flex flex-wrap items-center gap-8px">
            <TableHeaderOperation v-model:columns="columnChecks" hide-add hide-delete :loading="loading" />
          </div>
        </div>
      </div>

      <ElAlert v-if="failed" :title="$t('page.site.loadFailed')" type="error" :closable="false" class="mb-12px" />
      <div class="min-w-0">
        <ElTable
          v-loading="loading"
          :data="data"
          row-key="id"
          border
          :empty-text="$t('page.site.noSyncRows')"
        >
          <ElTableColumn v-for="column in columns" :key="column.prop" v-bind="column" />
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
    </component>
    <ElDialog
      v-model="drawerVisible"
      :title="$t('page.site.orderDetails')"
      width="650px"
      class="max-w-[calc(100%-32px)]"
    >
      <ElDescriptions v-if="selected" :column="1" border>
        <ElDescriptionsItem :label="$t('page.site.orderId')">{{ selected.externalId }}</ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.site.merchantId')">{{ selected.merchantId }}</ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.site.channelCode')">{{ selected.channelCode }}</ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.site.subchannelCode')">{{ selected.subchannelCode }}</ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.site.amount')">{{ selected.amount }}</ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.site.realAmount')">{{ selected.realAmount ?? '—' }}</ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.site.paymentStatus')">{{ paymentStatus(selected.sourceStatus).label }}</ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.site.orderStatus')">{{ orderLabel(selected.status) }}</ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.site.sourceStatus')">{{ selected.sourceStatus }}</ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.site.occurredAt')">
          {{ formatTime(selected.occurredAt) }}
        </ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.site.paidAt')">{{ formatTime(selected.paidAt) }}</ElDescriptionsItem>
      </ElDescriptions>
      <template #footer>
        <ElButton @click="drawerVisible = false">{{ $t('common.close') }}</ElButton>
      </template>
    </ElDialog>
  </div>
</template>
