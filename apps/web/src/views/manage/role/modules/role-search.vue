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

function reset() {
  emit('reset');
}

function search() {
  emit('search');
}
</script>

<template>
  <ElForm class="epay-table-search" inline :model="model" @submit.prevent="search">
    <EpaySearchFields :values="[model.roleCode, model.status]">
      <ElFormItem :label="$t('page.manage.role.roleName')" prop="roleName">
        <ElInput v-model="model.roleName" :placeholder="$t('page.manage.role.form.roleName')" />
      </ElFormItem>
      <template #actions>
        <ElButton type="primary" native-type="submit">{{ $t('common.search') }}</ElButton>
        <ElButton @click="reset">{{ $t('common.reset') }}</ElButton>
      </template>
      <template #advanced>
        <ElFormItem :label="$t('page.manage.role.roleCode')" prop="roleCode">
          <ElInput v-model="model.roleCode" :placeholder="$t('page.manage.role.form.roleCode')" />
        </ElFormItem>
        <ElFormItem :label="$t('page.manage.role.roleStatus')" prop="status">
          <ElSelect v-model="model.status" :placeholder="$t('page.manage.role.form.roleStatus')" clearable>
            <ElOption
              v-for="{ label, value } in translateOptions(enableStatusOptions)"
              :key="value"
              :label="label"
              :value="value"
            ></ElOption>
          </ElSelect>
        </ElFormItem>
      </template>
    </EpaySearchFields>
  </ElForm>
</template>
