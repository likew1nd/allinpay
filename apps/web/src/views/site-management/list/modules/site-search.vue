<script setup lang="ts">
import type { SiteSearchParams } from '@/service/api';
import { $t } from '@/locales';
import EpaySearchFields from '@/components/custom/epay-search-fields.vue';
import { connectionLabel, connectionStatuses } from '../../modules/shared';

defineProps<{ hideConnectionStatus?: boolean }>();
const model = defineModel<SiteSearchParams>('model', { required: true });
const emit = defineEmits<{ search: []; reset: [] }>();
</script>

<template>
  <EpaySearchFields
    :fields="[
      { key: 'keyword', width: 220, value: model.keyword },
      ...(!hideConnectionStatus ? [{ key: 'status', width: 145, value: model.status }] : [])
    ]"
    @search="emit('search')"
    @reset="emit('reset')"
  >
    <template #keyword>
      <ElInput v-model="model.keyword" clearable :placeholder="$t('page.site.searchHint')" :aria-label="$t('page.site.searchHint')" />
    </template>
    <template #status>
      <ElSelect v-model="model.status" clearable :placeholder="$t('page.site.connectionStatus')" :aria-label="$t('page.site.connectionStatus')" @clear="model.status = undefined">
        <ElOption v-for="status in connectionStatuses" :key="status" :value="status" :label="connectionLabel(status)" />
      </ElSelect>
    </template>
  </EpaySearchFields>
</template>
