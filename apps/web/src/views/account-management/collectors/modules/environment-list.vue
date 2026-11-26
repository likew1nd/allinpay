<script setup lang="tsx">
import EpayKeywordSearch from '@/components/custom/epay-keyword-search.vue';
import { useTableQuery } from '@/hooks/common/table-query';
import { useTableSelection } from '@/hooks/common/table-selection';
import { computed, onActivated, onDeactivated, onMounted, ref } from 'vue';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import {
  updateAccountMode,
  batchRefreshAccountAppIds,
  fetchCollector,
  fetchCollectorAccounts,
  fetchAccounts,
  syncCollector
} from '@/service/api';
import type { AccountMode, AccountRecord, CollectorRecord } from '@/service/api';
import { useAppStore } from '@/store/modules/app';
import { useAuth } from '@/hooks/business/auth';
import { defaultTransform, useUIPaginatedTable } from '@/hooks/common/table';
import { $t } from '@/locales';
import { formatTime } from '@/views/site-management/modules/shared';
import EnvironmentModeSwitch from './environment-mode-switch.vue';
import CollectorOperateDrawer from './collector-operate-drawer.vue';
import AccountCredentialsDrawer from './account-credentials-drawer.vue';
import AccountMonitoringLogs from './account-monitoring-logs.vue';
import AccountEvidenceImage from './account-evidence-image.vue';
import MoneyDetails from './money-details.vue';
import CollectorStatistics from './collector-statistics.vue';
import {
  accountMoney,
  businessTags,
  loginStateLabel,
  loginStateType,
  runtimeStateLabel,
  runtimeStateType
} from './shared';

// 两个入口共用列、详情和操作，避免环境字段后续修改时遗漏另一处。
const props = defineProps<{ collectorId?: string }>();
const { hasAuth } = useAuth();
const appStore = useAppStore();

const statisticsRef = ref<InstanceType<typeof CollectorStatistics> | null>(null);
const collector = ref<CollectorRecord | null>(null);
const selectedAccount = ref<AccountRecord | null>(null);
const accountVisible = ref(false);
const linkedAccount = ref<AccountRecord | null>(null);
const linkedChannels = computed(() => (linkedAccount.value?.linkedSites ?? []).flatMap(site =>
  site.channels.map(channel => ({ ...channel, siteName: site.name, key: `${site.id}:${channel.code}` }))
));
const linkedSitesVisible = ref(false);
const logAccount = ref<AccountRecord | null>(null);
const logsVisible = ref(false);
const editingAccount = ref<AccountRecord | null>(null);
const editingVisible = ref(false);
const syncing = ref(false);
const collectorEditingVisible = ref(false);
// 勾选行 id 集合
const selectedIds = ref<string[]>([]);
// 批量操作 loading
const batchAction = ref<AccountMode | 'app-ids' | null>(null);
const batchLoading = computed(() => batchAction.value !== null);
const pageActive = ref(true);
const capsuleTarget = ref<HTMLElement | 'body'>('body');
// 目标模式用于提交动效，真实数据只在接口确认后更新。
const pendingModes = ref(new Map<string, AccountMode>());
const canEditMode = computed(() => hasAuth('account:update') && hasAuth('transfer-rule:update'));
const modeBusy = computed(() => batchLoading.value || syncing.value || pendingModes.value.size > 0);

