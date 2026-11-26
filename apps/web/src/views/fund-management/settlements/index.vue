<script setup lang="ts">
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { useUITable } from '@/hooks/common/table';
import { onActivated, onMounted, ref } from 'vue';
import { createSettlement, fetchFundAccounts, fetchSettlements } from '@/service/api';
import type { FundAccount } from '@/service/api';
import { formatTime } from '@/views/site-management/modules/shared';

const accounts = ref<FundAccount[]>([]);
const dialog = ref(false);
const current = ref(1);
const size = ref(20);
const total = ref(0);
const model = ref({
  fundAccountId: '',
  periodStart: '',
  periodEnd: '',
  amount: '',
  fee: '0',
  note: ''
});

// 状态中文映射
const statusLabel: Record<string, string> = {
  PENDING: '待结算',
  COMPLETED: '已完成',
  CANCELLED: '已取消'
};
const statusType: Record<string, 'warning' | 'success' | 'info'> = {
  PENDING: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'info'
};

const { data: rows, loading, getData: load, refreshData } = useUITable({
  immediate: false,
  columns: () => [],
  api: () => Promise.all([
    fetchSettlements({ current: current.value, size: size.value }),
    fetchFundAccounts({ current: 1, size: 100 })
  ]),
  isResponseValid: result => result.every(item => !item.error),
  transform: result => {
    const [settlements, funds] = result;
    accounts.value = funds.data!.records;
    total.value = settlements.data!.total;
    return settlements.data!.records;
  },
  onFetched: () => {
    const lastPage = Math.max(1, Math.ceil(total.value / size.value));
    if (current.value > lastPage) { current.value = lastPage; void load(); }
  }
});
function onPageChange(page: number) {
  current.value = page;
  load();
}
function onSizeChange(s: number) {
  size.value = s;
  current.value = 1;
  load();
}
function openAdd() {
  model.value = {
    fundAccountId: accounts.value[0]?.id || '',
    periodStart: '',
    periodEnd: '',
    amount: '',
    fee: '0',
    note: ''
  };
  dialog.value = true;
}
async function save() {
  if (!model.value.fundAccountId || !model.value.periodStart || !model.value.periodEnd || !model.value.amount) return;
  const result = await createSettlement(model.value);
  if (!result.error) {
    dialog.value = false;
    window.$message?.success('结算记录已创建');
    await load();
  }
}
onMounted(load);
onActivated(refreshData);
useAutoRefresh(refreshData, undefined, () => !dialog.value);
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <ElCard class="epay-table-card card-wrapper">
      <div class="epay-table-toolbar">
        <div class="epay-table-actions">
          <div class="flex items-center gap-8px">
            <ElButton type="primary" :disabled="!accounts.length" @click="openAdd">新增结算</ElButton>
          </div>
        </div>
      </div>
      <ElTable v-loading="loading" :data="rows" row-key="id" border>
        <ElTableColumn label="资金账户" min-width="160">
          <template #default="{ row }">{{ row.fundAccount?.name || row.fundAccountId }}</template>
        </ElTableColumn>
        <ElTableColumn label="开始时间" min-width="180">
          <template #default="{ row }">{{ formatTime(row.periodStart) }}</template>
        </ElTableColumn>
        <ElTableColumn label="结束时间" min-width="180">
          <template #default="{ row }">{{ formatTime(row.periodEnd) }}</template>
        </ElTableColumn>
        <ElTableColumn label="金额" width="140">
          <template #default="{ row }">{{ row.amount }}</template>
        </ElTableColumn>
        <ElTableColumn prop="fee" label="费用" width="120" />
        <ElTableColumn label="状态" width="120">
          <template #default="{ row }">
            <ElTag :type="statusType[row.status] ?? 'info'">{{ statusLabel[row.status] ?? row.status }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="note" label="备注" min-width="220" show-overflow-tooltip />
      </ElTable>
      <div class="mt-16px flex justify-end">
        <ElPagination
          :current-page="current"
          :page-size="size"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </ElCard>
    <ElDialog v-model="dialog" title="新增结算记录" width="520px">
      <ElForm label-position="top">
        <ElFormItem label="资金账户">
          <ElSelect v-model="model.fundAccountId" class="w-full">
            <ElOption v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="结算开始">
          <ElDatePicker
            v-model="model.periodStart"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
            class="w-full"
          />
        </ElFormItem>
        <ElFormItem label="结算结束">
          <ElDatePicker
            v-model="model.periodEnd"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
            class="w-full"
          />
        </ElFormItem>
        <ElFormItem label="金额"><ElInput v-model="model.amount" /></ElFormItem>
        <ElFormItem label="费用"><ElInput v-model="model.fee" /></ElFormItem>
        <ElFormItem label="备注"><ElInput v-model="model.note" type="textarea" /></ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialog = false">取消</ElButton>
        <ElButton type="primary" @click="save">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>
