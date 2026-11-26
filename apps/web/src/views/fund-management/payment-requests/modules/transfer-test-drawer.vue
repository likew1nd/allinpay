<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { createTransferTest, fetchAllPayees } from '@/service/api';
import type { Payee } from '@/service/api';

const props = defineProps<{ modelValue: boolean; accountId?: string; accountName?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; created: [] }>();

const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) });
const formRef = ref<FormInstance>();
const saving = ref(false);
// payee 的值有两种：选中收款池账号时是账号 ID，手动输入时是输入的账号文本
const form = reactive({ amount: '1.00', payee: '', remark: '' });
const payees = ref<Payee[]>([]);
const payeesLoading = ref(false);
const amountNumber = computed(() => Number(form.amount));
// 页面规则：转账金额小于 1.00 元时不能添加备注
const remarkEnabled = computed(() => amountNumber.value >= 1);
const selectedPayee = computed(() => payees.value.find(item => item.id === form.payee));
const rules: FormRules = {
  amount: [{ required: true, pattern: /^\d{1,16}(\.\d{1,2})?$/, message: '金额格式无效，最多两位小数', trigger: 'blur' }],
  payee: [{ required: true, message: '请选择收款池账号或填写接收人账号', trigger: 'change' }]
};

// 只列出已启用的收款池账号；加载失败不影响手动填写
async function loadPayees() {
  payeesLoading.value = true;
  try {
    const result = await fetchAllPayees();
    payees.value = result.error ? [] : result.data.filter(item => item.status === 'ACTIVE');
  } finally {
    payeesLoading.value = false;
  }
}

watch(visible, value => {
  if (!value) return;
  Object.assign(form, { amount: '1.00', payee: '', remark: '' });
  void loadPayees();
});
watch(remarkEnabled, enabled => {
  if (!enabled) form.remark = '';
});

async function submit() {
  if (saving.value || !props.accountId || !(await formRef.value?.validate().catch(() => false))) return;
  const payee = selectedPayee.value;
  const target = payee ? `${payee.name}（${payee.accountMasked}）` : form.payee.trim();
  try {
    await ElMessageBox.confirm(
      `将通过环境「${props.accountName || props.accountId}」真实转账 ${form.amount} 元给 ${target}，转账一旦提交无法撤回。确认提交？`,
      '转账测试',
      { type: 'warning', confirmButtonText: '确认转账', cancelButtonText: '返回' }
    );
  } catch {
    return;
  }
  saving.value = true;
  try {
    const result = await createTransferTest(props.accountId, {
      amount: form.amount,
      ...(payee ? { payeeId: payee.id } : { payeeAccount: form.payee.trim() }),
      remark: remarkEnabled.value ? form.remark.trim() : undefined
    });
    if (!result.error) {
      window.$message?.success('转账测试单已创建，等待采集端执行；可在“转账记录”查看进度');
      visible.value = false;
      emit('created');
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ElDrawer v-model="visible" title="转账测试" size="min(480px, 100vw)" destroy-on-close>
    <ElAlert
      class="mb-16px"
      type="warning"
      show-icon
      :closable="false"
      title="转账测试会真实付款。请使用小额，并确认接收人账号与姓名无误；提交后由所属采集端自动执行，不能撤回。"
    />
    <ElForm ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <ElFormItem label="付款环境">
        <ElInput :model-value="accountName || accountId" disabled />
      </ElFormItem>
      <ElFormItem label="转账金额（元）" prop="amount">
        <ElInput v-model.trim="form.amount" placeholder="如 1.00" maxlength="19" />
      </ElFormItem>
      <ElFormItem label="接收人账号" prop="payee">
        <ElSelect
          v-model="form.payee"
          class="w-full"
          filterable
          allow-create
          default-first-option
          clearable
          :loading="payeesLoading"
          placeholder="选择收款池账号，或直接输入支付宝账号、手机号、邮箱"
          no-data-text="收款池暂无启用账号，可直接输入账号"
        >
          <ElOption v-for="item in payees" :key="item.id" :value="item.id" :label="`${item.name}（${item.accountMasked}）`" />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="备注（可选，最多 20 字）">
        <ElInput
          v-model="form.remark"
          :disabled="!remarkEnabled"
          :placeholder="remarkEnabled ? '请输入备注' : '转账金额小于 1.00 元时不可添加备注'"
          maxlength="20"
          show-word-limit
        />
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElButton @click="visible = false">取消</ElButton>
      <ElButton type="primary" :loading="saving" @click="submit">提交转账测试</ElButton>
    </template>
  </ElDrawer>
</template>
