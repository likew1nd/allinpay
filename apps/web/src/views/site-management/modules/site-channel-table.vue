<script setup lang="tsx">
import { useTableQuery } from '@/hooks/common/table-query';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useMediaQuery } from '@vueuse/core';
import { ElCard } from 'element-plus';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { fetchAllSiteChannels, fetchSiteChannels, updateChannelStatus } from '@/service/api';
import type { OrderCollectionStatistics, SiteChannel, SiteDataParams } from '@/service/api';
import { useAuth } from '@/hooks/business/auth';
import { defaultTransform, useUIPaginatedTable } from '@/hooks/common/table';
import { showSwitchMessage } from '@/utils/message';
import alipay from '@/assets/imgs/payments/alipay.svg';
import wxpay from '@/assets/imgs/payments/wxpay.svg';
import qqpay from '@/assets/imgs/payments/qqpay.svg';
import unionpay from '@/assets/imgs/payments/unionpay.svg';
import jdpay from '@/assets/imgs/payments/jdpay.svg';
import { $t } from '@/locales';
import EpaySearchFields from '@/components/custom/epay-search-fields.vue';
import EpayStatusSwitch from '@/components/custom/epay-status-switch.vue';
import SiteChannelDialog from './site-channel-dialog.vue';
import SiteNameCell from './site-name-cell.vue';
import SiteCollectionCards from './site-collection-cards.vue';
import { formatOrderRate, orderRateWindows } from './shared';

