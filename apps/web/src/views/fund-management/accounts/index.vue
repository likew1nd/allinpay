<script setup lang="tsx">
import EpayKeywordSearch from '@/components/custom/epay-keyword-search.vue';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { useTableQuery } from '@/hooks/common/table-query';
import { ref } from 'vue';
import { createFundAccount, fetchAccounts, fetchFundAccounts, updateFundAccount } from '@/service/api';
import type { AccountRecord, FundAccount } from '@/service/api';
import { useAuth } from '@/hooks/business/auth';
import { useForm, useFormRules } from '@/hooks/common/form';
import { defaultTransform, useUIPaginatedTable } from '@/hooks/common/table';
import { formatTime } from '@/views/site-management/modules/shared';

const { hasAuth } = useAuth();
const statusLabels: Record<string, string> = {
  ACTIVE: '正常',
  FROZEN: '已冻结',
  CLOSED: '已关闭'
};
const search = ref({ current: 1, size: 20, keyword: '' });
const { query, applyQuery } = useTableQuery(search);
const { columns, columnChecks, data, getData, refreshData, getDataByPage, loading, mobilePagination } = useUIPaginatedTable({
  onSearch: applyQuery,
  api: () => fetchFundAccounts(query.value),
  transform: response => defaultTransform(response),
  paginationProps: { currentPage: 1, pageSize: 20, pageSizes: [20, 50, 100] },
  onPaginationParamsChange: params => {
    search.value.current = query.value.current = params.currentPage ?? 1;
    search.value.size = query.value.size = params.pageSize ?? 20;
  },
  columns: () => [
    { prop: 'name', label: '账户名称', minWidth: 160 },
    { prop: 'owner', label: '归属主体', minWidth: 140 },
    { prop: 'balance', label: '账面余额', width: 130 },
    { prop: 'frozen', label: '冻结金额', width: 130 },
    {
      prop: 'account',
      label: '采集账号',
      minWidth: 160,
      formatter: row => row.account?.name || row.account?.externalId || '未关联'
    },
    {
      prop: 'observedBalance',
      label: '采集余额',
      minWidth: 160,
      formatter: row =>
        row.account?.balance === null || row.account?.balance === undefined
          ? '暂无'
          : row.account.balance
    },
    {
      prop: 'balanceAt',
      label: '余额采集时间',
      minWidth: 180,
      formatter: row => formatTime(row.account?.balanceAt ?? null)
    },
    {
      prop: 'status',
      label: '状态',
      width: 100,
      formatter: row => statusLabels[row.status] || row.status
    },
    {
      prop: 'operate',
      label: '操作',
      width: 130,
      fixed: 'right',
      formatter: row =>
        hasAuth('fund-account:update') ? (
          <ElButton size="small" onClick={() => openBinding(row)}>
            关联采集账号
          </ElButton>
        ) : (
          ''
        )
    }
  ]
});
const drawer = ref(false);
const saving = ref(false);
const accountLoading = ref(false);
const accounts = ref<AccountRecord[]>([]);
const editing = ref<FundAccount | null>(null);
const model = ref({ name: '', owner: '', accountId: '' });
const { formRef, validate } = useForm();
const { defaultRequiredRule } = useFormRules();
const rules = {
  name: defaultRequiredRule,
  owner: defaultRequiredRule
};
let searchVersion = 0;

async function searchAccounts(keyword = '') {
  searchVersion += 1;
  const version = searchVersion;
  accountLoading.value = true;
  try {
    const result = await fetchAccounts({ current: 1, size: 100, keyword });
    if (version === searchVersion && !result.error) accounts.value = result.data.records;
  } finally {
    if (version === searchVersion) accountLoading.value = false;
  }
}
function openAdd() {
  editing.value = null;
  model.value = { name: '', owner: '', accountId: '' };
  drawer.value = true;
  if (hasAuth('account:read')) searchAccounts();
}
function openBinding(row: FundAccount) {
  editing.value = row;
  model.value = {
    name: row.name,
    owner: row.owner,
    accountId: row.accountId || ''
  };
  drawer.value = true;
  if (hasAuth('account:read')) searchAccounts();
}
async function save() {
  if (saving.value) return;
  await validate();
  saving.value = true;
  try {
    const result = editing.value
      ? await updateFundAccount(editing.value.id, model.value.accountId || null)
      : await createFundAccount({
          ...model.value,
          accountId: model.value.accountId || null
        });
    if (!result.error) {
      drawer.value = false;
      window.$message?.success('资金账户已保存');
      await getData();
    }
  } finally {
    saving.value = false;
  }
}
useAutoRefresh(refreshData, undefined, () => !drawer.value && !saving.value);
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <ElAlert
      type="info"
      show-icon
      :closable="false"
      title="账面余额和采集余额分别展示。转账使用最近 5 分钟内采集的余额；同一采集账号只能关联一个资金账户。"
    />
    <ElCard class="epay-table-card card-wrapper">
      <div class="epay-table-toolbar">
        <EpayKeywordSearch v-model="search.keyword" placeholder="账户名称或归属主体" label="搜索资金账户" @search="getDataByPage()" />
        <div class="epay-table-actions">
          <div class="flex flex-wrap gap-8px">
            <ElButton v-if="hasAuth('fund-account:create')" type="primary" @click="openAdd">新增账户</ElButton>
          </div>
        </div>
      </div>

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
    </ElCard>
    <ElDrawer
      v-model="drawer"
      :title="editing ? '关联采集账号' : '新增资金账户'"
      size="min(480px, 100vw)"
      destroy-on-close
    >
      <ElAlert
        v-if="editing"
        class="mb-16px"
        type="warning"
        :closable="false"
        title="已有转账记录或启用中的规则时不能改绑，以免历史付款使用新的资金来源。"
      />
      <ElForm ref="formRef" :model="model" :rules="rules" label-position="top" @submit.prevent="save">
        <ElFormItem label="账户名称" prop="name">
          <ElInput v-model.trim="model.name" :disabled="Boolean(editing)" maxlength="100" />
        </ElFormItem>
        <ElFormItem label="归属主体" prop="owner">
          <ElInput v-model.trim="model.owner" :disabled="Boolean(editing)" maxlength="100" />
        </ElFormItem>
        <ElFormItem v-if="hasAuth('account:read')" label="采集账号（可选）">
          <ElSelect
            v-model="model.accountId"
            clearable
            filterable
            remote
            :remote-method="searchAccounts"
            :loading="accountLoading"
            placeholder="输入账号名称搜索"
            class="w-full"
          >
            <ElOption
              v-if="editing?.account && !accounts.some(a => a.id === editing?.accountId)"
              :value="editing.account.id"
              :label="editing.account.name || editing.account.externalId"
            />
            <ElOption
              v-for="account in accounts"
              :key="account.id"
              :value="account.id"
              :label="account.name || account.externalId"
            />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="drawer = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="save">保存</ElButton>
      </template>
    </ElDrawer>
  </div>
</template>
