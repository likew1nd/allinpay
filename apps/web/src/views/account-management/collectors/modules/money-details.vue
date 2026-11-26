<script setup lang="ts">
import type { CollectorMoney } from '@/service/api';
import { $t } from '@/locales';

defineProps<{ balances?: CollectorMoney[]; compact?: boolean }>();
const empty: CollectorMoney[] = [{ available: null, unavailable: null, pending: null }];
</script>

<template>
  <div class="flex-col gap-8px">
    <div
      v-for="(item, index) in balances?.length ? balances : empty"
      :key="index"
      class="flex-col gap-4px text-12px leading-6"
    >
      <div
        v-if="compact"
        class="money-details__inline"
        role="group"
        :aria-label="`${$t('page.collector.available')} ${item.available ?? '—'} / ${$t('page.collector.unavailable')} ${item.unavailable ?? '—'} / ${$t('page.collector.pending')} ${item.pending ?? '—'}`"
      >
        <span class="money-details__available" :title="`${$t('page.collector.available')}: ${item.available ?? '—'}`">
          {{ item.available ?? '—' }}
        </span>
        <span class="money-details__separator" aria-hidden="true">/</span>
        <span class="money-details__unavailable" :title="`${$t('page.collector.unavailable')}: ${item.unavailable ?? '—'}`">
          {{ item.unavailable ?? '—' }}
        </span>
        <span class="money-details__separator" aria-hidden="true">/</span>
        <span class="money-details__pending" :title="`${$t('page.collector.pending')}: ${item.pending ?? '—'}`">
          {{ item.pending ?? '—' }}
        </span>
      </div>
      <template v-else>
        <div class="flex items-center gap-8px">
          <ElTag type="primary" size="small">{{ $t('page.collector.available') }} {{ item.available ?? '—' }}</ElTag>
        </div>
        <div class="flex items-center gap-8px">
          <ElTag type="danger" size="small">{{ $t('page.collector.unavailable') }} {{ item.unavailable ?? '—' }}</ElTag>
        </div>
        <div class="flex items-center gap-8px">
          <ElTag type="warning" size="small">{{ $t('page.collector.pending') }} {{ item.pending ?? '—' }}</ElTag>
        </div>
      </template>
      <div v-if="item.unreportedEnvironmentCount" class="text-warning">{{ $t('page.collector.partial', { count: item.unreportedEnvironmentCount }) }}</div>
    </div>
  </div>
</template>

<style scoped>
.money-details__inline {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.money-details__available {
  color: var(--epay-action-ink);
  font-weight: 600;
}

.money-details__unavailable {
  color: var(--epay-danger);
}

.money-details__separator {
  color: var(--epay-muted);
}

.money-details__pending {
  color: var(--epay-warning);
}
</style>