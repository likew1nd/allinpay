<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue';
import { useRefreshInterval } from '@/hooks/common/refresh-interval';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { fetchAccountStatistics, fetchCollectorStatistics } from '@/service/api';
import type { CollectorRecord, CollectorStatistics } from '@/service/api';
import { $t } from '@/locales';
import { formatTime } from '@/views/site-management/modules/shared';
import { connectionLabel } from './shared';

const props = withDefaults(defineProps<{
  collectorId?: string; collector?: CollectorRecord | null;
  environmentView?: boolean; refreshEnabled?: boolean;
}>(), { environmentView: false, refreshEnabled: true });
const { seconds: refreshSeconds } = useRefreshInterval();
const environmentMode = computed(() => props.environmentView || Boolean(props.collectorId));
const headingTitle = computed(() => props.environmentView
  ? $t('route.account-management_bindings')
  : props.collectorId ? props.collector?.name || $t('page.collector.environments') : $t('route.account-management_collectors'));
const statistics = ref<CollectorStatistics | null>(null);
const loading = ref(false);
const failed = ref(false);

let fetching = false;
async function load(silent = false) {
  if (fetching) return;
  fetching = true;
  if (!silent) loading.value = true;
  try {
    const result = await (props.environmentView ? fetchAccountStatistics() : fetchCollectorStatistics(props.collectorId));
    failed.value = Boolean(result.error);
    if (!result.error) statistics.value = result.data;
  } catch {
    failed.value = true;
  } finally {
    fetching = false;
    loading.value = false;
  }
}
onMounted(() => load());
onActivated(() => load(true));
useAutoRefresh(() => load(true), undefined, () => props.refreshEnabled);
defineExpose({ refresh: load });

const cards = computed<{
  label: string; icon: string; tone: string; value: number | string | null | undefined;
  suffix: string; hint: string; warning?: string;
}[]>(() => {
  const summary = statistics.value;
  const env = summary?.environments;
  const money = summary?.balances;
  const environment = {
    label: '环境总数', icon: 'tabler:browser', tone: 'blue', value: env?.total,
    suffix: '个', hint: env ? `已关联 ${env.linked} · 未关联 ${env.total - env.linked}` : '统计全部环境'
  };
  const monitoring = {
    label: '监控已开启', icon: 'tabler:activity', tone: 'green', value: env?.monitoring,
    suffix: '个', hint: env ? `运行中 ${env.running} · 已关闭 ${env.total - env.monitoring}` : '采集端与环境均开启监控'
  };
  const collectors = summary?.collectors;
  return [
    environmentMode.value ? environment : {
      label: '采集端连接', icon: 'tabler:device-desktop-code', tone: 'blue', value: collectors?.total,
      suffix: '个', hint: collectors ? `在线 ${collectors.online} · 离线 ${collectors.offline} · 异常 ${collectors.error}` : '统计全部采集端'
    },
    environmentMode.value ? monitoring : environment,
    environmentMode.value ? {
      label: '异常账号', icon: 'tabler:shield-exclamation', tone: env?.abnormal ? 'amber' : 'blue', value: env?.abnormal,
      suffix: '个', hint: env ? `限制 ${env.restricted} · 司法 ${env.judicial} · 未知 ${env.unknown}` : '限制与司法按环境去重'
    } : monitoring,
    {
      label: '可用余额', icon: 'tabler:wallet', tone: 'blue', value: money?.available,
      suffix: '', hint: money ? `不可用 ${money.unavailable ?? '—'} · 待结算 ${money.pending ?? '—'}` : '等待采集数据',
      warning: money?.unreportedEnvironmentCount ? `${money.unreportedEnvironmentCount} 个环境金额未上报` : ''
    }
  ];
});
</script>

<template>
  <section class="epay-page-heading epay-statistics-heading" :aria-label="environmentView ? headingTitle : '采集端数据统计'" :aria-busy="loading">
    <div class="epay-page-heading-main">
      <span class="epay-page-heading-icon" aria-hidden="true"><SvgIcon :icon="environmentView ? 'tabler:link' : 'tabler:device-desktop-code'" /></span>
      <div class="epay-page-heading-copy">
        <div class="collector-statistics__title">
          <h1>{{ headingTitle }}</h1>
          <span v-if="collector" class="collector-statistics__connection" :data-status="collector.status">
            {{ connectionLabel(collector.status) }}
          </span>
        </div>
        <p>{{ environmentView ? $t('page.collector.detailsDescription') : collectorId ? '环境、监控与资金概览' : '集中管理账号、采集任务与可用状态。' }}</p>
        <span v-if="environmentView" class="collector-statistics__scope">
          {{ $t('page.collector.environmentStatisticsScope', { seconds: refreshSeconds }) }}
        </span>
        <span v-else class="collector-statistics__scope">
          {{ collectorId ? `最近同步：${formatTime(collector?.environmentSyncedAt)}` : '全部采集端 · 每 5 秒更新' }}
        </span>
        <button v-if="failed" type="button" class="collector-statistics__retry" @click="load()">统计更新失败，点击重试</button>
      </div>
    </div>
    <dl class="epay-statistics__cards">
      <div v-for="card in cards" :key="card.label" class="epay-statistics__card epay-stat-card" :data-tone="card.tone">
        <dt class="epay-statistics__label">
          <span>{{ card.label }}</span>
          <span class="epay-statistics__icon epay-stat-icon" aria-hidden="true"><SvgIcon :icon="card.icon" /></span>
        </dt>
        <dd class="epay-statistics__value">
          <strong :key="String(card.value ?? '—')" class="epay-stat-value">{{ card.value ?? '—' }}</strong>
          <span v-if="card.suffix">{{ card.suffix }}</span>
        </dd>
        <dd class="epay-statistics__hint">{{ card.hint }}</dd>
        <dd v-if="card.warning" class="epay-statistics__warning">{{ card.warning }}</dd>
      </div>
    </dl>
    <ElAlert
      v-if="collector && collector.status !== 'ONLINE'"
      class="epay-statistics__alert"
      :title="collector.lastError || $t('page.collector.staleHint')"
      type="warning"
      :closable="false"
    />
  </section>
</template>

<style scoped>
.collector-statistics__title { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.collector-statistics__connection { display: inline-flex; align-items: center; gap: 5px; color: var(--epay-action-ink); font-size: 12px; white-space: nowrap; }
.collector-statistics__connection::before { width: 6px; height: 6px; border-radius: 50%; background: currentColor; content: ''; }
.collector-statistics__connection[data-status='OFFLINE'] { color: var(--epay-warning); }
.collector-statistics__connection[data-status='ERROR'] { color: var(--epay-danger); }
.collector-statistics__scope { display: block; margin-top: 8px; color: var(--epay-muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.collector-statistics__retry { margin-top: 6px; padding: 0; border: 0; background: none; color: var(--epay-danger); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.collector-statistics__retry:focus-visible { outline: 2px solid var(--epay-blue); outline-offset: 3px; }
</style>
