<script setup lang="tsx">
import { useTableQuery } from '@/hooks/common/table-query';
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { fetchSiteDataList, updateSiteAutomation } from '@/service/api';
import type { SiteRecord, SiteSearchParams } from '@/service/api';
import { useAppStore } from '@/store/modules/app';
import { useAuth } from '@/hooks/business/auth';
import { defaultTransform, useTableOperate, useUIPaginatedTable } from '@/hooks/common/table';
import { showSwitchMessage } from '@/utils/message';
import { $t } from '@/locales';
import EpayStatusSwitch from '@/components/custom/epay-status-switch.vue';
import { connectionLabel, connectionType, formatTime, structureLabel } from '../modules/shared';
import SiteDetailsDialog from '../modules/site-details-dialog.vue';
import SiteNameCell from '../modules/site-name-cell.vue';
import SiteSearch from './modules/site-search.vue';
import SiteOperateDrawer from './modules/site-operate-drawer.vue';
import SiteDeleteDialog from './modules/site-delete-dialog.vue';

const { hasAuth } = useAuth();
const appStore = useAppStore();
const updatingSites = ref(new Set<string>());
const deleteVisible = ref(false);
const deletingSite = ref<Pick<SiteRecord, 'id' | 'name' | 'baseUrl'> | null>(null);
function showDelete(row: SiteRecord) {
  deletingSite.value = { id: row.id, name: row.name, baseUrl: row.baseUrl };
  deleteVisible.value = true;
}
const detailSiteId = ref('');
const detailVisible = ref(false);
function showDetails(id: string) {
  detailSiteId.value = id;
  detailVisible.value = true;
}
const route = useRoute();
watch(
  () => route.query.siteId,
  id => {
    if (route.name === 'site-management_list' && typeof id === 'string' && hasAuth('site:read')) showDetails(id);
  },
  { immediate: true }
);
const searchParams = ref<SiteSearchParams>({ current: 1, size: 10 });
const { query, applyQuery } = useTableQuery(searchParams);
const { columns, columnChecks, data, loading, getData, refreshData, getDataByPage, mobilePagination } =
  useUIPaginatedTable({
    onSearch: applyQuery,
    api: () => fetchSiteDataList(query.value),
    isResponseValid: response => !response.error,
    transform: response => defaultTransform(response),
    onPaginationParamsChange: params => {
      searchParams.value.current = query.value.current = params.currentPage ?? 1;
      searchParams.value.size = query.value.size = params.pageSize ?? 10;
    },
    columns: () => [
      {
        prop: 'name',
        label: $t('page.site.name'),
        minWidth: 220,
        formatter: row => (
          <SiteNameCell name={row.name} baseUrl={row.baseUrl} />
        )
      },
      {
        prop: 'connectionStatus',
        label: $t('page.site.connectionStatus'),
        width: 120,
        formatter: row => (
          <ElTag type={connectionType(row.connectionStatus)}>{connectionLabel(row.connectionStatus)}</ElTag>
        )
      },
      {
        prop: 'dataStatus',
        label: $t('page.site.dataStatus'),
        minWidth: 140,
        formatter: row => {
          const summary = row.summary;
          if (!summary) return <ElTag type="danger">{$t('page.site.loadFailed')}</ElTag>;
          let key: 'waitingData' | 'staleData' | 'freshData' = summary.stale ? 'staleData' : 'freshData';
          if (!summary.lastSyncAt) key = 'waitingData';
          const syncError = summary.latest?.status === 'FAILED' ? summary.latest.error : null;
          return (
            <div>
              <ElSpace wrap>
                <ElTag type={summary.lastSyncAt && !summary.stale ? 'success' : 'warning'}>
                  {$t(`page.site.${key}`)}
                </ElTag>
                {summary.latest?.status === 'FAILED' && <ElTag type="danger">{$t('page.site.syncFailed')}</ElTag>}
              </ElSpace>
              {syncError && (
                <ElTooltip content={syncError} trigger={['hover', 'focus']}>
                  <p tabindex={0} class="text-danger mt-4px truncate text-12px">
                    {syncError}
                  </p>
                </ElTooltip>
              )}
            </div>
          );
        }
      },
      {
        prop: 'structureStatus',
        label: $t('page.site.structureStatus'),
        width: 140,
        formatter: row => (
          <ElTag type={row.structureStatus === 'INCOMPATIBLE' ? 'danger' : 'info'}>
            {structureLabel(row.structureStatus)}
          </ElTag>
        )
      },
      {
        prop: 'automationPaused',
        label: $t('page.site.automationStatus'),
        width: 110,
        formatter: row => {
          const updating = updatingSites.value.has(row.id);
          const statusKey = row.automationPaused ? 'page.site.automationStopped' : 'page.site.automationEnabled';
          const label = $t(updating ? 'page.site.automationUpdating' : statusKey);
          const tag = <ElTag type={row.automationPaused ? 'danger' : 'success'}>{label}</ElTag>;
          return (
            <ElTooltip content={$t('page.site.automationHint')}>
              {hasAuth('site:update') ? (
                <EpayStatusSwitch
                  checked={!row.automationPaused}
                  label={$t(row.automationPaused ? 'page.site.automationEnable' : 'page.site.automationStop')}
                  loading={updating}
                  onChange={() => toggleAutomation(row)}
                />
              ) : (
                <span>{tag}</span>
              )}
            </ElTooltip>
          );
        }
      },
      {
        prop: 'lastSyncAt',
        label: $t('page.site.lastSync'),
        minWidth: 180,
        formatter: row => formatTime(row.summary?.lastSyncAt)
      },
      {
        prop: 'lastHeartbeatAt',
        label: $t('page.site.lastHeartbeat'),
        minWidth: 180,
        formatter: row => formatTime(row.lastHeartbeatAt)
      },
      {
        prop: 'operate',
        label: $t('common.operate'),
        width: 210,
        fixed: 'right',
        formatter: row => (
          <ElSpace>
            <ElButton link type="primary" size="small" onClick={() => showDetails(row.id)}>
              {$t('page.site.details')}
            </ElButton>
            {hasAuth('site:update') && (
              <ElButton type="primary" link size="small" onClick={() => edit(row.id)}>
                {$t('common.edit')}
              </ElButton>
            )}
            {hasAuth('site:delete') && (
              <ElButton type="danger" link size="small" onClick={() => showDelete(row)}>
                {$t('common.delete')}
              </ElButton>
            )}
          </ElSpace>
        )
      }
    ]
  });
