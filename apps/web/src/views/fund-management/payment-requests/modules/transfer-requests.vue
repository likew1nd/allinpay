<script setup lang="tsx">
import EpaySearchFields from '@/components/custom/epay-search-fields.vue';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { useTableQuery } from '@/hooks/common/table-query';
import { ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { cancelTransfer, fetchTransferRequests, forceStopTransfer, isExecutingTransfer, resolveTransfer } from '@/service/api';
import type { TransferRequest, TransferStatus } from '@/service/api';
import { useAuth } from '@/hooks/business/auth';
import { defaultTransform, useUIPaginatedTable } from '@/hooks/common/table';
import { formatTime } from '@/views/site-management/modules/shared';
import TransferProgressLogs from './transfer-progress-logs.vue';
import TransferScreenshot from './transfer-screenshot.vue';

const props = defineProps<{ accountId?: string }>();
const { hasAuth } = useAuth();
const search = ref({ current: 1, size: 20, status: '' });
const { query, applyQuery } = useTableQuery(search);
const saving = ref(false);
const busyId = ref('');
const labels: Record<TransferStatus, string> = {
  READY: '待领取',
  PREPARING: '准备付款',
  CLAIMED: '付款执行中',
  NEEDS_MANUAL: '待人工处理',
  UNKNOWN: '结果未知',
  SUCCEEDED: '成功',
  FAILED: '失败',
  CANCELLED: '已取消'
};
const statusTypes: Partial<Record<TransferStatus, 'warning' | 'success'>> = {
  UNKNOWN: 'warning',
  NEEDS_MANUAL: 'warning',
  SUCCEEDED: 'success'
};
const { columns, columnChecks, data, getData, refreshData, getDataByPage, loading, mobilePagination } = useUIPaginatedTable({
  onSearch: applyQuery,
  api: () =>
    fetchTransferRequests({
      ...query.value, accountId: props.accountId,
      status: query.value.status || undefined
    }),
  isResponseValid: response => !response.error,
  transform: response => defaultTransform(response),
  paginationProps: { pageSize: 20, pageSizes: [20, 50, 100] },
  onPaginationParamsChange: params => {
    search.value.current = query.value.current = params.currentPage ?? 1;
    search.value.size = query.value.size = params.pageSize ?? 20;
  },
  columns: () => [
    {
      prop: 'createdAt',
      label: '创建时间',
      minWidth: 180,
      formatter: row => formatTime(row.createdAt)
    },
    { prop: 'outBizNo', label: '业务单号', minWidth: 230 },
    {
      prop: 'fundAccount',
      label: '付款环境',
      minWidth: 150,
      formatter: row => row.account?.name || row.account?.externalId || row.fundAccount?.name || '—'
    },
    {
      prop: 'payee',
      label: '收款人',
      minWidth: 190,
      formatter: row => `${row.payee.name} ${row.payee.accountMasked}`
    },
    {
      prop: 'amount',
      label: '金额',
      minWidth: 150,
      formatter: row => row.amount
    },
    {
      prop: 'status',
      label: '状态',
      width: 150,
      formatter: row => (
        <div class="flex flex-wrap gap-4px">
          <ElTag type={statusTypes[row.status] || 'info'}>{labels[row.status]}</ElTag>
          {row.mode === 'TEST' && <ElTag type="danger">测试</ElTag>}
        </div>
      )
    },
    {
      prop: 'screenshotAt',
      label: '截图',
      width: 110,
      formatter: row => <TransferScreenshot transferId={row.id} screenshotAt={row.screenshotAt} />
    },
    {
      prop: 'operate',
      label: '操作',
      width: 240,
      fixed: 'right',
      formatter: row => (
        <div class="flex flex-wrap gap-8px">
          <ElButton size="small" onClick={() => openAction('detail', row)}>
            详情
          </ElButton>
          <ElButton size="small" type="primary" plain onClick={() => openLogs(row)}>
            执行日志
          </ElButton>
          {isExecutingTransfer(row.status) && hasAuth('transfer-request:resolve') && (
            <ElButton size="small" type="danger" plain loading={busyId.value === row.id} onClick={() => forceStop(row)}>
              强制结束
            </ElButton>
          )}
          {row.status === 'READY' && hasAuth('transfer-request:cancel') && (
            <ElButton size="small" loading={busyId.value === row.id} onClick={() => cancel(row)}>
              取消
            </ElButton>
          )}
          {['UNKNOWN', 'NEEDS_MANUAL'].includes(row.status) && hasAuth('transfer-request:resolve') && (
            <ElButton size="small" type="warning" onClick={() => openAction('resolve', row)}>
              核对结果
            </ElButton>
          )}
        </div>
      )
    }
  ]
});
async function forceStop(row: TransferRequest) {
  if (busyId.value) return;
  try {
    await ElMessageBox.confirm(
      '准备付款的单据会停止并标记为失败。已获提交许可或由旧版采集端领取的单据会转为“结果未知”，请核对支付流水后再确认结果。',
      '强制结束转账',
      { type: 'warning', confirmButtonText: '强制结束', cancelButtonText: '返回' }
    );
  } catch {
    return;
  }
  busyId.value = row.id;
  try {
    const result = await forceStopTransfer(row.id);
    if (!result.error) {
      window.$message?.success(result.data.status === 'UNKNOWN' ? '已结束；该单已点击过“下一步”，请核对流水后标记结果' : '已强制结束，款项未转出，环境可以重新发起转账');
      await getData();
    }
  } finally {
    busyId.value = '';
  }
}
async function cancel(row: TransferRequest) {
  if (busyId.value) return;
  try {
    await ElMessageBox.confirm(`确认取消转账 ${row.amount} 给 ${row.payee.name}？`, '取消转账', {
      type: 'warning',
      confirmButtonText: '确认取消',
      cancelButtonText: '返回'
    });
  } catch {
    return;
  }
  busyId.value = row.id;
  try {
    const result = await cancelTransfer(row.id);
    if (!result.error) await getData();
  } finally {
    busyId.value = '';
  }
}
type Action = 'detail' | 'resolve';
const logsVisible = ref(false);
const logsTarget = ref<TransferRequest | null>(null);
function openLogs(row: TransferRequest) {
  logsTarget.value = row;
  logsVisible.value = true;
}
const drawer = ref(false);
const action = ref<Action>('detail');
const selected = ref<TransferRequest | null>(null);
const note = ref('');
const outcome = ref<'SUCCEEDED' | 'FAILED'>('SUCCEEDED');
const titles = {
  detail: '转账详情',
  resolve: '人工核对转账结果'
};
function clearSensitive() {
  note.value = '';
}
function openAction(value: Action, row?: TransferRequest) {
  action.value = value;
  selected.value = row || null;
  clearSensitive();
  outcome.value = 'SUCCEEDED';
  drawer.value = true;
}
async function submit() {
  if (saving.value || action.value !== 'resolve' || !selected.value) return;
  if (!note.value.trim()) {
    window.$message?.warning('请填写核对依据和处理说明');
    return;
  }
  saving.value = true;
  try {
    const result = await resolveTransfer(selected.value.id, {
      status: outcome.value,
      note: note.value.trim()
    });
    if (!result.error) {
      drawer.value = false;
      window.$message?.success('操作已完成');
      await getData();
    }
  } finally {
    saving.value = false;
  }
}
useAutoRefresh(refreshData, undefined, () => !drawer.value && !saving.value && !busyId.value && !logsVisible.value);
function resetFilters() {
  search.value.status = '';
  return getDataByPage();
}
</script>

<template>
  <ElCard class="epay-table-card card-wrapper">
    <div class="epay-table-toolbar">
      <EpaySearchFields @search="getDataByPage()" @reset="resetFilters">
        <ElSelect v-model="search.status" clearable placeholder="全部转账状态" aria-label="转账状态">
          <ElOption v-for="(label, status) in labels" :key="status" :value="status" :label="label" />
        </ElSelect>
      </EpaySearchFields>
    </div>

    <ElAlert
      class="mb-16px"
      type="warning"
      show-icon
      :closable="false"
      title="结果未知或待人工处理时，请先核对支付平台真实流水，再标记结果，切勿重复付款。"
    />
    <ElTable v-loading="loading" :data="data" row-key="id" border>
      <TableDataColumns :columns="columns" v-model:checks="columnChecks" />
    </ElTable>
    <div class="mt-16px flex justify-end">
      <ElPagination
        v-bind="mobilePagination"
        layout="total, sizes, prev, pager, next"
        @current-change="mobilePagination['current-change']"
        @size-change="mobilePagination['size-change']"
      />
    </div>
    <ElDrawer
      v-model="drawer"
      :title="titles[action]"
      size="min(560px, 100vw)"
      destroy-on-close
      @closed="clearSensitive"
    >
      <ElDescriptions v-if="selected" :column="1" border>
        <ElDescriptionsItem label="业务单号">{{ selected.outBizNo }}</ElDescriptionsItem>
        <ElDescriptionsItem label="资金账户">{{ selected.account?.name || selected.account?.externalId || selected.fundAccount?.name || '—' }}</ElDescriptionsItem>
        <ElDescriptionsItem label="收款人">
          {{ selected.payee.name }} {{ selected.payee.accountMasked }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="金额">{{ selected.amount }}</ElDescriptionsItem>
        <ElDescriptionsItem label="状态">{{ labels[selected.status] }}</ElDescriptionsItem>
        <ElDescriptionsItem label="规则">{{ selected.rule?.name || (selected.mode === 'TEST' ? '手动转账测试' : '—') }}</ElDescriptionsItem>
        <ElDescriptionsItem v-if="selected.testRemark" label="备注">{{ selected.testRemark }}</ElDescriptionsItem>
        <ElDescriptionsItem label="余额快照">
          {{ selected.balanceSnapshot }} /
          {{ formatTime(selected.balanceAt) }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="领取时间">{{ formatTime(selected.claimedAt) }}</ElDescriptionsItem>
        <ElDescriptionsItem label="完成时间">{{ formatTime(selected.completedAt) }}</ElDescriptionsItem>
        <ElDescriptionsItem label="处理说明">{{ selected.resultNote || '—' }}</ElDescriptionsItem>
        <ElDescriptionsItem label="转账截图">
          <TransferScreenshot :transfer-id="selected.id" :screenshot-at="selected.screenshotAt" :width="320" :height="200" />
        </ElDescriptionsItem>
      </ElDescriptions>
      <ElForm label-position="top" class="mt-16px" @submit.prevent="submit">
        <template v-if="action === 'resolve'">
          <ElFormItem label="核对结果">
            <ElRadioGroup v-model="outcome">
              <ElRadio value="SUCCEEDED">已成功</ElRadio>
              <ElRadio value="FAILED">已失败</ElRadio>
            </ElRadioGroup>
          </ElFormItem>
          <ElFormItem label="核对依据和处理说明（必填）">
            <ElInput v-model="note" type="textarea" maxlength="400" show-word-limit />
          </ElFormItem>
        </template>
      </ElForm>
      <template #footer>
        <ElButton @click="drawer = false">{{ action === 'detail' ? '关闭' : '取消' }}</ElButton>
        <ElButton v-if="action !== 'detail'" type="primary" :loading="saving" @click="submit">
          确认标记结果
        </ElButton>
      </template>
    </ElDrawer>
    <TransferProgressLogs v-model:visible="logsVisible" :transfer-id="logsTarget?.id" :out-biz-no="logsTarget?.outBizNo" />
  </ElCard>
</template>
