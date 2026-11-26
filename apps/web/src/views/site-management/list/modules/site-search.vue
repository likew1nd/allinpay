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
  <ElForm class="epay-table-search" :model="model" inline @submit.prevent="emit('search')">
    <EpaySearchFields :values="[model.status]" :collapsible="!hideConnectionStatus">
      <ElFormItem :label="$t('common.keywordSearch')">
        <ElInput v-model="model.keyword" clearable :placeholder="$t('page.site.searchHint')" />
      </ElFormItem>
      <template #actions>
        <ElButton type="primary" native-type="submit">{{ $t('common.search') }}</ElButton>
        <ElButton @click="emit('reset')">{{ $t('common.reset') }}</ElButton>
      </template>
      <template #advanced>
        <ElFormItem v-if="!hideConnectionStatus" :label="$t('page.site.connectionStatus')">
          <ElSelect v-model="model.status" clearable class="w-160px" @clear="model.status = undefined">
            <ElOption
              v-for="status in connectionStatuses"
              :key="status"
              :value="status"
              :label="connectionLabel(status)"
            />
          </ElSelect>
        </ElFormItem>
      </template>
    </EpaySearchFields>
  </ElForm>
</template>
