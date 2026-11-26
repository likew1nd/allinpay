<script setup lang="ts">
import { computed } from 'vue';
import { $t } from '@/locales';
import type { OrderCollectionStatistics, OrderListStatistics } from '@/service/api';
import SiteDataStatistics from './site-data-statistics.vue';
import { formatOrderRate, orderRateWindows } from './shared';

const props = defineProps<{
  statistics?: OrderCollectionStatistics;
  statusCounts?: OrderListStatistics;
  hasRows?: boolean;
  page?: 'channels' | 'orders';
  target?: HTMLElement | null;
  scopeNote?: string;
}>();

function collectionValues(summary?: OrderCollectionStatistics['today']) {
  if (!summary) return {};
  return {
    value: summary.amount.replace(/\B(?=(\d{3})+\.)/g, ','),
    detail: `/ ${summary.total.toLocaleString()}`,
    hint: $t('page.site.channelOrderBreakdown', { success: summary.success.toLocaleString(), unpaid: summary.unpaid.toLocaleString() })
  };
}

const cards = computed(() => {
  const { statistics, statusCounts } = props;
  const describe = (detail: string) => props.scopeNote ? `${props.scopeNote} ${detail}` : detail;
  const cumulative = collectionValues(statistics?.cumulative);
  const counts = statusCounts && (['paid', 'refunded', 'frozen', 'preauthorized'] as const)
    .map(key => `${$t(`page.site.paymentStatuses.${key}`)} ${statusCounts[key].toLocaleString()}`);
  if (statusCounts?.unknown) counts?.push(`${$t('page.site.unknownOrderCount')} ${statusCounts.unknown.toLocaleString()}`);
  return [
    {
      label: $t('page.site.channelTodayCollection'), icon: 'tabler:calendar-stats', tone: 'green' as const,
      title: props.scopeNote,
      ...(statistics && !statistics.today && props.hasRows ? { hint: $t('page.site.channelTodayUnavailable') } : collectionValues(statistics?.today))
    },
    {
      label: $t('page.site.channelTotalCollection'), icon: 'tabler:receipt', title: describe($t('page.site.orderTotalScope')),
      ...cumulative, supportingHint: counts?.join(' · ')
    },
    {
      label: $t('page.site.successRate'), icon: 'tabler:percentage',
      bars: orderRateWindows().map((label, index) => {
        const ratio = statistics?.successRates[index] ?? null;
        return { label, value: formatOrderRate(ratio), ratio };
      }),
      title: describe($t('page.site.channelRateFormula'))
    }
  ];
});
</script>

<template>
  <Teleport :to="target" :disabled="!target">
    <SiteDataStatistics :cards="cards" :page="page" :description="page === 'channels' ? $t('page.site.channelDescription') : undefined" />
  </Teleport>
</template>