const { drawerVisible, operateType, editingData, handleAdd, handleEdit } = useTableOperate(data, 'id', getData);
async function toggleAutomation(row: SiteRecord) {
  if (!hasAuth('site:update') || updatingSites.value.has(row.id)) return;
  updatingSites.value.add(row.id);
  try {
    const result = await updateSiteAutomation(row.id, !row.automationPaused);
    if (result.error) return;
    const paused = result.data.automationPaused;
    data.value = data.value.map(site => (site.id === row.id ? { ...site, automationPaused: paused } : site));
    showSwitchMessage(!paused, $t(paused ? 'page.site.automationStopSuccess' : 'page.site.automationEnableSuccess'));
    // A new foreground request supersedes any poll started before this change.
    await getData();
  } finally {
    updatingSites.value.delete(row.id);
  }
}
function edit(id: string) {
  handleEdit(id);
}
async function handleSubmitted(id: string) {
  showDetails(id);
  await getData();
}
async function handleDeleted(id: string) {
  if (detailSiteId.value === id) detailVisible.value = false;
  deletingSite.value = null;
  await getDataByPage(1);
}
useAutoRefresh(refreshData, undefined, () =>
  !drawerVisible.value && !deleteVisible.value && !detailVisible.value && !updatingSites.value.size
);

async function resetSearch() {
  searchParams.value = { current: 1, size: searchParams.value.size };
  await getDataByPage();
}
</script>

<template>
  <div class="epay-sites-page flex-col-stretch">
    <ElCard class="epay-site-list-card epay-table-card card-wrapper">
      <div class="epay-table-toolbar">
        <SiteSearch v-model:model="searchParams" @reset="resetSearch" @search="getDataByPage()" />
        <div class="epay-table-actions">
          <TableHeaderOperation
            hide-add
            hide-delete
            :loading="loading"
          >
            <ElButton v-if="hasAuth('site:create')" type="primary" plain @click="handleAdd">
              {{ $t('page.site.add') }}
            </ElButton>
          </TableHeaderOperation>
        </div>
      </div>
      <div>
        <ElTable v-loading="loading" :data="data" row-key="id">
          <TableDataColumns :columns="columns" v-model:checks="columnChecks" :unpin="appStore.isMobile" />
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
    </ElCard>
    <SiteOperateDrawer
      v-model:visible="drawerVisible"
      :operate-type="operateType"
      :row-data="editingData"
      @submitted="handleSubmitted"
    />
    <SiteDetailsDialog v-model:visible="detailVisible" :site-id="detailSiteId" />
    <SiteDeleteDialog v-model:visible="deleteVisible" :site="deletingSite" @deleted="handleDeleted" />
  </div>
</template>
