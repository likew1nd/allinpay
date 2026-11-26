<script setup lang="tsx">
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { onActivated, ref } from 'vue';
import { deletePayee, fetchPayeeDeleteCheck, fetchPayees, setPayeeStatus } from '@/service/api';
import type { Payee } from '@/service/api';
import EpayDeleteDialog from '@/components/custom/epay-delete-dialog.vue';
import EpayStatusSwitch from '@/components/custom/epay-status-switch.vue';
import { useAuth } from '@/hooks/business/auth';
import { defaultTransform, useTableOperate, useUIPaginatedTable } from '@/hooks/common/table';
import ReceivingPayeeOperateDrawer from './modules/payee-operate-drawer.vue';

const { hasAuth } = useAuth();
const searchParams = ref({ current: 1, size: 20 });
const togglingIds = ref(new Set<string>());
// 删除弹窗：先检查占用（被哪些转账策略使用、是否有正在执行的转账），无占用才允许输入“删除”确认
const deleteVisible = ref(false);
const deleteTarget = ref({ id: '', name: '' });

const { columns, data, getData, getDataByPage, loading, mobilePagination, refreshData } = useUIPaginatedTable({
  paginationProps: { currentPage: 1, pageSize: 20, pageSizes: [20, 50, 100] },
  api: () => fetchPayees(searchParams.value),
  isResponseValid: response => !response.error,
  transform: response => defaultTransform(response),
  onPaginationParamsChange: params => {
    searchParams.value.current = params.currentPage ?? 1;
    searchParams.value.size = params.pageSize ?? 20;
  },
  columns: () => [
    { prop: 'name', label: '名称', minWidth: 150 },
    { prop: 'account', label: '账号', minWidth: 220 },
    {
      prop: 'receivedToday',
      label: '今日收款',
      minWidth: 160,
      formatter: row => <span class="font-mono tabular-nums">{amountWithLimit(row.receivedToday, row.dailyLimit)}</span>
    },
    {
      prop: 'receivedTotal',
      label: '累计收款',
      minWidth: 160,
      formatter: row => <span class="font-mono tabular-nums">{amountWithLimit(row.receivedTotal, row.totalLimit)}</span>
    },
    {
      prop: 'status',
      label: '启用',
      width: 100,
      formatter: row => (
        <EpayStatusSwitch
          checked={row.status === 'ACTIVE'}
          label={`${row.name} 启用`}
          disabled={!hasAuth('payee:update')}
          loading={togglingIds.value.has(row.id)}
          onChange={(enabled: boolean) => togglePayee(row, enabled)}
        />
      )
    },
    {
      prop: 'operate',
      label: '操作',
      width: 170,
      fixed: 'right',
      formatter: row => (
        <div class="flex items-center gap-12px">
          {hasAuth('payee:update') && (
            <ElButton link type="primary" onClick={() => handleEdit(row.id)}>
              限额设置
            </ElButton>
          )}
          {hasAuth('payee:delete') && (
            <ElButton link type="danger" onClick={() => openDelete(row)}>
              删除
            </ElButton>
          )}
        </div>
      )
    }
  ]
});

const { drawerVisible, operateType, editingData, handleAdd, handleEdit, onDeleted } = useTableOperate(data, 'id', getData);

function amountWithLimit(amount: string, limit: string | null) {
  const received = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number(amount || 0));
  const quota = limit === null ? '无限' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number(limit));
  return `${received} / ${quota}`;
}

async function togglePayee(row: Payee, enabled: boolean) {
  if (togglingIds.value.has(row.id)) return;
  togglingIds.value.add(row.id);
  try {
    const result = await setPayeeStatus(row.id, enabled ? 'ACTIVE' : 'DISABLED');
    if (!result.error) await getData();
  } finally {
    togglingIds.value.delete(row.id);
  }
}

function openDelete(row: Payee) {
  deleteTarget.value = { id: row.id, name: row.name };
  deleteVisible.value = true;
}

onActivated(refreshData);
useAutoRefresh(refreshData, undefined, () => !drawerVisible.value && !togglingIds.value.size && !deleteVisible.value);
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <ElCard class="epay-table-card card-wrapper">
      <div class="epay-table-toolbar">
        <div class="epay-table-actions">
          <ElButton v-if="hasAuth('payee:create')" type="primary" @click="handleAdd">新增收款账号</ElButton>
        </div>
      </div>
      <div class="min-w-0">
        <ElTable v-loading="loading" border :data="data" row-key="id">
          <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
        </ElTable>
      </div>
      <div class="mt-20px flex justify-end">
        <ElPagination
          v-if="mobilePagination.total"
          layout="total,prev,pager,next,sizes"
          v-bind="mobilePagination"
          @current-change="mobilePagination['current-change']"
          @size-change="mobilePagination['size-change']"
        />
      </div>
      <ReceivingPayeeOperateDrawer
        v-model:visible="drawerVisible"
        :operate-type="operateType"
        :row-data="editingData"
        @submitted="getDataByPage"
      />
      <EpayDeleteDialog
        v-model:visible="deleteVisible"
        kind="收款账号"
        :target-id="deleteTarget.id"
        :target-name="deleteTarget.name"
        :check="fetchPayeeDeleteCheck"
        :remove="deletePayee"
        @deleted="onDeleted"
      />
    </ElCard>
  </div>
</template>