const search = ref({ current: 1, size: 20, keyword: '' });
const { query, applyQuery } = useTableQuery(search);
const { columns, columnChecks, data, loading, getData, refreshData, getDataByPage, mobilePagination } =
  useUIPaginatedTable({
    onSearch: applyQuery,
    api: async () => {
      const [accounts, details] = await Promise.all([
        props.collectorId ? fetchCollectorAccounts(props.collectorId, query.value) : fetchAccounts(query.value),
        props.collectorId ? fetchCollector(props.collectorId) : Promise.resolve(null)
      ]);
      if (accounts.error || details?.error) return null;
      return { ...accounts, collector: details?.data ?? null };
    },
    isResponseValid: response => Boolean(response && !response.error),
    transform: response => {
      if (!response) return { data: [] as AccountRecord[], total: 0, pageNum: 1, pageSize: 20 };
      collector.value = response.collector;
      return defaultTransform(response);
    },
    paginationProps: { currentPage: 1, pageSize: 20, pageSizes: [20, 50, 100] },
    onPaginationParamsChange: params => {
      search.value.current = query.value.current = params.currentPage ?? 1;
      search.value.size = query.value.size = params.pageSize ?? 20;
    },
    columns: () => [
      ...(!props.collectorId ? [{
        prop: 'collector',
        label: $t('page.collector.columnLabel'),
        minWidth: 180,
        fixed: 'left' as const,
        formatter: (row: AccountRecord) => row.collector?.name || row.collectorId || '—'
      }] : []),
      {
        prop: 'profileNo',
        label: $t('page.collector.profileNo'),
        width: 90,
        fixed: 'left',
        formatter: row => row.profileNo || row.externalId
      },
      {
        prop: 'name',
        label: $t('page.collector.environment'),
        minWidth: 240,
        formatter: row => (
          <div class="account-environment">
            <span class="account-environment__group" title={row.groupName || '—'}>{row.groupName || '—'}</span>
            <span class="account-environment__name" title={row.name || '—'}>{row.name || '—'}</span>
          </div>
        )
      },
      {
        prop: 'mode',
        label: $t('page.collector.mode'),
        width: 204,
        formatter: row => (
          <div class="environment-mode-cell">
            <EnvironmentModeSwitch
              value={environmentMode(row)}
              label={$t('page.collector.mode') + ' ' + (row.profileNo || row.externalId)}
              hint={!canEditMode.value ? $t('page.collector.modePermissionHint') : modeHint(row)}
              disabled={!canEditMode.value || modeBusy.value}
              pending={pendingModes.value.get(row.id) ?? null}
              onChange={(mode: AccountMode) => setMode(row, mode)}
            />
            {environmentMode(row) === null && <span class="environment-mode-cell__warning">{$t('page.collector.modeInvalid')}</span>}
          </div>
        )
      },
      {
        prop: 'status',
        label: $t('page.collector.state'),
        minWidth: 190,
        formatter: row => (
          <div class="account-status">
            <span class="account-status__label">{$t('page.collector.runtimeShort')}</span>
            <span class="account-status__value" data-tone={row.runtimeState === 'RUNNING' ? 'active' : runtimeStateType(row.runtimeState)}>
              {runtimeStateLabel(row.runtimeState)}
            </span>
            <span class="account-status__label">{$t('page.collector.loginShort')}</span>
            <span class="account-status__value" data-tone={loginStateType(row.status)}>{loginStateLabel(row.status)}</span>
            <span class="account-status__label">{$t('page.collector.accountShort')}</span>
            <div class="account-status__values">
              {businessTags(row).map(tag => (
                <span key={tag.label} class="account-status__value" data-tone={tag.type}>{tag.label}</span>
              ))}
            </div>
            <span class="account-status__label">{$t('page.collector.associationShort')}:</span>
            {row.linkedSites?.length ? (
              <button type="button" class="account-status__value account-status__link" data-tone="success" onClick={() => showLinkedSites(row)}>
                {$t('page.collector.associated')}
              </button>
            ) : (
              <span class="account-status__value">{$t('page.collector.unassociated')}</span>
            )}
          </div>
        )
      },
      {
        prop: 'balance',
        label: [$t('page.collector.available'), $t('page.collector.unavailable'), $t('page.collector.pending')].join(' / '),
        minWidth: 220,
        formatter: row => <MoneyDetails balances={accountMoney(row)} compact />
      },
      {
        prop: 'receiptLimit',
        label: $t('page.collector.receiptPayment'),
        minWidth: 210,
        formatter: row => (
          <div
            class="account-quota flex items-center gap-8px whitespace-nowrap font-mono text-13px font-medium tabular-nums"
            role="group"
            aria-label={`${$t('page.collector.receiptLimit')}: ${quotaText(row.receiptLimit, row.receiptUnlimited)} / ${$t('page.collector.paymentLimit')}: ${quotaText(row.paymentLimit, row.paymentUnlimited)}`}
          >
            <span title={`${$t('page.collector.receiptLimit')}: ${quotaText(row.receiptLimit, row.receiptUnlimited)}`}>
              {quotaText(row.receiptLimit, row.receiptUnlimited)}
            </span>
            <span class="text-muted" aria-hidden="true">/</span>
            <span title={`${$t('page.collector.paymentLimit')}: ${quotaText(row.paymentLimit, row.paymentUnlimited)}`}>
              {quotaText(row.paymentLimit, row.paymentUnlimited)}
            </span>
          </div>
        )
      },
      {
        prop: 'restrictionImage',
        label: $t('page.collector.restrictionImage'),
        width: 110,
        formatter: row => (
          <AccountEvidenceImage
            collectorId={row.collectorId ?? ''}
            accountId={row.id}
            kind="restriction"
            capturedAt={row.collectorId ? row.restrictionImageAt : null}
          />
        )
      },
      {
        prop: 'judicialImage',
        label: $t('page.collector.judicialImage'),
        width: 110,
        formatter: row => (
          <AccountEvidenceImage
            collectorId={row.collectorId ?? ''}
            accountId={row.id}
            kind="judicial"
            capturedAt={row.collectorId ? row.judicialImageAt : null}
          />
        )
      },
      {
        prop: 'operate',
        label: $t('common.operate'),
        width: 250,
        fixed: 'right',
        formatter: row => (
          <div class="flex items-center gap-12px">
            {hasAuth('account:update') && (
              <ElButton link type="primary" disabled={!row.collectorId} onClick={() => editAccount(row)}>
                {$t('common.edit')}
              </ElButton>
            )}
            <ElButton link type="primary" onClick={() => showAccount(row)}>
              {$t('page.collector.details')}
            </ElButton>
            <ElButton link type="primary" disabled={!row.collectorId} onClick={() => showLogs(row)}>
              {$t('page.collector.monitoringLogs')}
            </ElButton>
          </div>
        )
      }
    ]
  });

