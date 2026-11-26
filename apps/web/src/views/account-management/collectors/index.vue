<script setup lang="tsx">
import EpayKeywordSearch from '@/components/custom/epay-keyword-search.vue';
import { useTableQuery } from '@/hooks/common/table-query';
import { useTableSelection } from '@/hooks/common/table-selection';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { ElMessageBox } from 'element-plus';
import { deleteCollector, fetchCollectors, fetchScriptBundleVersion, syncCollector, batchNotifyScriptUpdate, updateCollectorMonitoring } from '@/service/api';
import type { CollectorRecord } from '@/service/api';
import { formatTime } from '@/views/site-management/modules/shared';
import { useAppStore } from '@/store/modules/app';
import { useAuth } from '@/hooks/business/auth';
import { defaultTransform, useTableOperate, useUIPaginatedTable } from '@/hooks/common/table';
import { $t } from '@/locales';
import { showSwitchMessage } from '@/utils/message';
import EpayStatusSwitch from '@/components/custom/epay-status-switch.vue';
import EpayBatchCapsule from '@/components/custom/epay-batch-capsule.vue';
import CollectorOperateDrawer from './modules/collector-operate-drawer.vue';
import CollectorDetails from './modules/collector-details.vue';
import CollectorStatistics from './modules/collector-statistics.vue';
import MoneyDetails from './modules/money-details.vue';
import ScriptSettingsForm from './modules/script-settings-form.vue';
import { connectionLabel } from './modules/shared';

const { hasAuth } = useAuth();
const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const collectorId = computed(() => (typeof route.query.collectorId === 'string' ? route.query.collectorId : ''));
const scriptSettingsVisible = computed({
  get: () => route.query.scriptSettings === '1',
  set: (visible: boolean) => {
    router.replace({ query: { ...route.query, scriptSettings: visible ? '1' : undefined } });
  }
});
const search = ref({ current: 1, size: 20, keyword: '' });
const { query, applyQuery } = useTableQuery(search);
const syncing = ref(new Set<string>());
const toggling = ref(new Set<string>());
const deleting = ref(false);
const notifying = ref(false);

// 中心已发布的脚本版本，用于提示采集端可升级
const latestVersion = ref('');


/** 去掉采集端上报的 windows-agent- 前缀，只保留版本号 */
function normalizeVersion(version?: string | null) {
  return (version ?? '').trim().replace(/^windows-agent-/i, '').replace(/^v/i, '');
}

