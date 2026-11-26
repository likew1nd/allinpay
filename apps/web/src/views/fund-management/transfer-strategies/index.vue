<script setup lang="tsx">
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  createTransferDraft,
  deleteTransferRule,
  fetchAllTransferRules,
  fetchTransferRuleDeleteCheck,
  setTransferRuleFlags
} from '@/service/api';
import type { TransferRule } from '@/service/api';
import EpayDeleteDialog from '@/components/custom/epay-delete-dialog.vue';
import EpayStatusSwitch from '@/components/custom/epay-status-switch.vue';
import { showSwitchMessage } from '@/utils/message';
import { useUIPaginatedTable } from '@/hooks/common/table';
import { useAuth } from '@/hooks/business/auth';
import StrategyWorkspace from './modules/strategy-workspace.vue';

const route = useRoute();
const router = useRouter();
const { hasAuth } = useAuth();
// 删除弹窗：先检查占用（被哪些环境绑定、是否有正在执行的转账），无占用才允许输入“删除”确认
const deleteVisible = ref(false);
const deleteTarget = ref({ id: '', name: '', isTemplate: false });
// 正在切换启用开关的策略 ID，切换期间该开关禁用并暂停自动刷新
const togglingKeys = ref(new Set<string>());
const selectedId = computed(() => (typeof route.query.strategy === 'string' ? route.query.strategy : ''));
const createDialog = ref(false);
const creating = ref(false);
const createForm = ref({ name: '', description: '', isTemplate: false });
const workspaceId = computed(() => (['new', 'template'].includes(selectedId.value) ? '' : selectedId.value));
const search = ref({ keyword: '', type: '' });
const applied = ref({ keyword: '', type: '' });
const params = ref({ current: 1, size: 20 });
const { columns, columnChecks, data, loading, getData, refreshData, getDataByPage, mobilePagination } = useUIPaginatedTable({
  immediate: false,
  api: async () => {
    const query = { ...applied.value, ...params.value };
    const result = await fetchAllTransferRules();
    return { ...result, query };
  },
  isResponseValid: result => !result.error && result.data !== null,
  transform: result => {
    const { keyword, type, current, size } = result.query;
    const rows = (result.data ?? []).filter(
      row =>
        row.name.toLowerCase().includes(keyword.toLowerCase()) &&
        (!type || (type === 'template' ? row.isTemplate : !row.isTemplate))
    );
    const page = Math.min(current, Math.max(1, Math.ceil(rows.length / size)));
    return { data: rows.slice((page - 1) * size, page * size), total: rows.length, pageNum: page, pageSize: size };
  },
  paginationProps: { pageSize: 20, pageSizes: [20, 50, 100] },
  onPaginationParamsChange: value => {
    params.value = { current: value.currentPage ?? 1, size: value.pageSize ?? 20 };
  },
  columns: () => [
    // 名称 + 说明合并在一个单元格，和站点策略列表保持一致
    {
      prop: 'name',
      label: '策略名称',
      minWidth: 280,
      formatter: row => (
        <div class="epay-site-cell">
          <span class="epay-color-icon">
            <SvgIcon icon="tabler:adjustments-horizontal" />
          </span>
          <div>
            <button type="button" class="epay-site-cell__name" onClick={() => enterStrategy(row.id)}>
              {row.name}
            </button>
            {row.description && <small title={row.description}>{row.description}</small>}
          </div>
        </div>
      )
    },
    { prop: 'ruleCount', label: '规则数', width: 100, align: 'center', formatter: row => ruleCount(row) },
    { prop: 'reserveAmount', label: '保留余额（元）', minWidth: 140 },
    { prop: 'dailyLimit', label: '每日转出限额（元）', minWidth: 170, formatter: row => row.dailyLimit ?? '不限' },
    // 开关统一用 EpayStatusSwitch；模板不参与自动转账，没有启停开关，只标注“模板”
    {
      prop: 'enabled',
      label: '状态',
      width: 110,
      align: 'center',
      formatter: row =>
        row.isTemplate ? (
          <ElTag type="info">模板</ElTag>
        ) : (
          <EpayStatusSwitch
            checked={row.enabled}
            label={`${row.name} 启用`}
            disabled={!hasAuth('transfer-rule:update')}
            loading={togglingKeys.value.has(row.id)}
            onChange={(value: boolean) => toggleEnabled(row, value)}
          />
        )
    },
    {
      prop: 'operate',
      label: '操作',
      width: 170,
      align: 'center',
      fixed: 'right',
      formatter: row => (
        <div class="flex items-center justify-center gap-12px">
          <ElButton link type="primary" onClick={() => enterStrategy(row.id)}>
            {hasAuth('transfer-rule:update') ? '进入配置' : '查看配置'}
          </ElButton>
          {hasAuth('transfer-rule:delete') && (
            <ElButton link type="danger" onClick={() => openDelete(row)}>
              删除
            </ElButton>
          )}
        </div>
      )
    }
  ]
});
function openDelete(row: TransferRule) {
  deleteTarget.value = { id: row.id, name: row.name, isTemplate: row.isTemplate };
  deleteVisible.value = true;
}
async function toggleEnabled(row: TransferRule, value: boolean) {
  if (togglingKeys.value.has(row.id)) return;
  togglingKeys.value.add(row.id);
  try {
    const result = await setTransferRuleFlags(row.id, { enabled: value });
    if (!result.error) {
      showSwitchMessage(value, value ? '转账策略已启用' : '转账策略已停用');
      await getData();
    }
  } finally {
    togglingKeys.value.delete(row.id);
  }
}
function openCreate(isTemplate = false) {
  createForm.value = { name: '', description: '', isTemplate };
  createDialog.value = true;
}
async function createStrategy() {
  if (creating.value) return;
  if (!createForm.value.name.trim()) {
    window.$message?.warning('请填写策略名称');
    return;
  }
  creating.value = true;
  try {
    const result = await createTransferDraft({
      ...createForm.value,
      name: createForm.value.name.trim(),
      description: createForm.value.description.trim()
    });
    if (!result.error) {
      createDialog.value = false;
      window.$message?.success('已创建，请配置收款目标和转账规则');
      await enterStrategy(result.data.id);
    }
  } finally {
    creating.value = false;
  }
}
function ruleCount(row: TransferRule) {
  return String(row.rules?.length ?? 1);
}
function enterStrategy(id: string) {
  return router.push({ query: { ...route.query, strategy: id } });
}
function backToList() {
  const query = { ...route.query };
  delete query.strategy;
  return router.push({ query });
}
function syncSaved(id: string) {
  return router.replace({ query: { ...route.query, strategy: id } });
}
function queryList() {
  applied.value = { keyword: search.value.keyword.trim(), type: search.value.type };
  return getDataByPage();
}
watch(
  selectedId,
  id => {
    if (id === 'new' || id === 'template') {
      openCreate(id === 'template');
      const query = { ...route.query };
      delete query.strategy;
      router.replace({ query });
    } else if (!id) getData();
  },
  { immediate: true }
);
useAutoRefresh(
  refreshData,
  undefined,
  () => !selectedId.value && !createDialog.value && !creating.value && !deleteVisible.value && !togglingKeys.value.size
);
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <StrategyWorkspace
      v-if="workspaceId"
      :key="workspaceId"
      :strategy-id="workspaceId"
      @back="backToList"
      @saved="syncSaved"
      @create-template="openCreate(true)"
    />
    <ElCard v-else class="epay-table-card card-wrapper">
      <div class="epay-table-toolbar">
        <ElForm inline class="epay-table-search" @submit.prevent="queryList">
          <ElFormItem label="策略名称"
            ><ElInput v-model="search.keyword" clearable placeholder="搜索策略名称" @clear="queryList"
          /></ElFormItem>
          <ElFormItem label="类型"
            ><ElSelect v-model="search.type" clearable placeholder="全部" class="w-140px" @change="queryList"
              ><ElOption label="转账策略" value="strategy" /><ElOption label="模板" value="template" /></ElSelect
          ></ElFormItem>
          <ElFormItem><ElButton type="primary" native-type="submit">搜索</ElButton></ElFormItem>
        </ElForm>
        <TableHeaderOperation v-model:columns="columnChecks" hide-add hide-delete :loading="loading">
          <ElButton v-if="hasAuth('transfer-rule:create')" type="primary" @click="openCreate()">新增策略</ElButton>
          <ElButton v-if="hasAuth('transfer-rule:create')" @click="openCreate(true)">新增模板</ElButton>
        </TableHeaderOperation>
      </div>
      <ElTable v-loading="loading" :data="data" row-key="id" border>
        <ElTableColumn v-for="column in columns" :key="column.prop" v-bind="column" />
        <template #empty>暂无转账策略，请点击新增策略配置规则</template>
      </ElTable>
      <div class="mt-16px flex justify-end">
        <ElPagination
          v-if="mobilePagination.total"
          v-bind="mobilePagination"
          layout="total,prev,pager,next,sizes"
          @current-change="mobilePagination['current-change']"
          @size-change="mobilePagination['size-change']"
        />
      </div>
    </ElCard>
    <ElDialog
      v-model="createDialog"
      :title="createForm.isTemplate ? '新增转账模板' : '新增转账策略'"
      width="min(460px, 95vw)"
      :close-on-click-modal="false"
      :close-on-press-escape="!creating"
      :show-close="!creating"
    >
      <ElForm label-position="top" :disabled="creating" @submit.prevent="createStrategy">
        <ElFormItem :label="createForm.isTemplate ? '模板名称' : '策略名称'" required
          ><ElInput v-model.trim="createForm.name" maxlength="100"
        /></ElFormItem>
        <ElFormItem label="说明"
          ><ElInput v-model="createForm.description" type="textarea" maxlength="500" :rows="3"
        /></ElFormItem>
      </ElForm>
      <template #footer
        ><ElButton :disabled="creating" @click="createDialog = false">取消</ElButton
        ><ElButton type="primary" :loading="creating" @click="createStrategy">创建并进入配置</ElButton></template
      >
    </ElDialog>
    <EpayDeleteDialog
      v-model:visible="deleteVisible"
      :kind="deleteTarget.isTemplate ? '转账模板' : '转账策略'"
      :target-id="deleteTarget.id"
      :target-name="deleteTarget.name"
      :check="fetchTransferRuleDeleteCheck"
      :remove="deleteTransferRule"
      @deleted="queryList"
    />
  </div>
</template>
