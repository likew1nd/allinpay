<script setup lang="tsx">
import { computed, ref, watch } from 'vue';
import type { InputInstance } from 'element-plus';
import { ElCard } from 'element-plus';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { useTableQuery } from '@/hooks/common/table-query';
import { defaultTransform, useUIPaginatedTable } from '@/hooks/common/table';
import { fetchAllSiteOrders, fetchSiteOrders } from '@/service/api';
import type { OrderListStatistics, SiteOrder, SiteOrderParams } from '@/service/api';
import { $t } from '@/locales';
import EpaySearchFields from '@/components/custom/epay-search-fields.vue';
import SiteNameCell from './site-name-cell.vue';
import SitePicker from './site-picker.vue';
import SiteCollectionCards from './site-collection-cards.vue';
import { formatTime, orderLabel } from './shared';

const props = defineProps<{ siteId?: string; channelCode?: string; active: boolean; embedded?: boolean; statisticsTarget?: HTMLElement | null }>();
const search = ref<SiteOrderParams>({ current: 1, size: 10, channelCode: props.channelCode });
const filtersExpanded = ref(Boolean(props.channelCode));
const dates = ref<[Date, Date] | null>(null);
const searchBar = ref<InstanceType<typeof EpaySearchFields>>();
const fields = computed(() => [
  ...(!props.siteId ? [{ key: 'siteId', width: 120, value: search.value.siteId }] : []),
  { key: 'orderId', width: 178, value: search.value.orderId },
  { key: 'amount', width: 112, value: search.value.minAmount || search.value.maxAmount },
  { key: 'sourceStatus', width: 128, value: search.value.sourceStatus },
  { key: 'merchantId', width: 120, value: search.value.merchantId },
  { key: 'status', width: 116, value: search.value.status },
  { key: 'channelCode', width: 106, value: search.value.channelCode },
  { key: 'dates', width: 320, value: dates.value }
]);