function quotaText(value: string | null, unlimited: boolean) {
  if (unlimited) return $t('page.collector.unlimited');
  return value === null || value === undefined ? '—' : value;
}
function editAccount(row: AccountRecord) {
  if (!hasAuth('account:update') || !row.collectorId) return;
  editingAccount.value = row;
  editingVisible.value = true;
}
function showAccount(row: AccountRecord) {
  selectedAccount.value = row;
  accountVisible.value = true;
}
function showLinkedSites(row: AccountRecord) {
  linkedAccount.value = row;
  linkedSitesVisible.value = true;
}
function showLogs(row: AccountRecord) {
  if (!row.collectorId) return;
  logAccount.value = row;
  logsVisible.value = true;
}

async function refresh() {
  await Promise.all([getData(), statisticsRef.value?.refresh(true)]);
}
async function sync() {
  if (!props.collectorId || modeBusy.value) return;
  syncing.value = true;
  try {
    const result = await syncCollector(props.collectorId);
    if (!result.error) {
    window.$message?.success('同步指令已排队，等待采集端执行');
      await refresh();
    }
  } finally {
    syncing.value = false;
  }
}

function environmentMode(row: AccountRecord): AccountMode | null {
  if (row.transferEnabled) return row.monitoringEnabled && row.transferListed ? 'TRANSFER' : null;
  return row.monitoringEnabled ? 'MONITOR' : 'OFF';
}

function matchesMode(row: AccountRecord, mode: AccountMode) {
  return row.monitoringEnabled === (mode !== 'OFF') &&
    row.transferListed === (mode === 'TRANSFER') && row.transferEnabled === (mode === 'TRANSFER');
}

function modeHint(row: AccountRecord) {
  const mode = environmentMode(row);
  if (mode === null) return $t('page.collector.modeInvalidHint');
  if (row.transferListed && !row.transferEnabled) return $t('page.collector.modePausedHint');
  return $t(mode === 'TRANSFER' ? 'page.collector.modeTransferHint'
    : mode === 'MONITOR' ? 'page.collector.modeMonitorHint' : 'page.collector.modeOffHint');
}

