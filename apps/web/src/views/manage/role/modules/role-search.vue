<script setup lang="ts">
import { enableStatusOptions } from '@/constants/business';
import { translateOptions } from '@/utils/common';
import { $t } from '@/locales';
import EpaySearchFields from '@/components/custom/epay-search-fields.vue';

defineOptions({ name: 'RoleSearch' });

interface Emits {
  (e: 'reset'): void;
  (e: 'search'): void;
}

const emit = defineEmits<Emits>();

const model = defineModel<Api.SystemManage.RoleSearchParams>('model', {
  required: true
});

</script>

<template>
  <EpaySearchFields
    :fields="[
      { key: 'roleName', width: 170, value: model.roleName },
      { key: 'roleCode', width: 170, value: model.roleCode },
      { key: 'status', width: 135, value: model.status }
    ]"
    @search="emit('search')"
    @reset="emit('reset')"
  >
    <template #roleName>
      <ElInput v-model="model.roleName" clearable :placeholder="$t('page.manage.role.form.roleName')" :aria-label="$t('page.manage.role.roleName')" />
    </template>
    <template #roleCode>
      <ElInput v-model="model.roleCode" clearable :placeholder="$t('page.manage.role.form.roleCode')" :aria-label="$t('page.manage.role.roleCode')" />
    </template>
    <template #status>
      <ElSelect v-model="model.status" clearable :aria-label="$t('page.manage.role.roleStatus')" :placeholder="$t('page.manage.role.roleStatus')">
        <ElOption v-for="{ label, value } in translateOptions(enableStatusOptions)" :key="value" :label="label" :value="value" />
      </ElSelect>
    </template>
  </EpaySearchFields>
</template>
