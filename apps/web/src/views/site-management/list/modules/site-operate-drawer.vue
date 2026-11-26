<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SiteInput, SiteRecord } from '@/service/api';
import { createSite, updateSite } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';
import { $t } from '@/locales';

const props = defineProps<{ operateType: UI.TableOperateType; rowData?: SiteRecord | null }>();
const visible = defineModel<boolean>('visible', { default: false });
const emit = defineEmits<{ submitted: [id: string] }>();
const { formRef, validate, restoreValidation } = useForm();
const { defaultRequiredRule } = useFormRules();
const saving = ref(false);
const isEdit = computed(() => props.operateType === 'edit');
const model = ref(defaultModel());

function defaultModel(): SiteInput {
  return {
    name: '',
    baseUrl: '',
    dbHost: '',
    dbPort: 3306,
    dbName: '',
    dbUser: '',
    dbPassword: '',
    tablePrefix: '',
    timezone: 'Asia/Shanghai'
  };
}

const rules = computed(() => ({
  name: defaultRequiredRule,
  baseUrl: [
    defaultRequiredRule,
    { pattern: /^https?:\/\/[^\s]+$/, message: $t('page.site.urlInvalid'), trigger: 'blur' }
  ],
  dbHost: defaultRequiredRule,
  dbName: defaultRequiredRule,
  dbUser: defaultRequiredRule,
  dbPort: defaultRequiredRule,
  dbPassword: isEdit.value && props.rowData?.hasDbPassword ? [] : [defaultRequiredRule],
  tablePrefix: { pattern: /^[a-zA-Z0-9_]*$/, message: $t('page.site.prefixInvalid'), trigger: 'blur' },
  timezone: defaultRequiredRule
}));

watch(visible, open => {
  if (!open) {
    model.value.dbPassword = '';
    return;
  }
  restoreValidation();
  model.value = defaultModel();
  if (isEdit.value && props.rowData) {
    const row = props.rowData;
    model.value = {
      name: row.name,
      baseUrl: row.baseUrl,
      dbHost: row.dbHost,
      dbPort: row.dbPort,
      dbName: row.dbName,
      dbUser: row.dbUser,
      dbPassword: '',
      tablePrefix: row.tablePrefix ?? '',
      timezone: row.timezone
    };
  }
});

async function submit() {
  if (saving.value) return;
  if (isEdit.value && !props.rowData) return;
  await validate();
  saving.value = true;
  try {
    const { dbPassword, ...fields } = model.value;
    const result = isEdit.value && props.rowData
      ? await updateSite(props.rowData.id, dbPassword ? model.value : fields)
      : await createSite(model.value);
    if (result.error) return;
    window.$message?.success($t('page.site.savedConnecting'));
    visible.value = false;
    emit('submitted', result.data.id);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ElDrawer
    v-model="visible"
    :title="$t(isEdit ? 'page.site.edit' : 'page.site.add')"
    size="min(100vw, 480px)"
    :close-on-click-modal="!saving"
    :show-close="!saving"
  >
    <ElAlert v-if="isEdit" :title="$t('page.site.editHint')" type="info" :closable="false" class="mb-16px" />
    <ElForm
      ref="formRef"
      :model="model"
      :rules="rules"
      label-position="top"
      :disabled="saving"
      @submit.prevent="submit"
    >
      <ElFormItem :label="$t('page.site.name')" prop="name">
        <ElInput v-model.trim="model.name" :maxlength="100" />
      </ElFormItem>
      <ElFormItem :label="$t('page.site.baseUrl')" prop="baseUrl">
        <ElInput v-model.trim="model.baseUrl" placeholder="https://example.com" />
      </ElFormItem>
      <ElFormItem :label="$t('page.site.dbHost')" prop="dbHost"><ElInput v-model.trim="model.dbHost" /></ElFormItem>
      <ElFormItem :label="$t('page.site.dbPort')" prop="dbPort">
        <ElInputNumber v-model="model.dbPort" :min="1" :max="65535" class="w-full" />
      </ElFormItem>
      <ElFormItem :label="$t('page.site.dbName')" prop="dbName">
        <ElInput v-model.trim="model.dbName" :maxlength="64" />
      </ElFormItem>
      <ElFormItem :label="$t('page.site.dbUser')" prop="dbUser">
        <ElInput v-model.trim="model.dbUser" :maxlength="64" />
      </ElFormItem>
      <ElFormItem :label="$t('page.site.dbPassword')" prop="dbPassword">
        <ElInput
          v-model="model.dbPassword"
          type="password"
          show-password
          autocomplete="new-password"
          :maxlength="1024"
          :placeholder="isEdit && rowData?.hasDbPassword ? $t('page.site.passwordEditPlaceholder') : ''"
        />
        <p class="text-muted mt-4px text-12px">{{ $t('page.site.passwordHint') }}</p>
      </ElFormItem>
      <ElFormItem :label="$t('page.site.tablePrefix')" prop="tablePrefix">
        <ElInput v-model.trim="model.tablePrefix" :maxlength="64" />
        <p class="text-muted mt-4px text-12px">{{ $t('page.site.prefixHint') }}</p>
      </ElFormItem>
      <ElFormItem :label="$t('page.site.timezone')" prop="timezone">
        <ElInput v-model.trim="model.timezone" />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElSpace>
        <ElButton :disabled="saving" @click="visible = false">{{ $t('common.cancel') }}</ElButton>
        <ElButton type="primary" :loading="saving" @click="submit">{{ $t('page.site.save') }}</ElButton>
      </ElSpace>
    </template>
  </ElDrawer>
</template>