async function setMode(row: AccountRecord, mode: AccountMode) {
  if (!canEditMode.value || modeBusy.value || matchesMode(row, mode)) return;
  pendingModes.value.set(row.id, mode);
  try {
    const result = await updateAccountMode(row.id, mode);
    if (!result.error) {
      Object.assign(row, result.data);
      await Promise.all([refreshData(), statisticsRef.value?.refresh(true)]);
    }
  } finally {
    pendingModes.value.delete(row.id);
  }
}

async function batchSetMode(mode: AccountMode) {
  if (!canEditMode.value || modeBusy.value) return;
  const rows = selectedRows.value.filter(row => !matchesMode(row, mode));
  if (!rows.length) return;
  const unchanged = selectedRows.value.length - rows.length;
  const failedIds: string[] = [];
  let updated = 0;
  batchAction.value = mode;
  try {
    // 每个环境由后端原子保存完整模式，单项失败不影响剩余项。
    for (const row of rows) {
      try {
        const result = await updateAccountMode(row.id, mode);
        if (result.error) {
          failedIds.push(row.id);
        } else {
          Object.assign(row, result.data);
          updated += 1;
        }
      } catch {
        failedIds.push(row.id);
      }
    }
    if (failedIds.length) {
      selectedIds.value = failedIds;
      window.$message?.warning($t('page.collector.batchModePartial', {
        count: updated,
        unchanged,
        failed: failedIds.length
      }));
    } else {
      window.$message?.success($t('page.collector.batchUpdated', { count: updated }));
    }
    await Promise.all([refreshData(), statisticsRef.value?.refresh(true)]);
  } finally {
    batchAction.value = null;
  }
}
async function batchRefreshAppIds() {
  if (!props.collectorId) return;
  if (!hasAuth('account:update') || batchLoading.value || syncing.value || pendingModes.value.size || !selectedIds.value.length) return;
  batchAction.value = 'app-ids';
  try {
    const result = await batchRefreshAccountAppIds(props.collectorId, selectedIds.value);
    if (!result.error) {
      window.$message?.success($t('page.collector.appIdsRefreshQueued', { count: result.data.queued }));
      selectedIds.value = [];
      await Promise.all([getData(), statisticsRef.value?.refresh(true)]);
    }
  } finally {
    batchAction.value = null;
  }
}

const { tableRef, selectedRows, handleSelectionChange: onSelectionChange } = useTableSelection(data, 'id', selectedIds);

function selectedMode(): AccountMode | null {
  const rows = selectedRows.value;
  if (!rows.length) return null;
  const mode = environmentMode(rows[0]);
  return rows.every(row => environmentMode(row) === mode) ? mode : null;
}

const batchMode = computed(selectedMode);
const batchModeHint = computed(() => selectedRows.value.some(row => environmentMode(row) === null)
  ? $t('page.collector.modeInvalidHint')
  : batchMode.value === null ? $t('page.collector.batchModeMixed') : modeHint(selectedRows.value[0]));
const canBatchOperate = computed(() => canEditMode.value || Boolean(props.collectorId && hasAuth('account:update')));
// 胶囊挂在滚动区之外，保持相对工作区居中，并避开路由过渡的位移。
onMounted(() => {
  capsuleTarget.value = document.querySelector<HTMLElement>('.epay-workspace-shell') ?? 'body';
});
onActivated(() => {
  pageActive.value = true;
  if (!props.collectorId) refreshData();
});
onDeactivated(() => {
  pageActive.value = false;
});
const detailsVisible = computed(() =>
  accountVisible.value || linkedSitesVisible.value || logsVisible.value || editingVisible.value ||
  collectorEditingVisible.value
);
const showBatchActions = computed(() =>
  pageActive.value && canBatchOperate.value && selectedIds.value.length > 0 &&
  !detailsVisible.value && !appStore.themeDrawerVisible && !(appStore.isMobile && !appStore.siderCollapse)
);
const canAutoRefresh = computed(() =>
  !detailsVisible.value && !modeBusy.value
);
useAutoRefresh(refreshData, undefined, canAutoRefresh);
</script>

