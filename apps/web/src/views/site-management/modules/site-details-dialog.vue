<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { fetchSite } from '@/service/api';
import type { SiteRecord } from '@/service/api';
import { $t } from '@/locales';
import { connectionLabel, connectionType, formatTime, structureLabel } from '../modules/shared';

const props = defineProps<{ siteId: string }>();
const visible = defineModel<boolean>('visible', { required: true });
const siteId = computed(() => (visible.value ? props.siteId : ''));
const site = ref<SiteRecord | null>(null);
const loading = ref(false);
let fetching = false;
const failed = ref(false);
let detailRequest = 0;
const report = computed(() => site.value?.structureReport);
const validation = computed(() => report.value?.validation);
const validationMessage = computed(() => {
  const keys = {
    MATCHED: 'structureMatched',
    MISSING_TABLES_OR_COLUMNS: 'structureMissing',
    AMBIGUOUS_PREFIX: 'structureAmbiguous',
    NO_MATCH: 'structureNotFound'
  } as const;
  return validation.value ? $t(`page.site.${keys[validation.value.reason]}`) : '';
});
async function loadSite(silent = false) {
  if (silent && fetching) return;
  detailRequest += 1;
  const requestId = detailRequest;
  if (!siteId.value) {
    site.value = null;
    failed.value = false;
    loading.value = false;
    fetching = false;
    return;
  }
  fetching = true;
  if (!silent) loading.value = true;
  try {
    const result = await fetchSite(siteId.value);
    if (requestId !== detailRequest) return;
    if (silent && result.error) return;
    failed.value = Boolean(result.error);
    site.value = result.error ? null : result.data;
  } finally {
    if (requestId === detailRequest) {
      loading.value = false;
      fetching = false;
    }
  }
}