const props = defineProps<{ siteId?: string; active: boolean; statisticsTarget?: HTMLElement | null }>();
const { hasAuth } = useAuth();
const pinIdentity = useMediaQuery('(min-width: 768px)');
const pinActions = useMediaQuery('(min-width: 1280px)');
const search = ref<SiteDataParams>({ current: 1, size: 10 });
const { query, applyQuery } = useTableQuery(search);
const editing = ref<SiteChannel | null>(null);
const action = ref<'edit' | 'configuration' | 'delete'>('edit');
const dialogVisible = ref(false);
const busy = ref(new Set<string>());
const failed = ref(false);
const statistics = ref<OrderCollectionStatistics>();
const successWindows = computed(orderRateWindows);
const logos: Record<string, string> = {
  alipay,
  wxpay,
  qqpay,
  unionpay,
  bank: unionpay,
  jdpay
};
const interfaceIcons: Record<string, string> = {
  电脑网站支付: 'mdi:monitor',
  手机网站支付: 'mdi:cellphone',
  当面付扫码: 'mdi:qrcode-scan',
  当面付JS: 'mdi:code-tags',
  '预授权支付(线上)': 'mdi:shield-lock-outline',
  APP支付: 'mdi:application-outline',
  JSAPI支付: 'mdi:api',
  订单码支付: 'mdi:barcode-scan',
  '预授权支付(线下)': 'mdi:store-outline',
  '预授权支付(小程序)': 'mdi:apps'
};
const percent = (value?: string) => (value === undefined || value === null ? '—' : `${value}%`);
function limit(value?: string | number) {
  if (value === undefined || value === null || value === '') return '—';
  return Number(value) === 0 ? '不限' : String(value);
}
function dailyUsage(value: string | number | undefined, maximum?: string | number) {
  return (
    <span class="site-channel-usage">
      <strong class="font-semibold">{value ?? '—'}</strong>
      <span class="color-[var(--epay-muted)]"> / {limit(maximum)}</span>
    </span>
  );
}
function modeLabel(mode?: number) {
  if (mode === 0) return '余额结算';
  return mode === 1 ? '扣费模式' : '—';
}
function modeHint(mode?: number) {
  if (mode === 0) return '支付金额扣除手续费后加入商户余额';
  return mode === 1 ? '支付完成后不给商户加余额，同时扣除手续费' : '原站点未提供通道模式';
}
function statusHint(row: SiteChannel) {
  if (busy.value.has(row.id)) return '正在处理，站点忙时会自动等待，请勿重复点击';
  if (row.dayStatus === 1 && row.sourceStatus === 1) return '已启用，但已达原站点日限额。点击可停止通道';
  return row.sourceStatus === 1 ? '点击停止通道' : '点击启用通道';
}
function open(row: SiteChannel, kind: typeof action.value) {
  editing.value = row;
  action.value = kind;
  dialogVisible.value = true;
}
function orderRoute(siteId: string, channelCode?: string) {
  return { path: '/site-management/data', query: { siteId, tab: 'orders', channelCode } };
}
const { columns, columnChecks, data, loading, getData, getDataByPage, refreshData, mobilePagination } =
  useUIPaginatedTable({
    onSearch: applyQuery,
    immediate: false,
    api: async () => {
      const siteId = props.siteId;
      if (!props.active) return null;
      const params = {
        ...query.value,
        status: query.value.status || undefined
      };
      const result = await (siteId ? fetchSiteChannels(siteId, params) : fetchAllSiteChannels(params));
      if (siteId !== props.siteId) return null;
      failed.value = Boolean(result.error);
      return result;
    },
    isResponseValid: response => Boolean(response && !response.error),
    transform: response => {
      statistics.value = response?.data?.statistics;
      return defaultTransform(response!);
    },
    onPaginationParamsChange: params => {
      search.value.current = query.value.current = params.currentPage ?? 1;
      search.value.size = query.value.size = params.pageSize ?? 10;
    },
    columns: (): UI.TableColumn<SiteChannel>[] => [
      ...(!props.siteId
        ? [{
            prop: 'siteName', label: $t('page.site.name'), minWidth: 190, fixed: 'left',
            formatter: (row: SiteChannel) => (
              <SiteNameCell name={row.siteName ?? row.siteId} baseUrl={row.siteBaseUrl ?? ''} to={orderRoute(row.siteId)} />
            )
          }]
        : []),
      { prop: 'code', label: '编号', width: 52, fixed: 'left', align: 'center', showOverflowTooltip: true },
      {
        prop: 'name',
        label: '通道名',
        minWidth: 164,
        fixed: 'left',
        formatter: row => {
          const type = row.channelType || row.details?.paymentTypeCode || '未知支付方式';
          const logo = logos[row.details?.paymentTypeCode ?? ''];
          return (
            <RouterLink class="flex items-center gap-8px" to={orderRoute(row.siteId, row.code)}>
              <span class="h-22px w-22px inline-flex shrink-0 items-center justify-center" role="img" aria-label={type} title={type}>
                {logo ? (
                  <img src={logo} alt="" class="h-full w-full object-contain" />
                ) : (
                  <SvgIcon icon="mdi:credit-card-outline" class="text-22px" aria-hidden="true" />
                )}
              </span>
              <span class="min-w-0 truncate font-semibold">{row.name}</span>
            </RouterLink>
          );
        }
      },
      {
        prop: 'dailyLimit',
        label: '收款 / 限额',
        minWidth: 110,
        align: 'right',
        formatter: row => dailyUsage(row.orderMetrics?.today?.amount, row.details?.dailyLimit)
      },
      {
        prop: 'dailyOrderLimit',
        label: '笔数 / 限笔',
        minWidth: 94,
        align: 'right',
        formatter: row => dailyUsage(row.orderMetrics?.today?.count, row.details?.dailyOrderLimit)
      },
      {
        prop: 'totalSuccessAmount',
        label: '总收款',
        minWidth: 110,
        align: 'right',
        renderHeader: () => <span title="原站点全部成功订单的订单金额合计">总收款</span>,
        formatter: row => <span class="site-channel-usage">{row.details?.totalSuccessAmount ?? '—'}</span>
      },
      {
        prop: 'totalSuccessCount',
        label: '总笔数',
        minWidth: 80,
        align: 'right',
        renderHeader: () => <span title="原站点全部成功订单的笔数">总笔数</span>,
        formatter: row => <span class="site-channel-usage">{row.details?.totalSuccessCount ?? '—'}</span>
      },
      {
        prop: 'successRates',
        label: '成功率（5 / 15 / 30 / 60 / 全天）',
        minWidth: 210,
        align: 'center',
        renderHeader: () => (
          <div title="按下单时间统计；全天从站点当地零点起，近 5/15/30/60 分钟以最近一次成功同步的截止时间为准。">
            <div>成功率</div>
            <div class="site-channel-rates font-normal color-[var(--epay-muted)]">
              {successWindows.value.map(label => <span key={label}>{label}</span>)}
            </div>
          </div>
        ),
        formatter: row => (
          <div class="site-channel-rates">
            {successWindows.value.map((label, index) => {
              const rate = row.orderMetrics?.successRates[index];
              return (
                <span key={label} title={`${label}：${rate == null ? '无样本或未同步' : formatOrderRate(rate)}`}>
                  {formatOrderRate(rate)}
                </span>
              );
            })}
          </div>
        )
      },
      {
        prop: 'strategyGroups',
        label: '策略组',
        minWidth: 96,
        formatter: row =>
          row.strategyGroups?.length ? (
            <div class="flex flex-wrap gap-4px">
              {row.strategyGroups.map(group => (
                <ElTag class="site-channel-group" type="warning" size="small" key={group.id}>
                  {group.name}
                </ElTag>
              ))}
            </div>
          ) : (
            '—'
          )
      },
      {
        prop: 'pollingMembers',
        label: '轮询组',
        minWidth: 80,
        formatter: row =>
          row.pollingMembers.length ? (
            <div class="flex flex-wrap gap-4px">
              {row.pollingMembers.map(member => (
                <ElTag class="site-channel-group" type="info" size="small" key={member.pollingGroup.code}>
                  {member.pollingGroup.name}
                </ElTag>
              ))}
            </div>
          ) : (
            '—'
          )
      },
      {
        prop: 'mode',
        label: '通道模式',
        width: 76,
        formatter: row => (
          <ElTooltip content={modeHint(row.details?.mode)}>
            <span>{modeLabel(row.details?.mode)}</span>
          </ElTooltip>
        )
      },
      {
        prop: 'rate',
        label: '分成比例',
        width: 76,
        align: 'right',
        formatter: row => percent(row.details?.rate)
      },
      {
        prop: 'costRate',
        label: '通道成本',
        width: 76,
        align: 'right',
        formatter: row => percent(row.details?.costRate)
      },
      {
        prop: 'availableInterfaces',
        label: '支付接口',
        width: 106,
        align: 'center',
        formatter: row =>
          row.details?.availableInterfaces?.length ? (
            <div class="flex flex-wrap items-center justify-center gap-6px py-4px">
              {row.details.availableInterfaces.map(name => (
                <ElTooltip key={name} content={name} placement="top">
                  <span
                    class="h-24px w-24px inline-flex items-center justify-center text-primary"
                    role="img"
                    aria-label={name}
                    tabindex={0}
                  >
                    <SvgIcon icon={interfaceIcons[name] || 'mdi:connection'} class="text-20px" />
                  </span>
                </ElTooltip>
              ))}
            </div>
          ) : (
            '—'
          )
      },
      {
        prop: 'minAmount',
        label: '单笔最小',
        width: 80,
        align: 'right',
        formatter: row => limit(row.details?.minAmount)
      },
      {
        prop: 'maxAmount',
        label: '单笔最大',
        width: 80,
        align: 'right',
        formatter: row => limit(row.details?.maxAmount)
      },
      {
        prop: 'status',
        label: '状态',
        width: 88,
        align: 'center',
        fixed: 'right',
        formatter: row => (
          <ElTooltip content={statusHint(row)}>
            <EpayStatusSwitch
              checked={row.sourceStatus === 1}
              label={statusHint(row)}
              loading={busy.value.has(row.id)}
              disabled={!hasAuth('site:update') || ![0, 1].includes(row.sourceStatus)}
              onChange={() => toggle(row)}
            />
          </ElTooltip>
        )
      },
      {
        prop: 'operate',
        label: '操作',
        width: 174,
        fixed: 'right',
        formatter: row => (
          <ElSpace size={6}>
            {hasAuth('site:update') && (
              <>
                <ElButton link type="primary" onClick={() => open(row, 'configuration')}>
                  配置密钥
                </ElButton>
                <ElButton link type="primary" onClick={() => open(row, 'edit')}>
                  编辑
                </ElButton>
              </>
            )}
            {hasAuth('site:delete') && (
              <ElButton link type="danger" onClick={() => open(row, 'delete')}>
                删除
              </ElButton>
            )}
          </ElSpace>
        )
      }
    ]
  });