<template>
  <div class="environment-list flex-col-stretch gap-16px">
    <CollectorStatistics
      ref="statisticsRef"
      :collector-id="props.collectorId"
      :collector="collector"
      :environment-view="!props.collectorId"
      :refresh-enabled="canAutoRefresh"
    />
    <ElCard class="epay-table-card card-wrapper">
      <div class="epay-table-toolbar">
        <EpayKeywordSearch v-model="search.keyword" :placeholder="$t('page.collector.environmentKeyword')" :disabled="modeBusy" @search="getDataByPage()" />
        <div class="epay-table-actions">
          <TableHeaderOperation
            hide-add
            hide-delete
            :loading="loading"
          >
            <ElButton v-if="collector && hasAuth('collector:update')" @click="collectorEditingVisible = true">
              {{ $t('common.edit') }}
            </ElButton>
            <ElButton v-if="props.collectorId && hasAuth('collector:update')" :loading="syncing" :disabled="modeBusy" @click="sync">
              {{ $t('page.collector.sync') }}
            </ElButton>
          </TableHeaderOperation>
        </div>
      </div>

      <ElTable ref="tableRef" v-loading="loading" :data="data" row-key="id" @selection-change="onSelectionChange">
        <ElTableColumn
          v-if="canBatchOperate"
          type="selection" reserve-selection
          :selectable="() => !modeBusy"
          width="50"
          :fixed="appStore.isMobile ? false : 'left'"
        />
        <TableDataColumns :columns="columns" v-model:checks="columnChecks" :unpin="appStore.isMobile" />
      </ElTable>
      <div class="mt-20px flex justify-end">
        <ElPagination
          v-if="mobilePagination.total"
          v-bind="mobilePagination"
          :disabled="modeBusy"
          layout="total,prev,pager,next,sizes"
          @current-change="mobilePagination['current-change']"
          @size-change="mobilePagination['size-change']"
        />
      </div>
    </ElCard>
    <Teleport :to="capsuleTarget">
      <Transition name="environment-batch">
        <div
          v-if="showBatchActions"
          class="environment-batch-capsule"
          role="toolbar"
          :aria-label="$t('common.action')"
          :aria-busy="batchLoading"
        >
          <span
            class="environment-batch-capsule__count"
            role="status"
            :aria-label="$t('page.collector.selectedCount', { count: selectedIds.length })"
          >{{ selectedIds.length }}</span>
          <span class="environment-batch-capsule__divider" aria-hidden="true" />
          <div class="environment-batch-capsule__actions">
            <div v-if="canEditMode" class="environment-batch-capsule__control">
              <span class="environment-batch-capsule__label">{{ $t('page.collector.mode') }}</span>
              <EnvironmentModeSwitch
                :value="batchMode"
                :label="$t('page.collector.mode')"
                :hint="batchModeHint"
                :pending="batchAction === 'app-ids' ? null : batchAction"
                :disabled="modeBusy"
                @change="batchSetMode"
              />
            </div>
            <ElButton
              v-if="props.collectorId && hasAuth('account:update')"
              text
              :loading="batchAction === 'app-ids'"
              :disabled="modeBusy"
              @click="batchRefreshAppIds"
            >
              {{ $t('page.collector.batchRefreshAppIds') }}
            </ElButton>
          </div>
          <span class="environment-batch-capsule__divider" aria-hidden="true" />
          <ElTooltip :content="$t('page.collector.clearSelection')">
            <ElButton
              text
              circle
              type="info"
              :aria-label="$t('page.collector.clearSelection')"
              :disabled="modeBusy"
              @click="selectedIds = []"
            >
              <SvgIcon icon="tabler:x" class="text-18px" aria-hidden="true" />
            </ElButton>
          </ElTooltip>
        </div>
      </Transition>
    </Teleport>
    <CollectorOperateDrawer v-if="props.collectorId"
      v-model:visible="collectorEditingVisible"
      operate-type="edit"
      :row-data="collector"
      @submitted="refresh"
    />
    <AccountCredentialsDrawer v-if="editingAccount?.collectorId"
      v-model:visible="editingVisible"
      :collector-id="editingAccount.collectorId"
      :account="editingAccount"
      @submitted="refresh"
    />
    <AccountMonitoringLogs v-if="logAccount?.collectorId" v-model:visible="logsVisible" :collector-id="logAccount.collectorId" :account="logAccount" />
    <ElDialog v-model="linkedSitesVisible" :title="$t('page.collector.associatedSites')" width="min(100vw, 720px)">
      <p class="text-muted mb-16px break-all">{{ linkedAccount?.profileNo || linkedAccount?.externalId }} · {{ linkedAccount?.name }}</p>
      <div class="max-h-60vh overflow-auto">
        <ElTable :data="linkedChannels" row-key="key" border>
          <ElTableColumn prop="siteName" label="站点" min-width="140" />
          <ElTableColumn prop="code" :label="$t('page.collector.channelCode')" width="100" />
          <ElTableColumn prop="name" :label="$t('page.collector.channelName')" min-width="160" />
          <ElTableColumn prop="appId" :label="$t('page.collector.appId')" min-width="190" />
        </ElTable>
      </div>
    </ElDialog>
    <ElDialog v-model="accountVisible" :title="$t('page.collector.accountDetails')" width="min(100vw, 640px)">
      <ElDescriptions v-if="selectedAccount" :column="1" border>
        <ElDescriptionsItem :label="$t('page.collector.profileNo')">
          {{ selectedAccount.profileNo || selectedAccount.externalId }}
        </ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.collector.group')">
          {{ selectedAccount.groupName || '—' }}
        </ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.collector.profileName')">
          {{ selectedAccount.name || '—' }}
        </ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.collector.mode')">
          <EnvironmentModeSwitch
            :value="environmentMode(selectedAccount)"
            :label="$t('page.collector.mode')"
            :hint="modeHint(selectedAccount)"
            disabled
          />
          <span v-if="environmentMode(selectedAccount) === null" class="environment-mode-cell__warning">
            {{ $t('page.collector.modeInvalid') }}
          </span>
        </ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.collector.loginState')">
          <ElTag :type="loginStateType(selectedAccount.status)">{{ loginStateLabel(selectedAccount.status) }}</ElTag>
        </ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.collector.accountStatus')">
          <div class="flex flex-wrap gap-4px">
            <ElTag v-for="tag in businessTags(selectedAccount)" :key="tag.label" :type="tag.type">{{ tag.label }}</ElTag>
          </div>
        </ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.collector.receiptLimit')">
          {{ quotaText(selectedAccount.receiptLimit, selectedAccount.receiptUnlimited) }}
        </ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.collector.paymentLimit')">
          {{ quotaText(selectedAccount.paymentLimit, selectedAccount.paymentUnlimited) }}
        </ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.collector.restrictionImage')">
          <AccountEvidenceImage
            :collector-id="selectedAccount.collectorId ?? ''"
            :account-id="selectedAccount.id"
            kind="restriction"
            :captured-at="selectedAccount.collectorId ? selectedAccount.restrictionImageAt : null"
            :width="160"
            :height="96"
          />
        </ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.collector.judicialImage')">
          <AccountEvidenceImage
            :collector-id="selectedAccount.collectorId ?? ''"
            :account-id="selectedAccount.id"
            kind="judicial"
            :captured-at="selectedAccount.collectorId ? selectedAccount.judicialImageAt : null"
            :width="160"
            :height="96"
          />
        </ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.collector.money')">
          <MoneyDetails :balances="accountMoney(selectedAccount)" />
        </ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.collector.lastSeen')">
          {{ formatTime(selectedAccount.lastSeenAt) }}
        </ElDescriptionsItem>
        <ElDescriptionsItem :label="$t('page.collector.errorDetail')">
          {{ selectedAccount.lastError || '—' }}
        </ElDescriptionsItem>
      </ElDescriptions>
    </ElDialog>
  </div>
