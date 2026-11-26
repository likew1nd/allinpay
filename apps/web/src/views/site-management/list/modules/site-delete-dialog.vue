<script setup lang="ts">
import { ref, watch } from 'vue';
import { deleteSite } from '@/service/api';
import type { SiteRecord } from '@/service/api';
import { useAuthStore } from '@/store/modules/auth';
import { useForm, useFormRules } from '@/hooks/common/form';
import { $t } from '@/locales';

const props = defineProps<{ site: Pick<SiteRecord, 'id' | 'name' | 'baseUrl'> | null }>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ deleted: [id: string] }>();
const authStore = useAuthStore();
const { formRef, validate, restoreValidation } = useForm();
const { defaultRequiredRule } = useFormRules();
const model = ref({ password: '' });
const deleting = ref(false);
watch(visible, () => {
  model.value.password = '';
  restoreValidation();
});

async function submit() {
  if (!props.site || deleting.value) return;
  await validate();
  const id = props.site.id;
  deleting.value = true;
  try {
    const result = await deleteSite(id, model.value.password);
    if (result.error) return;
    visible.value = false;
    window.$message?.success($t('common.deleteSuccess'));
    emit('deleted', id);
  } finally {
    model.value.password = '';
    deleting.value = false;
  }
}
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="$t('page.site.deleteTitle')"
    width="560px"
    class="max-w-[calc(100%-32px)]"
    :close-on-click-modal="false"
    :close-on-press-escape="!deleting"
    :show-close="!deleting"
    destroy-on-close
  >
    <template v-if="site">
      <p class="mb-8px break-all font-bold">{{ site.name }}</p>
      <p class="mb-16px break-all">{{ site.baseUrl }}</p>
      <ElAlert :title="$t('page.site.deleteWarning')" type="error" :closable="false" show-icon class="mb-16px">
        <p>{{ $t('page.site.deleteConsequences') }}</p>
        <p class="mt-8px">{{ $t('page.site.deleteSourceUnaffected') }}</p>
      </ElAlert>
      <p class="mb-12px">{{ $t('page.site.deletePasswordHint', { userName: authStore.userInfo.userName }) }}</p>
      <ElForm ref="formRef" :model="model" label-position="top" :disabled="deleting" @submit.prevent="submit">
        <ElFormItem :label="$t('page.site.currentPassword')" prop="password" :rules="[defaultRequiredRule]">
          <ElInput
            v-model="model.password"
            type="password"
            autocomplete="current-password"
            :maxlength="1024"
            :placeholder="$t('page.site.currentPasswordPlaceholder')"
          />
        </ElFormItem>
        <ElButton native-type="submit" class="hidden" tabindex="-1" />
      </ElForm>
    </template>
    <template #footer>
      <ElButton :disabled="deleting" @click="visible = false">{{ $t('common.cancel') }}</ElButton>
      <ElButton type="danger" :loading="deleting" :disabled="!model.password || !site" @click="submit">
        {{ $t('page.site.confirmDelete') }}
      </ElButton>
    </template>
  </ElDialog>
</template>