async function toggle(row: SiteChannel) {
  if (!hasAuth('site:update') || busy.value.has(row.id)) return;
  busy.value.add(row.id);
  const scopeSiteId = props.siteId;
  const enabled = row.sourceStatus !== 1;
  try {
    const result = await updateChannelStatus(row.siteId, row.code, {
      status: enabled ? 1 : 0,
      expectedStatus: row.sourceStatus
    });
    if (!result.error && scopeSiteId === props.siteId) {
      // 原站点确认成功后立即显示返回状态，列表在后台静默刷新。
      const { sourceStatus, dayStatus, status } = result.data;
      data.value = data.value.map(item => (item.id === row.id ? { ...item, sourceStatus, dayStatus, status } : item));
      showSwitchMessage(enabled, enabled ? '通道已启用' : '通道已停止');
      void refreshData();
    }
  } finally {
    busy.value.delete(row.id);
  }
}
async function reset() {
  search.value = { current: 1, size: search.value.size };
  await getDataByPage();
}
async function refresh() {
  if (props.active) await getData();
}
watch(
  () => props.siteId,
  () => {
    data.value = [];
    statistics.value = undefined;
    dialogVisible.value = false;
    editing.value = null;
    failed.value = false;
    reset();
  },
  { immediate: true }
);
watch(
  () => props.active,
  active => {
    if (active) refresh();
  }
);
useAutoRefresh(refreshData, undefined, () =>
  props.active && !dialogVisible.value && !busy.value.size
);
async function saved() {
  if (action.value === 'delete' && data.value.length === 1 && (search.value.current ?? 1) > 1) {
    search.value.current = (search.value.current ?? 1) - 1;
    await getDataByPage(search.value.current);
  } else await getData();
}
defineExpose({ refresh });
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <SiteCollectionCards
      v-if="!siteId || (active && statisticsTarget)"
      :statistics="statistics"
      :has-rows="Boolean(mobilePagination.total)"
      :page="siteId ? undefined : 'channels'"
      :target="statisticsTarget"
    />
    <component :is="siteId ? 'div' : ElCard" :class="siteId ? undefined : 'epay-table-card card-wrapper'">
      <div class="epay-table-toolbar">
        <ElForm class="epay-table-search" inline @submit.prevent="getDataByPage()">
          <EpaySearchFields :values="[search.status]">
            <ElFormItem label="通道名 / 编号"><ElInput v-model="search.keyword" clearable /></ElFormItem>
            <template #actions>
              <ElButton type="primary" native-type="submit">{{ $t('common.search') }}</ElButton>
              <ElButton @click="reset">{{ $t('common.reset') }}</ElButton>
            </template>
            <template #advanced>
              <ElFormItem label="收款可用性">
                <ElSelect v-model="search.status" clearable class="w-160px">
                  <ElOption label="可用" value="ENABLED" />
                  <ElOption label="不可用（含日限额）" value="DISABLED" />
                  <ElOption label="未知" value="UNKNOWN" />
                </ElSelect>
              </ElFormItem>
            </template>
          </EpaySearchFields>
        </ElForm>
        <div class="epay-table-actions">
          <TableHeaderOperation
            v-model:columns="columnChecks"
            hide-add
            hide-delete
            :loading="loading"
          />
        </div>
      </div>
      <p class="mb-12px text-12px opacity-75">
        通道修改将同步写入原站点。状态按钮可点击切换启停；达到日限额的通道仍受原站点限制。
      </p>
      <ElAlert v-if="failed" type="error" :closable="false" :title="$t('page.site.loadFailed')" />
      <ElTable
        v-loading="loading"
        class="site-channel-table"
        :data="data"
        row-key="id"
        border
        scrollbar-always-on
        :empty-text="$t('page.site.noSyncRows')"
      >
        <ElTableColumn
          v-for="column in columns"
          :key="column.prop"
          v-bind="column"
          :fixed="column.fixed === 'left' ? pinIdentity : column.fixed === 'right' && pinActions ? 'right' : false"
        />
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
      <SiteChannelDialog
        v-model:visible="dialogVisible"
        :site-id="editing?.siteId ?? ''"
        :channel="editing"
        :action="action"
        @saved="saved"
      />
    </component>
  </div>
</template>

<style scoped>
.site-channel-table :deep(.el-table__cell > .cell) {
  padding-inline: 10px;
}

.site-channel-table :deep(.site-channel-rates) {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  font-size: 12px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.site-channel-table :deep(.site-channel-usage) {
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.site-channel-table :deep(.el-tag.site-channel-group) {
  max-width: 100%;
  height: auto;
  min-height: 24px;
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
