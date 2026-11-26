<script setup lang="ts">
import { ref, watch } from 'vue';
import { fetchSiteSummary } from '@/service/api';
import type { SiteSummary } from '@/service/api';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { $t } from '@/locales';
import { percent } from './shared';

const props = defineProps<{ siteId: string }>();
const emit = defineEmits<{ loaded: [summary: SiteSummary | null] }>();
const summary = ref<SiteSummary | null>(null);
const failed = ref(false);
const loading = ref(false);
let sequence = 0;
async function refresh(silent = false) {
  sequence += 1;
  const requestId = sequence;
  if (!props.siteId) return;
  if (!silent) loading.value = true;
  try {
    const result = await fetchSiteSummary(props.siteId);
    if (requestId !== sequence) return;
    failed.value = Boolean(result.error);
    if (!result.error) summary.value = result.data;
    emit('loaded', summary.value);
  } finally {
    if (requestId === sequence) loading.value = false;
  }
}
watch(
  () => props.siteId,
  () => {
    summary.value = null;
    failed.value = false;
    emit('loaded', null);
    refresh();
  },
  { immediate: true }
);
useAutoRefresh(
  () => refresh(true),
  undefined,
  () => !loading.value
);
</script>

<template>
  <section v-loading="loading" class="min-w-0 flex-col-stretch gap-16px" :aria-label="$t('page.site.statistics')">
    <ElAlert v-if="failed" :title="$t('page.site.loadFailed')" type="error" :closable="false" />
    <ElAlert v-if="summary?.latest?.error" :title="summary.latest.error" type="error" :closable="false" />
    <slot name="cards">
      <dl v-if="summary" class="epay-statistics__cards">
        <div class="epay-statistics__card epay-stat-card" data-tone="blue">
          <dt class="epay-statistics__label">
            <span>{{ $t('page.site.orderCount') }}</span>
            <span class="epay-statistics__icon epay-stat-icon" aria-hidden="true">
              <SvgIcon icon="tabler:receipt" />
            </span>
          </dt>
          <dd class="epay-statistics__value">
            <strong :key="summary.lastSyncAt ? String(summary.orderCount) : '—'" class="epay-stat-value">
              {{ summary.lastSyncAt ? summary.orderCount : '—' }}
            </strong>
          </dd>
          <dd class="epay-statistics__hint">
            {{ $t('page.site.success') }}
            {{ summary.lastSyncAt ? summary.successCount : '—' }} ·
            {{ $t('page.site.processing') }}
            {{ summary.lastSyncAt ? summary.processingCount : '—' }}
          </dd>
        </div>
        <div class="epay-statistics__card epay-stat-card" data-tone="green">
          <dt class="epay-statistics__label">
            <span>{{ $t('page.site.successRate') }}</span>
            <span class="epay-statistics__icon epay-stat-icon" aria-hidden="true">
              <SvgIcon icon="tabler:circle-check" />
            </span>
          </dt>
          <dd class="epay-statistics__value">
            <strong :key="percent(summary.successRate)" class="epay-stat-value">
              {{ percent(summary.successRate) }}
            </strong>
          </dd>
          <dd v-if="summary.successRate !== null" class="epay-statistics__hint">
            <ElProgress
              :percentage="Number((summary.successRate * 100).toFixed(2))"
              :show-text="false"
              color="var(--stat-color)"
              class="mt-12px"
            />
          </dd>
          <dd v-else class="epay-statistics__hint">{{ $t('page.site.noRateSamples') }}</dd>
        </div>
        <div class="epay-statistics__card epay-stat-card" data-tone="blue">
          <dt class="epay-statistics__label">
            <span>{{ $t('page.site.successAmount') }}</span>
            <span class="epay-statistics__icon epay-stat-icon" aria-hidden="true">
              <SvgIcon icon="tabler:wallet" />
            </span>
          </dt>
          <dd class="epay-statistics__value">
            <strong :key="summary.lastSyncAt ? summary.successAmount : '—'" class="epay-stat-value">
              {{ summary.lastSyncAt ? summary.successAmount : '—' }}
            </strong>
          </dd>
          <dd class="epay-statistics__hint">{{ $t('page.site.amountHint') }}</dd>
        </div>
        <div class="epay-statistics__card epay-stat-card" :data-tone="summary.failedCount ? 'amber' : 'blue'">
          <dt class="epay-statistics__label">
            <span>{{ $t('page.site.failed') }}</span>
            <span class="epay-statistics__icon epay-stat-icon" aria-hidden="true">
              <SvgIcon icon="tabler:clock-exclamation" />
            </span>
          </dt>
          <dd class="epay-statistics__value">
            <strong :key="summary.lastSyncAt ? String(summary.failedCount) : '—'" class="epay-stat-value">
              {{ summary.lastSyncAt ? summary.failedCount : '—' }}
            </strong>
          </dd>
          <dd class="epay-statistics__hint">
            {{ $t('page.site.excluded') }}
            {{ summary.lastSyncAt ? summary.excludedCount : '—' }} · {{ $t('page.site.failureRate') }}
            {{ percent(summary.failureRate) }}
          </dd>
        </div>
      </dl>
    </slot>
  </section>
</template>
