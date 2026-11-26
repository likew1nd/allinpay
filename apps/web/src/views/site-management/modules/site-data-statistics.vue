<script setup lang="ts">
defineProps<{
  cards: {
    label: string;
    icon: string;
    value?: number | string;
    detail?: string;
    bars?: { label: string; value: string; ratio: number | null }[];
    tone?: 'green' | 'amber';
    hint?: string;
    supportingHint?: string;
    title?: string;
  }[];
  page?: 'data' | 'channels' | 'orders';
  description?: string;
}>();

const pageIcons = { data: 'tabler:chart-bar', channels: 'tabler:arrows-split', orders: 'tabler:list-details' };
</script>

<template>
  <component :is="page ? 'section' : 'div'" :class="page ? 'epay-page-heading epay-statistics-heading' : undefined">
    <div v-if="page" class="epay-page-heading-main">
      <span class="epay-page-heading-icon" aria-hidden="true"><SvgIcon :icon="pageIcons[page]" /></span>
      <div class="epay-page-heading-copy">
        <h1>{{ $t(`route.site-management_${page}`) }}</h1>
        <p v-if="description">{{ description }}</p>
      </div>
    </div>
    <dl class="epay-statistics__cards" :class="{ 'epay-statistics__cards--three': cards.length === 3 }" :aria-label="$t('page.site.statistics')">
      <div v-for="card in cards" :key="card.label" class="epay-statistics__card" :class="{ 'epay-statistics__card--chart': card.bars }" :data-tone="card.tone" :title="card.title">
        <dt class="epay-statistics__label">
          <span>{{ card.label }}</span>
          <span class="epay-statistics__icon" aria-hidden="true"><SvgIcon :icon="card.icon" /></span>
        </dt>
        <dd v-if="card.bars" class="epay-statistics__chart">
          <dl>
            <div v-for="bar in card.bars" :key="bar.label">
              <dt>{{ bar.label }}</dt>
              <dd>
                <span>{{ bar.value }}</span>
                <span class="epay-statistics__bar-track" :class="{ 'is-empty': bar.ratio === null }" aria-hidden="true">
                  <span v-if="bar.ratio !== null" :style="{ height: `${bar.ratio * 100}%` }"></span>
                </span>
              </dd>
            </div>
          </dl>
        </dd>
        <dd v-else class="epay-statistics__value">
          <strong>{{ card.value?.toLocaleString() ?? '—' }}</strong>
          <span v-if="card.detail">{{ card.detail }}</span>
        </dd>
        <dd v-if="card.hint" class="epay-statistics__hint">{{ card.hint }}</dd>
        <dd v-if="card.supportingHint" class="epay-statistics__hint">{{ card.supportingHint }}</dd>
      </div>
    </dl>
  </component>
</template>
