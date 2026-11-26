<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Payee } from '@/service/api';
import { createPayee, updatePayeeLimits } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';

const props = defineProps<{ operateType: UI.TableOperateType; rowData?: Payee | null }>();
const visible = defineModel<boolean>('visible', { default: false });
const emit = defineEmits<{ submitted: [] }>();
const { formRef, validate, restoreValidation } = useForm();
const { defaultRequiredRule } = useFormRules();
const saving = ref(false);
const model = ref({ name: '', account: '', dailyLimit: '', totalLimit: '' });
const isEdit = computed(() => props.operateType === 'edit');
const rules = computed(() => ({
  name: defaultRequiredRule,
  account: defaultRequiredRule,
  dailyLimit: [{ validator: validateLimit, trigger: 'blur' }],
  totalLimit: [{ validator: validateLimit, trigger: 'blur' }]
}));
function validateLimit(_rule: unknown, value: string | null, callback: (error?: Error) => void) {
  if (value == null || value === '' || /^\d{1,16}(\.\d{1,2})?$/.test(value)) callback();
  else callback(new Error('金额最多两位小数'));
}

watch([visible, () => props.rowData?.id], ([open]) => {
  if (!open) return;
  restoreValidation();
  const row = props.rowData;
  model.value = isEdit.value && row
    ? {
        name: row.name,
        account: '',
        dailyLimit: row.dailyLimit ?? '',
        totalLimit: row.totalLimit ?? ''
      }
    : { name: '', account: '', dailyLimit: '', totalLimit: '' };
});

async function submit() {
  if (saving.value || (isEdit.value && !props.rowData)) return;
  try {
    await validate();
  } catch {
    return;
  }
  saving.value = true;
  try {
    const result = isEdit.value && props.rowData
      ? await updatePayeeLimits(props.rowData.id, {
          dailyLimit: model.value.dailyLimit || null,
          totalLimit: model.value.totalLimit || null
        })
      : await createPayee({
          name: model.value.name,
          account: model.value.account,
          dailyLimit: model.value.dailyLimit || null,
          totalLimit: model.value.totalLimit || null
        });
    if (result.error) return;
    window.$message?.success('收款账号已保存');
    visible.value = false;
    emit('submitted');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ElDrawer
    v-model="visible"
    :title="isEdit ? '编辑收款限额' : '新增收款账号'"
    size="min(100vw, 480px)"
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    :show-close="!saving"
  >
    <ElForm ref="formRef" :model="model" :rules="rules" label-position="top" :disabled="saving" @submit.prevent="submit">
      <ElFormItem label="名称" prop="name" required>
        <ElInput v-model.trim="model.name" maxlength="100" :disabled="isEdit" />
      </ElFormItem>
      <ElFormItem v-if="!isEdit" label="账号" prop="account" required>
        <ElInput v-model.trim="model.account" autocomplete="off" maxlength="128" />
      </ElFormItem>
      <ElFormItem label="今日收款限额" prop="dailyLimit">
        <ElInput v-model="model.dailyLimit" inputmode="decimal" clearable placeholder="留空为无限" />
      </ElFormItem>
      <ElFormItem label="累计收款限额" prop="totalLimit">
        <ElInput v-model="model.totalLimit" inputmode="decimal" clearable placeholder="留空为无限" />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElSpace>
        <ElButton :disabled="saving" @click="visible = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="submit">保存</ElButton>
      </ElSpace>
    </template>
  </ElDrawer>
</template>
