<script setup lang="ts">
import { enableStatusOptions } from '@/constants/business';
import { useForm } from '@/hooks/common/form';
import { translateOptions } from '@/utils/common';
import { $t } from '@/locales';
import EpaySearchFields from '@/components/custom/epay-search-fields.vue';

defineOptions({ name: 'UserSearch' });

interface Emits {
  (e: 'reset'): void;
  (e: 'search'): void;
}

const emit = defineEmits<Emits>();

const { formRef, validate, restoreValidation } = useForm();

const model = defineModel<Api.SystemManage.UserSearchParams>('model', {
  required: true
});

async function reset() {
  await restoreValidation();
  emit('reset');
}

async function search() {
  await validate();
  emit('search');
}
</script>

<template>
  <ElForm ref="formRef" class="epay-table-search" inline :model="model" @submit.prevent="search">
    <EpaySearchFields :values="[model.nickName, model.status]">
      <ElFormItem :label="$t('page.manage.user.userName')" prop="userName">
        <ElInput v-model="model.userName" :placeholder="$t('page.manage.user.form.userName')" />
      </ElFormItem>
      <template #actions>
        <ElButton type="primary" native-type="submit">{{ $t('common.search') }}</ElButton>
        <ElButton @click="reset">{{ $t('common.reset') }}</ElButton>
      </template>
      <template #advanced>
        <ElFormItem :label="$t('page.manage.user.nickName')" prop="nickName">
          <ElInput v-model="model.nickName" :placeholder="$t('page.manage.user.form.nickName')" />
        </ElFormItem>
        <ElFormItem :label="$t('page.manage.user.userStatus')" prop="status">
          <ElSelect v-model="model.status" clearable :placeholder="$t('page.manage.user.form.userStatus')">
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