const amountError = ref('');
const amountOpen = ref(false);
const minInput = ref<InputInstance>();
const amountLabel = computed(() => {
  const min = search.value.minAmount?.trim();
  const max = search.value.maxAmount?.trim();
  if (!min && !max) return $t('page.site.amount');
  let range = min ? `≥ ${min}` : `≤ ${max}`;
  if (min && max) range = min === max ? min : `${min}～${max}`;
  return $t('page.site.orderFilters.amountSummary', { range });
});
const amountPattern = /^\d{1,16}(?:\.\d{1,2})?$/;
const { query, applyQuery } = useTableQuery(() => ({
  ...search.value,
  siteId: search.value.siteId || undefined,
  orderId: search.value.orderId?.trim() || undefined,
  merchantId: search.value.merchantId?.trim() || undefined,
  minAmount: search.value.minAmount?.trim() || undefined,
  maxAmount: search.value.maxAmount?.trim() || undefined,
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
        fixed: 'left' as const,
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

function amountInCents(amount: string) {
  const [integer, fraction = ''] = amount.split('.');
  return BigInt(integer + fraction.padEnd(2, '0'));
}

function submitSearch() {
  const min = search.value.minAmount?.trim();
  const max = search.value.maxAmount?.trim();
  if ((min && !amountPattern.test(min)) || (max && !amountPattern.test(max))) {
    amountError.value = $t('page.site.orderFilters.invalidAmount');
  } else if (min && max && amountInCents(min) > amountInCents(max)) {
    amountError.value = $t('page.site.orderFilters.invalidRange');
  }
  if (amountError.value) {
    searchBar.value?.reveal('amount');
    amountOpen.value = true;
    return;
  }
  amountOpen.value = false;
  return getDataByPage();
}

function reset() {
  amountOpen.value = false;
  amountError.value = '';
  search.value = { current: 1, size: search.value.size };
  dates.value = null;
  return getDataByPage();
}
// 金额按钮换行或收入「更多」时，关闭挂在旧按钮上的浮层并保留输入。
watch(() => searchBar.value?.isInline('amount'), () => {
  amountOpen.value = false;
});
watch([() => search.value.minAmount, () => search.value.maxAmount], () => {
  amountError.value = '';
});
watch(() => props.active, active => {
  if (active) getData();
}, { immediate: true });
useAutoRefresh(refreshData, undefined, () => props.active && !drawerVisible.value && !amountOpen.value);
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
        <EpaySearchFields ref="searchBar" v-model:expanded="filtersExpanded" :fields="fields" @search="submitSearch" @reset="reset">
          <template #siteId>
            <SitePicker
              v-model="search.siteId"
              clearable
              :placeholder="$t('page.site.orderFilters.allSites')"
            />
          </template>
          <template #orderId>
            <ElInput
              v-model="search.orderId"
              clearable
              maxlength="100"
              :aria-label="$t('page.site.orderFilters.orderId')"
              :placeholder="$t('page.site.orderFilters.orderIdPlaceholder')"
            />
          </template>
          <template #amount>
            <ElPopover
              v-model:visible="amountOpen"
              placement="bottom-start"
              trigger="click"
              role="dialog"
              :aria-label="$t('page.site.orderFilters.amount')"
              :width="300"
              :title="$t('page.site.orderFilters.amount')"
              @after-enter="minInput?.focus()"
            >
              <template #reference>
                <ElButton
                  native-type="button"
                  class="epay-order-amount"
                  :aria-expanded="amountOpen"
                  aria-haspopup="dialog"
                  :aria-label="amountLabel"
                  :title="amountLabel"
                >
                  <span class="truncate">{{ amountLabel }}</span>
                  <icon-ic-round-expand-more class="ml-4px shrink-0" aria-hidden="true" />
                </ElButton>
              </template>
              <div class="epay-search-range" @keydown.enter.prevent.stop="submitSearch">
                <ElInput
                  ref="minInput"
                  v-model="search.minAmount"
                  inputmode="decimal"
                  maxlength="19"
                  :aria-label="$t('page.site.orderFilters.minAmount')"
                  :placeholder="$t('page.site.orderFilters.minAmount')"
                />
                <span aria-hidden="true">{{ $t('page.site.orderFilters.rangeSeparator') }}</span>
                <ElInput
                  v-model="search.maxAmount"
                  inputmode="decimal"
                  maxlength="19"
                  :aria-label="$t('page.site.orderFilters.maxAmount')"
                  :placeholder="$t('page.site.orderFilters.maxAmount')"
                />
              </div>
              <div v-if="amountError" role="alert" class="mt-6px text-sm text-error">{{ amountError }}</div>
            </ElPopover>
          </template>
          <template #sourceStatus>
            <ElSelect
              v-model="search.sourceStatus"
              clearable
              :aria-label="$t('page.site.paymentStatus')"
              :placeholder="$t('page.site.orderFilters.allStatuses')"
            >
              <ElOption v-for="code in Object.keys(paymentStatuses)" :key="code" :value="code" :label="paymentStatus(code).label" />
            </ElSelect>
          </template>
          <template #merchantId>
            <ElInput
              v-model="search.merchantId"
              clearable
              maxlength="100"
              :aria-label="$t('page.site.orderFilters.merchantId')"
              :placeholder="$t('page.site.orderFilters.merchantIdPlaceholder')"
            />
          </template>
          <template #status>
            <ElSelect
              v-model="search.status"
              clearable
              :aria-label="$t('page.site.orderStatus')"
              :placeholder="$t('page.site.orderStatus')"
            >
              <ElOption v-for="status in metricStatuses" :key="status" :value="status" :label="orderLabel(status)" />
            </ElSelect>
          </template>
          <template #channelCode>
            <ElInput
              v-model="search.channelCode"
              clearable
              :aria-label="$t('page.site.channelCode')"
              :placeholder="$t('page.site.channelCode')"
            />
          </template>
          <template #dates>
            <ElDatePicker
              v-model="dates"
              type="datetimerange"
              :aria-label="$t('page.site.dateRange')"
              :start-placeholder="$t('page.site.orderFilters.createdFrom')"
              :end-placeholder="$t('page.site.orderFilters.createdTo')"
            />
          </template>
        </EpaySearchFields>
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

<style scoped>
.epay-order-amount :deep(> span) {
  width: 100%;
  min-width: 0;
  justify-content: space-between;
}
</style>
