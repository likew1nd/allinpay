<script setup lang="ts">
import { computed, useId } from 'vue';
import { $t } from '@/locales';

const props = withDefaults(defineProps<{ values: unknown[]; collapsible?: boolean }>(), { collapsible: true });
const expanded = defineModel<boolean>('expanded', { default: false });
const regionId = useId();
const selectedCount = computed(
  () =>
    props.values.filter(value => {
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null;
    }).length
);
</script>

<template>
  <slot />
  <div class="epay-search-actions">
    <slot name="actions" />
    <ElButton
      v-if="collapsible"
      class="epay-search-toggle"
      type="primary"
      link
      native-type="button"
      :aria-expanded="expanded"
      :aria-controls="regionId"
      @click="expanded = !expanded"
    >
      {{ $t(expanded ? 'common.collapseFilters' : 'common.moreFilters') }}
      <span v-if="!expanded && selectedCount" class="ml-4px">
        {{ $t('common.selectedFilters', { count: selectedCount }) }}
      </span>
      <icon-ic-round-expand-more class="ml-4px" :class="{ 'rotate-180': expanded }" aria-hidden="true" />
    </ElButton>
  </div>
  <div v-if="collapsible" v-show="expanded" :id="regionId" class="epay-search-advanced">
    <slot name="advanced" />
  </div>
</template>
