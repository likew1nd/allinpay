<script setup lang="ts">
import { enableStatusOptions } from '@/constants/business';
import { translateOptions } from '@/utils/common';
import { $t } from '@/locales';
import EpaySearchFields from '@/components/custom/epay-search-fields.vue';

defineOptions({ name: 'UserSearch' });

interface Emits {
  (e: 'reset'): void;
  (e: 'search'): void;
}

const emit = defineEmits<Emits>();

const model = defineModel<Api.SystemManage.UserSearchParams>('model', {
  required: true
});

</script>

<template>
  <EpaySearchFields
    :fields="[
      { key: 'userName', width: 170, value: model.userName },
      { key: 'nickName', width: 170, value: model.nickName },
      { key: 'status', width: 135, value: model.status }
    ]"
    @search="emit('search')"
    @reset="emit('reset')"
  >
    <template #userName>
      <ElInput v-model="model.userName" clearable :placeholder="$t('page.manage.user.form.userName')" :aria-label="$t('page.manage.user.userName')" />
    </template>
    <template #nickName>
      <ElInput v-model="model.nickName" clearable :placeholder="$t('page.manage.user.form.nickName')" :aria-label="$t('page.manage.user.nickName')" />
    </template>
    <template #status>
      <ElSelect v-model="model.status" clearable :aria-label="$t('page.manage.user.userStatus')" :placeholder="$t('page.manage.user.userStatus')">
        <ElOption v-for="{ label, value } in translateOptions(enableStatusOptions)" :key="value" :label="label" :value="value" />
      </ElSelect>
    </template>
  </EpaySearchFields>
</template>