/** 按数字逐段比较版本号，a > b 返回正数 */
function compareVersion(a: string, b: string) {
  const pa = a.split('.').map(n => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function adsPowerMeta(status: CollectorRecord['adsPowerStatus']): { className: string; label: string } {
  if (status === 'AVAILABLE') return { className: 'collector-dot--success', label: '已连接' };
  if (status === 'UNAVAILABLE') return { className: 'collector-dot--danger', label: '失败' };
  return { className: 'collector-dot--warning', label: '未检测' };
}



// 勾选相关
const selectedIds = ref<string[]>([]);
// 勾选后显示底部胶囊；详情页和没有更新权限时不显示
const showBatchActions = computed(() => !collectorId.value && selectedIds.value.length > 0 && hasAuth('collector:update'));


const { columns, columnChecks, data, loading, getData, refreshData, getDataByPage, mobilePagination } =
  useUIPaginatedTable({
    onSearch: applyQuery,
    api: async () => {
      const [collectors, version] = await Promise.all([fetchCollectors(query.value), fetchScriptBundleVersion()]);
      if (collectors.error || version.error) return null;
      return { ...collectors, scriptVersion: normalizeVersion(version.data?.version) };
    },
    isResponseValid: response => Boolean(response && !response.error),
    transform: response => {
      if (!response) return { data: [] as CollectorRecord[], total: 0, pageNum: 1, pageSize: 20 };
      latestVersion.value = response.scriptVersion === '0.0.0' ? '' : response.scriptVersion;
      return defaultTransform(response);
    },
    paginationProps: { currentPage: 1, pageSize: 20, pageSizes: [20, 50, 100] },
    onPaginationParamsChange: params => {
      search.value.current = query.value.current = params.currentPage ?? 1;
      search.value.size = query.value.size = params.pageSize ?? 20;
    },
    columns: () => [
      {
        prop: 'name',
        label: $t('page.collector.name'),
        width: 220,
        fixed: 'left',
        formatter: row => (
          <div class="epay-site-cell">
            <span class="epay-color-icon">
              <SvgIcon icon="tabler:device-desktop-code" />
            </span>
            <div>
              <button type="button" class="epay-site-cell__name" onClick={() => showDetails(row.id)}>
                {row.name}
              </button>
            </div>
          </div>
        )
      },
      {
        prop: 'environmentCount',
        label: $t('page.collector.linkedEnvironmentCount'),
        width: 120,
        align: 'center',
        formatter: row => <strong class="collector-field-value">{row.linkedEnvironmentCount ?? '—'} / {row.environmentCount ?? 0}</strong>
      },
      {
        prop: 'accountSummary',
        label: $t('page.collector.accountStatus'),
        minWidth: 170,
        formatter: row => (
          <div class="grid grid-cols-[auto_auto_auto] items-center gap-x-8px gap-y-6px w-max whitespace-nowrap">
            <span class="collector-state"><i aria-hidden="true" class="collector-dot collector-dot--success" />{$t('page.collector.normal')} <strong>{row.accountSummary?.NORMAL ?? 0}</strong></span>
            <span class="collector-field-muted" aria-hidden="true">/</span>
            <span class="collector-state"><i aria-hidden="true" class="collector-dot collector-dot--danger" />{$t('page.collector.abnormal')} <strong>{(row.accountSummary?.RESTRICTED ?? 0) + (row.accountSummary?.JUDICIAL ?? 0)}</strong></span>
            <span class="collector-state"><i aria-hidden="true" class="collector-dot collector-dot--warning" />{$t('page.collector.restricted')} <strong>{row.accountSummary?.RESTRICTED ?? 0}</strong></span>
            <span class="collector-field-muted" aria-hidden="true">/</span>
            <span class="collector-state"><i aria-hidden="true" class={['collector-dot', row.accountSummary?.JUDICIAL ? 'collector-dot--danger' : 'collector-dot--muted']} />{$t('page.collector.judicial')} <strong>{row.accountSummary?.JUDICIAL ?? 0}</strong></span>
            <span class="col-span-3 justify-self-start collector-state collector-field-muted"><i aria-hidden="true" class="collector-dot collector-dot--unknown" />{$t('page.collector.unknown')} <strong>{row.accountSummary?.UNKNOWN ?? 0}</strong></span>
          </div>
        )
      },
      {
        prop: 'balances',
        label: [$t('page.collector.available'), $t('page.collector.unavailable'), $t('page.collector.pending')].join(' / '),
        minWidth: 220,
        formatter: row => <MoneyDetails class="collector-money" balances={row.balances} compact />
      },
      {
        prop: 'status',
        label: '状态',
        width: 190,
        formatter: row => {
          const meta = adsPowerMeta(row.adsPowerStatus);
          return (
            <div class="grid grid-cols-[max-content_1fr] items-center gap-x-8px gap-y-6px whitespace-nowrap">
              <span class="collector-field-label">AdsPower:</span>
              <span class="collector-state">
                <i aria-hidden="true" class={['collector-dot', meta.className]} />
                {meta.label}
              </span>
              <span class="collector-field-label">服务状态:</span>
              <span class="collector-state">
                <i aria-hidden="true" class={['collector-dot', row.status === 'ONLINE' ? 'collector-dot--success' : row.status === 'ERROR' ? 'collector-dot--danger' : 'collector-dot--warning']} />
                {connectionLabel(row.status)}
              </span>
              {row.lastError && (
                <ElTooltip content={row.lastError} trigger={['hover', 'focus']}>
                  <p tabindex={0} class="col-span-2 collector-field-muted truncate text-12px">{row.lastError}</p>
                </ElTooltip>
              )}
            </div>
          );
        }
      },
      {
        prop: 'version',
        label: '当前版本',
        width: 150,
        formatter: row => {
          const current = normalizeVersion(row.version);
          if (!current) return <span class="text-12px collector-field-muted">—</span>;
          const latest = latestVersion.value;
          const outdated = Boolean(latest) && compareVersion(latest, current) > 0;
          return (
            <span class="whitespace-nowrap text-13px font-mono">
              {current}
              {outdated && (
                <>
                  <span class="mx-4px collector-field-muted" aria-hidden="true">→</span>
                  <span class="collector-field-value">{latest}</span>
                </>
              )}
            </span>
          );
        }
      },
      {
        prop: 'monitoringEnabled',
        label: $t('page.collector.monitoring'),
        width: 100,
        align: 'center',
        formatter: row => (
          <EpayStatusSwitch
            checked={row.monitoringEnabled}
            label={row.monitoringEnabled ? '关闭监控' : '开启监控'}
            disabled={!hasAuth('collector:update')}
            loading={toggling.value.has(row.id)}
            onChange={(checked: boolean) => toggleMonitoring(row, checked)}
          />
        )
      },
      {
        prop: 'environmentSyncedAt',
        label: '同步时间',
        width: 170,
        formatter: row => (
          <div class="text-12px leading-5">
            <div class="whitespace-nowrap">{formatTime(row.environmentSyncedAt)}</div>
            {row.environmentSyncError && (
              <ElTooltip content={row.environmentSyncError} trigger={['hover', 'focus']}>
                <p tabindex={0} class="collector-field-muted truncate">{row.environmentSyncError}</p>
              </ElTooltip>
            )}
          </div>
        )
      },
      {
        prop: 'operate',
        label: $t('common.operate'),
        width: 200,
        fixed: 'right',
        formatter: row => (
          <ElSpace>
            {hasAuth('collector:update') && (
              <>
                <ElButton link type="primary" onClick={() => edit(row.id)}>
                  {$t('common.edit')}
                </ElButton>
                <ElButton link type="primary" loading={syncing.value.has(row.id)} onClick={() => sync(row)}>
                  {$t('page.collector.sync')}
                </ElButton>
              </>
            )}
            {hasAuth('collector:delete') && (
              <ElButton link type="danger" onClick={() => remove(row)}>
                {$t('common.delete')}
              </ElButton>
            )}
          </ElSpace>
        )
      }
    ]
  });
const { tableRef, handleSelectionChange: onSelectionChange } = useTableSelection(data, 'id', selectedIds);
const { drawerVisible, operateType, editingData, handleAdd, handleEdit } = useTableOperate(data, 'id', getData);

function edit(id: string) { handleEdit(id); }
async function showDetails(id: string) {
  await router.push({ query: { ...route.query, collectorId: id } });
}
async function submitted(id: string) {
  await getData();
  showDetails(id);
}
async function sync(row: CollectorRecord) {
  if (syncing.value.has(row.id)) return;
  syncing.value.add(row.id);
  try {
    const result = await syncCollector(row.id);
    if (!result.error) { window.$message?.success('同步指令已排队，等待采集端执行'); await getData(); }
  } finally { syncing.value.delete(row.id); }
}
async function toggleMonitoring(row: CollectorRecord, enabled: boolean) {
  if (toggling.value.has(row.id)) return;
  toggling.value.add(row.id);
  try {
    const result = await updateCollectorMonitoring(row.id, enabled);
    if (!result.error) {
      row.monitoringEnabled = enabled;
      await getData();
      showSwitchMessage(enabled, enabled ? '已开启监控，采集端将继续执行任务' : '已关闭监控，采集端将停止执行任务');
    }
  } finally { toggling.value.delete(row.id); }
}
async function remove(row: CollectorRecord) {
  if (deleting.value) return;
  deleting.value = true;
  try {
    await ElMessageBox.confirm(
      $t('page.collector.deleteConfirm', { name: row.name }),
      $t('page.collector.deleteTitle'),
      { type: 'warning', confirmButtonText: $t('common.confirm'), cancelButtonText: $t('common.cancel') }
    );
    const result = await deleteCollector(row.id);
    if (!result.error) { window.$message?.success($t('page.collector.deleted')); await getDataByPage(1); }
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') throw error;
  } finally { deleting.value = false; }
}

async function batchUpdate() {
  if (notifying.value) return;
  // 固定确认时的范围，避免刷新或选择变化改变实际通知对象。
  const ids = [...selectedIds.value];
  if (!ids.length) return;
  notifying.value = true;
  try {
    await ElMessageBox.confirm(
      `将通知已选 ${ids.length} 个采集端拉取最新脚本包并重启，离线采集端上线后执行。是否继续？`,
      '远程更新脚本',
      { type: 'warning', confirmButtonText: '确认更新', cancelButtonText: '取消' }
    );
    const result = await batchNotifyScriptUpdate(ids);
    if (!result.error) {
      const count = result.data?.notified ?? 0;
      window.$message?.success(count > 0 ? `已通知 ${count} 个采集端更新脚本` : '没有可通知的采集端');
      selectedIds.value = [];
    }
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') throw error;
  } finally { notifying.value = false; }
}

useAutoRefresh(refreshData, undefined, () =>
  !collectorId.value && !drawerVisible.value && !deleting.value && !scriptSettingsVisible.value &&
  !notifying.value && !syncing.value.size && !toggling.value.size
);
</script>

<template>
  <div class="flex-col-stretch gap-16px" :class="{ 'collector-list-page': !collectorId }">
    <CollectorStatistics v-if="!collectorId" />
    <CollectorDetails v-if="collectorId" :key="collectorId" :collector-id="collectorId" />
    <ElCard v-else class="epay-table-card card-wrapper">
      <div class="epay-table-toolbar">
        <EpayKeywordSearch v-model="search.keyword" :placeholder="$t('page.collector.keyword')" @search="getDataByPage()" />
        <div class="epay-table-actions">
          <TableHeaderOperation
            hide-add
            hide-delete
            :loading="loading"
          >
            <ElButton v-if="hasAuth('collector:create')" type="primary" plain @click="handleAdd">
              {{ $t('page.collector.add') }}
            </ElButton>
            <ElButton @click="scriptSettingsVisible = true">
              <template #icon><SvgIcon icon="tabler:settings" /></template>
              {{ $t('route.account-management_script-settings') }}
            </ElButton>
          </TableHeaderOperation>
        </div>
      </div>
      <ElTable ref="tableRef" v-loading="loading" class="collector-table" :data="data" row-key="id" @selection-change="onSelectionChange">
        <ElTableColumn type="selection" reserve-selection width="40" :fixed="appStore.isMobile ? false : 'left'" />
        <TableDataColumns :columns="columns" v-model:checks="columnChecks" :unpin="appStore.isMobile" />
      </ElTable>
      <div class="mt-20px flex justify-end">
        <ElPagination
          v-if="mobilePagination.total"
          v-bind="mobilePagination"
          layout="total,prev,pager,next,sizes"
          @current-change="mobilePagination['current-change']"
          @size-change="mobilePagination['size-change']"
        />
      </div>
    </ElCard>
    <EpayBatchCapsule :visible="showBatchActions" :count="selectedIds.length" :busy="notifying" @clear="selectedIds = []">
      <ElButton text :loading="notifying" @click="batchUpdate">更新脚本</ElButton>
    </EpayBatchCapsule>
    <ElDialog
      v-model="scriptSettingsVisible"
      class="script-settings-dialog"
      :title="$t('route.account-management_script-settings')"
      width="min(calc(100vw - 32px), 1120px)"
      top="6vh"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <template #header="{ titleId, titleClass }">
        <div class="flex items-center gap-12px pr-32px">
          <span class="h-42px w-42px flex-center rounded-12px bg-primary/10 text-22px text-primary">
            <SvgIcon icon="tabler:adjustments" aria-hidden="true" />
          </span>
          <div>
            <h2 :id="titleId" :class="titleClass" class="m-0">{{ $t('route.account-management_script-settings') }}</h2>
            <p class="mb-0 mt-4px text-12px text-[var(--epay-muted)]">统一配置采集端的巡检、登录与脚本更新</p>
          </div>
        </div>
      </template>
      <ScriptSettingsForm @close="scriptSettingsVisible = false" />
    </ElDialog>
    <CollectorOperateDrawer
      v-model:visible="drawerVisible"
      :operate-type="operateType"
      :row-data="editingData"
      @submitted="submitted"
    />
  </div>
</template>

<style scoped>
.collector-table :deep(.collector-state) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--epay-text);
}