watch(
  siteId,
  () => {
    site.value = null;
    loadSite();
  },
  { immediate: true }
);
useAutoRefresh(() => loadSite(true), undefined, () => Boolean(siteId.value));
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="$t('page.site.siteDetails')"
    width="960px"
    class="max-w-[calc(100%-32px)]"
    destroy-on-close
  >
    <div>
      <div class="flex-col-stretch gap-16px">
        <ElCard v-loading="loading" class="min-h-220px shrink-0 card-wrapper">
          <template v-if="failed">
            <ElAlert :title="$t('page.site.loadFailed')" type="error" :closable="false" />
            <ElButton class="mt-16px" @click="loadSite()">{{ $t('page.site.retry') }}</ElButton>
          </template>
          <ElEmpty v-else-if="!site" :description="$t('page.site.selectHint')" />
          <template v-else>
            <div class="mb-16px flex flex-wrap items-center justify-between gap-12px">
              <h3>{{ site.name }} · {{ $t('page.site.connectionDetails') }}</h3>
            </div>
            <ElAlert
              :title="
                $t(
                  site.connectionStatus === 'PENDING'
                    ? site.structureStatus === 'COMPATIBLE'
                      ? 'page.site.syncingHint'
                      : 'page.site.connectingHint'
                    : site.connectionStatus === 'ONLINE'
                      ? 'page.site.connectedHint'
                      : 'page.site.probeHint'
                )
              "
              :type="site.connectionStatus === 'ONLINE' ? 'success' : 'info'"
              :closable="false"
              class="mb-16px"
            />
            <ElAlert v-if="site.lastError" :title="site.lastError" type="error" :closable="false" class="mb-16px" />
            <ElDescriptions :column="2" border class="break-all">
              <ElDescriptionsItem :label="$t('page.site.baseUrl')">{{ site.baseUrl }}</ElDescriptionsItem>
              <ElDescriptionsItem :label="$t('page.site.connectionStatus')">
                <ElTag :type="connectionType(site.connectionStatus)">
                  {{ connectionLabel(site.connectionStatus) }}
                </ElTag>
              </ElDescriptionsItem>
              <ElDescriptionsItem :label="$t('page.site.structureStatus')">
                {{ structureLabel(site.structureStatus) }}
              </ElDescriptionsItem>
              <ElDescriptionsItem :label="$t('page.site.lastHeartbeat')">
                {{ formatTime(site.lastHeartbeatAt) }}
              </ElDescriptionsItem>
              <ElDescriptionsItem :label="$t('page.site.lastSync')">
                {{ formatTime(site.lastSyncAt) }}
              </ElDescriptionsItem>
              <ElDescriptionsItem :label="$t('page.site.dbHost')">
                {{ site.dbHost }}:{{ site.dbPort }}
              </ElDescriptionsItem>
              <ElDescriptionsItem :label="$t('page.site.dbName')">{{ site.dbName }}</ElDescriptionsItem>
              <ElDescriptionsItem :label="$t('page.site.dbUser')">{{ site.dbUser }}</ElDescriptionsItem>
              <ElDescriptionsItem :label="$t('page.site.dbPassword')">
                {{ $t(site.hasDbPassword ? 'page.site.passwordSaved' : 'page.site.passwordMissing') }}
              </ElDescriptionsItem>
              <ElDescriptionsItem :label="$t('page.site.tablePrefix')">
                {{ site.tablePrefix || '—' }}
              </ElDescriptionsItem>
              <ElDescriptionsItem :label="$t('page.site.timezone')">{{ site.timezone }}</ElDescriptionsItem>
              <ElDescriptionsItem :label="$t('page.site.siteVersion')">
                {{ report?.siteVersion || '—' }}
              </ElDescriptionsItem>
            </ElDescriptions>
            <p class="text-muted mt-12px text-12px">{{ $t('page.site.configHint') }}</p>
          </template>
        </ElCard>
        <ElCard v-if="site" class="shrink-0 card-wrapper">
          <template #header>{{ $t('page.site.structureReport') }}</template>
          <ElEmpty v-if="!report" :description="$t('page.site.noReport')" />
          <template v-else>
            <template v-if="validation">
              <ElAlert
                :title="validationMessage"
                :type="validation.reason === 'MATCHED' ? 'success' : 'warning'"
                :closable="false"
                class="mb-16px"
              />
              <ElDescriptions :column="2" border class="mb-16px break-all">
                <ElDescriptionsItem :label="$t('page.site.mappingVersion')">
                  {{ validation.mappingVersion }}
                </ElDescriptionsItem>
                <ElDescriptionsItem :label="$t('page.site.detectedPrefix')">
                  {{ validation.tablePrefix === undefined ? '—' : validation.tablePrefix || $t('page.site.noPrefix') }}
                </ElDescriptionsItem>
              </ElDescriptions>
              <p v-if="validation.reason === 'AMBIGUOUS_PREFIX'" class="mb-12px break-all">
                {{ $t('page.site.candidatePrefixes') }}:
                {{ validation.candidatePrefixes.map(prefix => prefix || $t('page.site.noPrefix')).join(', ') }}
              </p>
              <h3 v-if="validation.checks.length" class="mb-12px">{{ $t('page.site.compatibilityChecks') }}</h3>
              <ElTable v-if="validation.checks.length" :data="validation.checks" row-key="table" border class="mb-16px">
                <ElTableColumn prop="table" :label="$t('page.site.tableName')" min-width="160" />
                <ElTableColumn :label="$t('page.site.checkResult')" min-width="120">
                  <template #default="{ row }">
                    <ElTag :type="row.exists && !row.missingColumns.length ? 'success' : 'danger'">
                      {{
                        $t(
                          !row.exists
                            ? 'page.site.missingTable'
                            : row.missingColumns.length
                              ? 'page.site.checkFailed'
                              : 'page.site.checkPassed'
                        )
                      }}
                    </ElTag>
                  </template>
                </ElTableColumn>
                <ElTableColumn :label="$t('page.site.requiredColumns')" min-width="240">
                  <template #default="{ row }">{{ row.requiredColumns.join(', ') }}</template>
                </ElTableColumn>
                <ElTableColumn :label="$t('page.site.missingColumns')" min-width="180">
                  <template #default="{ row }">{{ row.missingColumns.join(', ') || '—' }}</template>
                </ElTableColumn>
              </ElTable>
            </template>
            <p class="mb-12px">
              {{ $t('page.site.database') }}: {{ report.database }} · {{ $t('page.site.checkedAt') }}:
              {{ formatTime(report.checkedAt) }}
            </p>
            <p class="mb-12px break-all">{{ $t('page.site.candidates') }}: {{ report.candidates.join(', ') || '—' }}</p>
            <ElCollapse class="mt-12px">
              <ElCollapseItem :title="$t('page.site.tableStructure')" name="tables">
                <ElTable :data="report.tables" row-key="name" border max-height="500">
                  <ElTableColumn prop="name" :label="$t('page.site.tableName')" min-width="180" />
                  <ElTableColumn :label="$t('page.site.columns')" min-width="320">
                    <template #default="{ row }">{{ row.columns?.join(', ') || '—' }}</template>
                  </ElTableColumn>
                </ElTable>
              </ElCollapseItem>
            </ElCollapse>
          </template>
        </ElCard>
      </div>
    </div>
    <template #footer>
      <ElButton @click="visible = false">{{ $t('common.close') }}</ElButton>
    </template>
  </ElDialog>
</template>
