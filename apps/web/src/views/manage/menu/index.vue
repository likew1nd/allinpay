<script setup lang="tsx">
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { useTableSelection } from '@/hooks/common/table-selection';
import { ref } from 'vue';
import type { Ref } from 'vue';
import { useBoolean } from '@sa/hooks';
import { yesOrNoRecord } from '@/constants/common';
import { enableStatusRecord, menuTypeRecord } from '@/constants/business';
import { fetchDeleteMenu, fetchGetAllPages, fetchGetMenuList } from '@/service/api';
import { defaultTransform, useTableOperate, useUIPaginatedTable } from '@/hooks/common/table';
import { $t } from '@/locales';
import SvgIcon from '@/components/custom/svg-icon.vue';
import MenuOperateModal, { type OperateType } from './modules/menu-operate-modal.vue';

const { bool: visible, setTrue: openModal } = useBoolean();

const pageParams = { current: 1, size: 10 };

const { columns, columnChecks, data, loading, pagination, getData, refreshData, getDataByPage } = useUIPaginatedTable({
  api: () => fetchGetMenuList(pageParams),
  onPaginationParamsChange: ({ currentPage = 1, pageSize = 10 }) => {
    pageParams.current = currentPage;
    pageParams.size = pageSize;
  },
  transform: response => defaultTransform(response),
  columns: () => [
    { prop: 'selection', type: 'selection', reserveSelection: true, width: 48 },
    { prop: 'id', label: $t('page.manage.menu.id') },
    {
      prop: 'menuType',
      label: $t('page.manage.menu.menuType'),
      width: 90,
      formatter: row => {
        const tagMap: Record<Api.SystemManage.MenuType, UI.ThemeColor> = {
          1: 'info',
          2: 'primary'
        };

        const label = $t(menuTypeRecord[row.menuType]);

        return <ElTag type={tagMap[row.menuType]}>{label}</ElTag>;
      }
    },
    {
      prop: 'menuName',
      label: $t('page.manage.menu.menuName'),
      minWidth: 120,
      formatter: row => {
        const { i18nKey, menuName } = row;

        const label = i18nKey ? $t(i18nKey) : menuName;

        return <span>{label}</span>;
      }
    },
    {
      prop: 'icon',
      label: $t('page.manage.menu.icon'),
      width: 100,
      formatter: row => {
        const icon = row.iconType === '1' ? row.icon : undefined;

        const localIcon = row.iconType === '2' ? row.icon : undefined;

        return (
          <div class="flex-center">
            <SvgIcon icon={icon} localIcon={localIcon} class="text-icon" />
          </div>
        );
      }
    },
    {
      prop: 'routeName',
      label: $t('page.manage.menu.routeName'),
      minWidth: 120
    },
    {
      prop: 'routePath',
      label: $t('page.manage.menu.routePath'),
      minWidth: 120
    },
    {
      prop: 'status',
      label: $t('page.manage.menu.menuStatus'),
      width: 80,
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
      prop: 'hideInMenu',
      label: $t('page.manage.menu.hideInMenu'),
      width: 80,
      formatter: row => {
        const hide: CommonType.YesOrNo = row.hideInMenu ? 'Y' : 'N';

        const tagMap: Record<CommonType.YesOrNo, UI.ThemeColor> = {
          Y: 'danger',
          N: 'info'
        };

        const label = $t(yesOrNoRecord[hide]);

        return <ElTag type={tagMap[hide]}>{label}</ElTag>;
      }
    },
    { prop: 'parentId', label: $t('page.manage.menu.parentId'), width: 90 },
    { prop: 'order', label: $t('page.manage.menu.order'), width: 60 },
    {
      prop: 'operate',
      label: $t('common.operate'),
      width: 270,
      fixed: 'right',
      formatter: row => (
        <div class="flex-center justify-end pr-10px">
          {row.menuType === '1' && (
            <ElButton type="primary" plain size="small" onClick={() => handleAddChildMenu(row)}>
              {$t('page.manage.menu.addChildMenu')}
            </ElButton>
          )}
          <ElButton type="primary" plain size="small" onClick={() => handleEdit(row)}>
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

const { checkedRowKeys, onBatchDeleted, onDeleted } = useTableOperate(data, 'id', getData);

const operateType = ref<OperateType>('add');

/** the edit menu data or the parent menu data when adding a child menu */
const editingData: Ref<Api.SystemManage.Menu | null> = ref(null);

function handleAdd() {
  operateType.value = 'add';
  editingData.value = null;
  openModal();
}

const deleting = ref(false);
const { tableRef, handleSelectionChange } = useTableSelection(data, 'id', checkedRowKeys);

async function handleBatchDelete() {
  if (deleting.value) return;
  deleting.value = true;
  try {
    const ids: number[] = [];
    function collect(rows: Api.SystemManage.Menu[]) {
      rows.forEach(row => {
        if (row.children) collect(row.children);
        if (checkedRowKeys.value.includes(row.id)) ids.push(row.id);
      });
    }
    collect(data.value);
    // Delete children before parents and stop on the first failure.
    /* eslint-disable no-await-in-loop */
    for (const id of ids) {
      const { error } = await fetchDeleteMenu(id);
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

async function handleDelete(id: number) {
  if (deleting.value) return;
  deleting.value = true;
  try {
    const { error } = await fetchDeleteMenu(id);
    if (!error) await onDeleted();
  } finally {
    deleting.value = false;
  }
}

function handleEdit(item: Api.SystemManage.Menu) {
  operateType.value = 'edit';
  editingData.value = { ...item };

  openModal();
}

function handleAddChildMenu(item: Api.SystemManage.Menu) {
  operateType.value = 'addChild';

  editingData.value = { ...item };

  openModal();
}

const allPages = ref<string[]>([]);

async function getAllPages() {
  const { data: pages } = await fetchGetAllPages();
  allPages.value = pages || [];
}

function init() {
  getAllPages();
}

// init
init();
useAutoRefresh(refreshData, undefined, () => !visible.value && !deleting.value);
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <ElCard class="epay-table-card card-wrapper">
      <div class="epay-table-toolbar">
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
            v-if="pagination.total"
            layout="total,prev,pager,next,sizes"
            v-bind="pagination"
            @current-change="pagination['current-change']"
            @size-change="pagination['size-change']"
          />
        </div>
      </div>
      <MenuOperateModal
        v-model:visible="visible"
        :operate-type="operateType"
        :row-data="editingData"
        :all-pages="allPages"
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