</template>


<style>
/* 固定留出底部操作空间，勾选时不推动表格，滚动到底也能完整看到分页。 */
.environment-list {
  padding-bottom: calc(128px + env(safe-area-inset-bottom, 0px));
}

.environment-batch-capsule {
  position: fixed;
  z-index: 30;
  bottom: calc(56px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  display: flex;
  width: max-content;
  max-width: calc(100% - 32px);
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--epay-blue) 22%, var(--epay-glass-edge));
  border-radius: 28px;
  color: var(--epay-text);
  background: var(--epay-glass);
  box-shadow:
    inset 0 1px var(--epay-glass-edge),
    0 0 0 4px color-mix(in srgb, var(--epay-blue) 6%, transparent),
    0 10px 28px color-mix(in srgb, var(--epay-blue) 18%, transparent),
    var(--epay-float-shadow);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  transform: translateX(-50%);
}

.epay-workspace-shell > .environment-batch-capsule {
  position: absolute;
}

.environment-batch-capsule__count {
  display: inline-flex;
  min-width: 32px;
  height: 32px;
  flex: none;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding-inline: 8px;
  border-radius: 16px;
  color: var(--epay-action-ink);
  background: var(--epay-soft);
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.environment-batch-capsule__divider {
  width: 1px;
  height: 20px;
  flex: none;
  background: var(--epay-edge);
  opacity: .7;
}

.environment-batch-capsule__actions {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 12px;
}

.environment-batch-capsule__control {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.environment-batch-capsule__label {
  color: var(--epay-text);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.environment-batch-capsule[role='toolbar'] .el-button {
  height: 36px;
  min-height: 36px;
  flex: none;
  margin: 0;
  padding-inline: 12px;
}

.environment-batch-capsule[role='toolbar'] .el-button.is-circle {
  width: 36px;
  padding: 0;
}

.environment-batch-enter-active,
.environment-batch-leave-active {
  transition: opacity 180ms ease, transform 180ms var(--epay-ease);
}

.environment-batch-enter-from,
.environment-batch-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px) scale(.98);
}

@media (max-width: 639px) {
  .environment-list {
    padding-bottom: calc(160px + env(safe-area-inset-bottom, 0px));
  }

  .environment-batch-capsule {
    max-width: calc(100% - 24px);
    gap: 6px;
  }

  .environment-batch-capsule[role='toolbar'] .el-button {
    padding-inline: 8px;
  }

  .environment-batch-capsule[role='toolbar'] .el-button.is-circle {
    padding: 0;
  }
}

@media (pointer: coarse) {
  .environment-batch-capsule[role='toolbar'] .el-button {
    min-width: 44px;
    min-height: 44px;
  }
}

/* 页面明确选择完整动效时优先于系统偏好。 */
@media (prefers-reduced-motion: reduce) {
  html:not([data-motion='full']) .environment-batch-enter-active,
  html:not([data-motion='full']) .environment-batch-leave-active {
    transition: none;
  }
}

.environment-mode-cell {
  display: grid;
  justify-items: start;
  gap: 4px;
}

.environment-mode-cell__warning {
  color: var(--epay-warning);
  font-size: 12px;
}

.account-environment {
  display: grid;
  min-width: 0;
  gap: 3px;
  overflow-wrap: anywhere;
}

.account-environment__group {
  color: var(--epay-heading);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.account-environment__name {
  color: var(--epay-muted);
  font-size: 12px;
  line-height: 18px;
}

.account-status {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  gap: 4px 10px;
  font-size: 12px;
  line-height: 18px;
}

.account-status__label {
  color: var(--epay-muted);
  white-space: nowrap;
}

.account-status__values {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}

.account-status__value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--epay-muted);
  font-weight: 500;
  white-space: nowrap;
}

.account-status__link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.account-status__value::before {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: currentColor;
  content: '';
}

.account-status__value[data-tone='active'] { color: var(--epay-monitoring); }
.account-status__value[data-tone='success'] { color: var(--epay-action-ink); }
.account-status__value[data-tone='warning'] { color: var(--epay-warning); }
.account-status__value[data-tone='danger'] { color: var(--epay-danger); }
</style>
