<script setup lang="tsx">
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { useTableQuery } from '@/hooks/common/table-query';
import { useTableSelection } from '@/hooks/common/table-selection';
import { ref } from 'vue';
import { enableStatusRecord } from '@/constants/business';
import { fetchDeleteRole, fetchGetRoleList } from '@/service/api';
import { defaultTransform, useTableOperate, useUIPaginatedTable } from '@/hooks/common/table';
import { $t } from '@/locales';
import RoleOperateDrawer from './modules/role-operate-drawer.vue';
import RoleSearch from './modules/role-search.vue';

const searchParams = ref(getInitSearchParams());
const { query, applyQuery } = useTableQuery(searchParams);

function getInitSearchParams(): Api.SystemManage.RoleSearchParams {
  return {
    current: 1,
    size: 10,
    status: undefined,
    roleName: undefined,
    roleCode: undefined
  };
}

const { columns, columnChecks, data, loading, getData, refreshData, getDataByPage, mobilePagination } = useUIPaginatedTable({
  onSearch: applyQuery,
  paginationProps: {
    currentPage: searchParams.value.current,
    pageSize: searchParams.value.size
  },
  api: () => fetchGetRoleList(query.value),
  transform: response => defaultTransform(response),
  onPaginationParamsChange: params => {
    searchParams.value.current = query.value.current = params.currentPage;
    searchParams.value.size = query.value.size = params.pageSize;
  },
  columns: () => [
    { prop: 'selection', type: 'selection', reserveSelection: true, width: 48 },
    { prop: 'index', type: 'index', label: $t('common.index'), width: 64 },
    { prop: 'roleName', label: $t('page.manage.role.roleName'), minWidth: 120 },
    { prop: 'roleCode', label: $t('page.manage.role.roleCode'), minWidth: 120 },
    { prop: 'roleDesc', label: $t('page.manage.role.roleDesc'), minWidth: 120 },
    {
      prop: 'status',
      label: $t('page.manage.role.roleStatus'),
      width: 100,
      formatter: row => {
        if (row.status === undefined) {
          return '';
        }

        const tagMap: Record<Api.Common.EnableStatus, UI.ThemeColor> = {
          1: 'success',
          2: 'warning'
        };

        const label = $t(enableStatusRecord[row.status]);

        return <ElTag type={tagMap[row.status]}>{label}</ElTag>;
      }
    },
    {
      prop: 'operate',
      label: $t('common.operate'),
      width: 130,
      fixed: 'right',
      formatter: row => (
        <div class="flex-center">
          <ElButton type="primary" plain size="small" onClick={() => edit(row.id)}>
            {$t('common.edit')}
          </ElButton>
          <ElPopconfirm title={$t('common.confirmDelete')} onConfirm={() => handleDelete(row.id)}>
            {{
              reference: () => (
                <ElButton type="danger" plain size="small">
                  {$t('common.delete')}
                </ElButton>
              )
            }}
          </ElPopconfirm>
        </div>
      )
    }
  ]
});

const {
  drawerVisible,
  operateType,
  editingData,
  handleAdd,
  handleEdit,
  checkedRowKeys,
  onBatchDeleted,
  onDeleted
  // closeDrawer
} = useTableOperate(data, 'id', getData);

const deleting = ref(false);
const { tableRef, handleSelectionChange } = useTableSelection(data, 'id', checkedRowKeys);

async function handleBatchDelete() {
  if (deleting.value) return;
  deleting.value = true;
  try {
    // Stop on the first failure and refresh any deletions already completed.
    /* eslint-disable no-await-in-loop */
    for (const id of [...checkedRowKeys.value]) {
      const { error } = await fetchDeleteRole(id);
      if (error) {
        await getData();
        return;
      }
    }
    /* eslint-enable no-await-in-loop */
    await onBatchDeleted();
  } finally {
    deleting.value = false;
  }
}

async function handleDelete(id: string) {
  if (deleting.value) return;
  deleting.value = true;
  try {
    const { error } = await fetchDeleteRole(id);
    if (!error) await onDeleted();
  } finally {
    deleting.value = false;
  }
}

async function resetSearchParams() {
  searchParams.value = { ...getInitSearchParams(), size: searchParams.value.size };
  await getDataByPage();
}

function edit(id: string) {
  handleEdit(id);
}
useAutoRefresh(refreshData, undefined, () => !drawerVisible.value && !deleting.value);
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <ElCard class="epay-table-card card-wrapper">
      <div class="epay-table-toolbar">
        <RoleSearch v-model:model="searchParams" @reset="resetSearchParams" @search="getDataByPage" />
        <div class="epay-table-actions">
          <TableHeaderOperation
            v-model:columns="columnChecks"
            :disabled-delete="checkedRowKeys.length === 0"
            :loading="loading"
            @add="handleAdd"
            @delete="handleBatchDelete"
          />
        </div>
      </div>

      <div class="min-w-0">
        <ElTable ref="tableRef"
          v-loading="loading"
          border
          :data="data"
          row-key="id"
          @selection-change="handleSelectionChange"
        >
          <ElTableColumn v-for="col in columns" :key="col.prop" v-bind="col" />
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
      <RoleOperateDrawer
        v-model:visible="drawerVisible"
        :operate-type="operateType"
        :row-data="editingData"
        @submitted="getDataByPage"
      />
    </ElCard>
  </div>
</template>

<style lang="scss" scoped>
:deep(.el-card) {
  .ht50 {
    height: calc(100% - 50px);
  }
}
</style>
