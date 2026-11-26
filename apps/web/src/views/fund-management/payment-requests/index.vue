<script setup lang="tsx">
import { useTableQuery } from '@/hooks/common/table-query';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchAutomaticTransfers, fetchAllTransferRules, setEnvironmentTransfer } from '@/service/api';
import type { AutomaticTransferAccount, TransferRule } from '@/service/api';
import { defaultTransform, useUIPaginatedTable } from '@/hooks/common/table';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { useAuth } from '@/hooks/business/auth';
import EpayStatusSwitch from '@/components/custom/epay-status-switch.vue';
import { showSwitchMessage } from '@/utils/message';
import MoneyDetails from '@/views/account-management/collectors/modules/money-details.vue';
import { accountMoney, businessTags } from '@/views/account-management/collectors/modules/shared';
import TransferRequests from './modules/transfer-requests.vue';
import TransferTestDrawer from './modules/transfer-test-drawer.vue';

const router = useRouter();
const { hasAuth } = useAuth();
const rules = ref<TransferRule[]>([]);
const busy = ref('');
const selected = ref<AutomaticTransferAccount | null>(null);
const recordsVisible = ref(false);
const testVisible = ref(false);
const testTarget = ref<AutomaticTransferAccount | null>(null);
const search = ref({ current: 1, size: 20, keyword: '' });
const { query, applyQuery } = useTableQuery(search);
const { columns, columnChecks, data, loading, getData, refreshData, getDataByPage, mobilePagination } = useUIPaginatedTable({
  onSearch: applyQuery,
  api: () => fetchAutomaticTransfers(query.value),
  isResponseValid: response => !response.error,
  transform: response => defaultTransform(response),
  paginationProps: { pageSize: 20, pageSizes: [20, 50, 100] },
  onPaginationParamsChange: params => { search.value.current = query.value.current = params.currentPage ?? 1; search.value.size = query.value.size = params.pageSize ?? 20; },
  columns: () => [
    { prop: 'collector', label: '采集端 / 关联站点', minWidth: 200, formatter: row => <div><div>{row.collector?.name || '—'}</div><small class="text-muted">{row.linkedSites.map(site => site.name).join('、') || '未关联站点'}</small></div> },
    { prop: 'loginAccount', label: '账号', minWidth: 200, formatter: row => <div><strong>{row.profileNo || row.externalId}</strong><div>{row.loginAccount || '未设置账号'}</div></div> },
    { prop: 'transferRuleId', label: '转账策略', minWidth: 220, formatter: row =>
      <ElSelect modelValue={row.transferRuleId || ''} placeholder="选择转账策略" aria-label="转账策略" clearable filterable
        disabled={!hasAuth('transfer-rule:update') || Boolean(busy.value)}
        onVisible-change={(visible: boolean) => { if (visible) loadRules(); }}
        onChange={(id: string) => change(row, { ruleId: id || null })}>
        {rules.value.filter(rule => !rule.isTemplate).map(rule => <ElOption key={rule.id} value={rule.id} label={rule.name + (rule.enabled ? '' : '（已停用）')} />)}
      </ElSelect> },
    { prop: 'businessStatus', label: '状态', minWidth: 130, formatter: row => <div class="flex flex-wrap gap-4px">{businessTags(row).map(tag => <ElTag key={tag.label} type={tag.type}>{tag.label}</ElTag>)}</div> },
    { prop: 'balance', label: '可用 / 不可用 / 待结算', minWidth: 230, formatter: row => <MoneyDetails balances={accountMoney(row)} compact /> },
    { prop: 'totalIncome', label: '累计收入', minWidth: 140, formatter: row => row.totalIncome ?? '待同步' },
    { prop: 'totalTransferred', label: '累计转出', minWidth: 140 },
    { prop: 'transferEnabled', label: '启用', width: 100, fixed: 'right', formatter: row =>
      <EpayStatusSwitch checked={row.transferEnabled} label="启用自动转账"
        disabled={!hasAuth('transfer-rule:update') || Boolean(busy.value && busy.value !== row.id)}
        loading={busy.value === row.id} onChange={(enabled: boolean) => change(row, { enabled })} /> },
    { prop: 'operate', label: '操作', minWidth: 170, fixed: 'right', formatter: row => <div class="flex gap-12px">
      <ElButton link type="primary" onClick={() => { selected.value = row; recordsVisible.value = true; }}>转账记录</ElButton>
      {hasAuth('transfer-request:test') && (
        <ElButton link type="warning" onClick={() => { testTarget.value = row; testVisible.value = true; }}>转账测试</ElButton>
      )}
    </div> }
  ]
});
let rulesSequence = 0;
async function loadRules() {
  const sequence = ++rulesSequence;
  const result = await fetchAllTransferRules();
  if (!result.error && result.data && sequence === rulesSequence) rules.value = result.data;
}
async function change(row: AutomaticTransferAccount, input: { enabled?: boolean; ruleId?: string | null }) {
  if (busy.value) return;
  busy.value = row.id;
  try {
    const result = await setEnvironmentTransfer(row.id, input);
    if (!result.error) {
      Object.assign(row, result.data);
      await getData();
      if (input.enabled !== undefined) showSwitchMessage(input.enabled, input.enabled ? '已启用自动转账' : '已停用自动转账');
      else window.$message?.success('已保存，策略切换从下一次触发生效');
    }
  } finally { busy.value = ''; }
}
onMounted(loadRules);
useAutoRefresh(refreshData, undefined, computed(() => !busy.value && !recordsVisible.value && !testVisible.value));
function onTestCreated() {
  selected.value = testTarget.value;
  recordsVisible.value = true;
}
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <ElCard class="epay-table-card card-wrapper">
      <div class="epay-table-toolbar">
        <ElForm inline @submit.prevent="getDataByPage()">
          <ElFormItem label="账号 / 环境"><ElInput v-model.trim="search.keyword" clearable @clear="getDataByPage()" /></ElFormItem>
          <ElFormItem><ElButton type="primary" plain @click="getDataByPage()">查询</ElButton></ElFormItem>
        </ElForm>
        <TableHeaderOperation v-model:columns="columnChecks" hide-add hide-delete :loading="loading">
          <ElButton v-if="hasAuth('transfer-rule:read')" @click="router.push('/fund-management/transfer-strategies')">转账策略</ElButton>
          <ElButton @click="selected = null; recordsVisible = true">全部转账记录</ElButton>
        </TableHeaderOperation>
      </div>
      <ElTable v-loading="loading" :data="data" row-key="id">
        <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
        <template #empty>暂无自动转账环境，请先在环境列表开启开关</template>
      </ElTable>
      <div class="mt-20px flex justify-end">
        <ElPagination v-if="mobilePagination.total" v-bind="mobilePagination" layout="total,prev,pager,next,sizes"
          @current-change="mobilePagination['current-change']" @size-change="mobilePagination['size-change']" />
      </div>
    </ElCard>
    <ElDrawer v-model="recordsVisible" title="转账记录" size="90%" destroy-on-close>
      <TransferRequests v-if="recordsVisible" :key="selected?.id || 'all'" :account-id="selected?.id" />
    </ElDrawer>
    <TransferTestDrawer
      v-model="testVisible"
      :account-id="testTarget?.id"
      :account-name="testTarget?.profileNo || testTarget?.externalId"
      @created="onTestCreated"
    />
  </div>
</template>
