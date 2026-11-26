<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchSite } from '@/service/api';
import type { SiteRecord, SiteSummary } from '@/service/api';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { $t } from '@/locales';
import SiteStatistics from '../../modules/site-statistics.vue';
import SitePollingGroupTable from '../../modules/site-polling-group-table.vue';
import SiteOrderTable from '../../modules/site-order-table.vue';
import SiteChannelTable from '../../modules/site-channel-table.vue';
import { formatTime } from '../../modules/shared';

const props = defineProps<{ siteId: string }>();
const route = useRoute();
const router = useRouter();
type Tab = 'channels' | 'polling-groups' | 'orders';
const tabs: Tab[] = ['channels', 'polling-groups', 'orders'];
const tab = computed<Tab>({
  get: () => (tabs.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : 'channels'),
  set: value => {
    router.replace({ query: { ...route.query, tab: value, channelCode: value === 'orders' ? route.query.channelCode : undefined } });
  }
});
const orderChannelCode = computed(() => typeof route.query.channelCode === 'string' ? route.query.channelCode : undefined);
const site = ref<SiteRecord | null>(null);
const summary = ref<SiteSummary | null>(null);
const tableStatisticsTarget = ref<HTMLElement | null>(null);
const failed = ref(false);
const loading = ref(false);
let sequence = 0;
async function loadSite(silent = false) {
  sequence += 1;
  const requestId = sequence;
  if (!silent) loading.value = true;
  try {
    const result = await fetchSite(props.siteId);
    if (requestId !== sequence) return;
    failed.value = Boolean(result.error);
    if (!result.error) site.value = result.data;
  } finally {
    if (requestId === sequence) loading.value = false;
  }
}
function count(kind: Tab) {
  if (!summary.value?.lastSyncAt) return '—';
  return {
    channels: summary.value.channelCount,
    'polling-groups': summary.value.pollingGroupCount,
    orders: summary.value.orderCount
  }[kind];
}
function title(kind: Tab) {
  return $t(
    `page.site.${{ channels: 'channelManagement', 'polling-groups': 'pollingGroups', orders: 'orderManagement' }[kind] as 'channelManagement' | 'pollingGroups' | 'orderManagement'}`
  );
}
watch(
  () => props.siteId,
  () => {
    site.value = null;
    loadSite();
  },
  { immediate: true }
);
useAutoRefresh(
  () => loadSite(true),
  undefined,
  () => !loading.value
);
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <section
      v-loading="loading"
      class="epay-page-heading epay-statistics-heading"
      :aria-label="$t('route.site-management_data')"
    >
      <div class="epay-page-heading-main">
        <span class="epay-page-heading-icon" aria-hidden="true">
          <SvgIcon :icon="route.meta.icon || 'tabler:chart-bar'" :local-icon="route.meta.localIcon" />
        </span>
        <div class="epay-page-heading-copy">
          <h1>{{ $t('route.site-management_data') }}</h1>
          <p class="font-medium">{{ site?.name }}</p>
          <span v-if="summary" class="mt-8px block text-12px color-[var(--epay-muted)]">
            {{ $t('page.site.lastSync') }}: {{ formatTime(summary.lastSyncAt) }}
          </span>
        </div>
      </div>
      <SiteStatistics v-if="site" :site-id="siteId" @loaded="summary = $event">
        <template #cards>
          <div ref="tableStatisticsTarget" />
        </template>
      </SiteStatistics>
      <ElAlert
        v-if="failed"
        class="epay-statistics__alert"
        :title="$t('page.site.loadFailed')"
        type="error"
        :closable="false"
      />
    </section>
    <ElCard v-if="site" class="epay-table-card card-wrapper">
      <ElTabs v-model="tab">
        <ElTabPane v-for="kind in tabs" :key="kind" :name="kind" :label="`${title(kind)} (${count(kind)})`" lazy>
          <SiteChannelTable
            v-if="kind === 'channels'"
            :site-id="siteId"
            :active="tab === kind"
            :statistics-target="tableStatisticsTarget"
          />
          <SitePollingGroupTable
            v-else-if="kind === 'polling-groups'"
            :site-id="siteId"
            :active="tab === kind"
            :statistics-target="tableStatisticsTarget"
          />
          <SiteOrderTable
            v-else
            :key="orderChannelCode"
            :site-id="siteId"
            :channel-code="orderChannelCode"
            :active="tab === kind"
            :statistics-target="tableStatisticsTarget"
            embedded
          />
        </ElTabPane>
      </ElTabs>
    </ElCard>
  </div>
</template>