.collector-table :deep(.collector-state strong),
.collector-table :deep(.collector-field-value) {
  color: var(--epay-text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.collector-table :deep(.collector-field-muted),
.collector-table :deep(.collector-field-label) {
  color: var(--epay-muted);
}

.collector-table :deep(.collector-field-label) {
  font-weight: 500;
}

.collector-table :deep(.collector-dot) {
  display: inline-block;
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.collector-table :deep(.collector-dot--success) {
  color: var(--epay-monitoring);
}

.collector-table :deep(.collector-dot--danger) {
  color: var(--epay-danger);
}

.collector-table :deep(.collector-dot--warning) {
  color: var(--epay-warning);
}

.collector-table :deep(.collector-dot--muted) {
  color: var(--epay-muted);
}

.collector-table :deep(.collector-dot--unknown) {
  box-sizing: border-box;
  border: 1px solid var(--epay-muted);
  background: transparent;
}

.collector-table :deep(.epay-site-cell__name) {
  font-weight: 600;
}

.collector-table :deep(.collector-money .money-details__separator),
.collector-table :deep(.collector-money .text-warning) {
  color: var(--epay-muted);
}

/* 固定留出底部操作空间，勾选时不推动表格，滚动到底也能完整看到分页。 */
.collector-list-page {
  padding-bottom: calc(128px + env(safe-area-inset-bottom, 0px));
}

@media (max-width: 639px) {
  .collector-list-page {
    padding-bottom: calc(160px + env(safe-area-inset-bottom, 0px));
  }
}

:global(.el-dialog.script-settings-dialog) {
  height: min(820px, calc(100dvh - 32px));
  background: var(--epay-surface);
}

:global(.script-settings-dialog > .el-dialog__body) {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
