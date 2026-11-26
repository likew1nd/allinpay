<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { AccountRecord } from '@/service/api';
import { fetchAccountCredentials, updateAccountCredentials } from '@/service/api';
import { useAuth } from '@/hooks/business/auth';
import { useForm } from '@/hooks/common/form';
import { $t } from '@/locales';

const props = defineProps<{ collectorId: string; account: AccountRecord | null }>();
const visible = defineModel<boolean>('visible', { default: false });
const emit = defineEmits<{ submitted: [] }>();
const { hasAuth } = useAuth();
const { formRef, validate, restoreValidation } = useForm();
const model = ref({ loginAccount: '', password: '', paymentPassword: '', appIdsText: '' });
const loading = ref(false);
const saving = ref(false);
const failed = ref(false);
const hasPassword = ref(false);
const hasPaymentPassword = ref(false);
const reload = ref(0);
let revision = 0;
const rules = computed(() =>
  Object.fromEntries(
    Object.entries({ loginAccount: 191, password: 1024, paymentPassword: 1024, appIdsText: 19_200 }).map(([key, max]) => [
      key,
      [{ max, message: $t('page.collector.credentialsTooLong', { max }), trigger: 'blur' }]
    ])
  )
);

watch(
  () => [visible.value, props.collectorId, props.account?.id, reload.value],
  async () => {
    revision += 1;
    const current = revision;
    restoreValidation();
    model.value = { loginAccount: '', password: '', paymentPassword: '', appIdsText: '' };
    hasPassword.value = false;
    hasPaymentPassword.value = false;
    failed.value = false;
    saving.value = false;
    loading.value = false;
    if (!visible.value || !props.account || !hasAuth('account:update')) return;
    loading.value = true;
    try {
      const result = await fetchAccountCredentials(props.collectorId, props.account.id);
      if (current !== revision) return;
      if (result.error) {
        failed.value = true;
        return;
      }
      model.value = { loginAccount: result.data.loginAccount, appIdsText: result.data.appIds.join('\n'), password: '', paymentPassword: '' };
      hasPassword.value = result.data.hasPassword;
      hasPaymentPassword.value = result.data.hasPaymentPassword;
    } catch {
      if (current === revision) failed.value = true;
    } finally {
      if (current === revision) loading.value = false;
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  revision += 1;
  model.value.password = '';
  model.value.paymentPassword = '';
});

async function submit() {
  if (saving.value || loading.value || failed.value || !props.account || !hasAuth('account:update')) return;
  const current = revision;
  const collectorId = props.collectorId;
  const accountId = props.account.id;
  saving.value = true;
  try {
    try {
      await validate();
    } catch {
      return;
    }
    if (current !== revision || !visible.value) return;
    const { password, paymentPassword, appIdsText, ...fields } = model.value;
    const appIds = [...new Set(appIdsText.split(/\r?\n/).map(value => value.trim()).filter(Boolean))];
    const result = await updateAccountCredentials(collectorId, accountId, {
      ...fields,
      appId: appIds[0] ?? '',
      appIds,
      ...(password ? { password } : {}),
      ...(paymentPassword ? { paymentPassword } : {})
    });
    if (current !== revision || result.error) return;
    window.$message?.success($t('page.collector.credentialsSaved'));
    model.value.password = '';
    model.value.paymentPassword = '';
    visible.value = false;
    emit('submitted');
  } finally {
    if (current === revision) saving.value = false;
  }
}
</script>

<template>
  <ElDrawer
    v-model="visible"
    :title="$t('page.collector.editAccount')"
    size="min(100vw, 480px)"
    destroy-on-close
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    :show-close="!saving"
  >
    <p class="mb-12px break-all font-medium">{{ account?.profileNo || account?.externalId }} · {{ account?.name }}</p>
    <p class="text-muted mb-16px text-12px">{{ $t('page.collector.credentialsHint') }}</p>
    <ElAlert v-if="failed" :title="$t('page.collector.credentialsFailed')" type="error" :closable="false">
      <ElButton link type="primary" @click="reload += 1">{{ $t('page.collector.credentialsRetry') }}</ElButton>
    </ElAlert>
    <ElForm
      ref="formRef"
      v-loading="loading"
      :model="model"
      :rules="rules"
      label-position="top"
      :disabled="saving || loading || failed || !hasAuth('account:update')"
      @submit.prevent="submit"
    >
      <ElFormItem :label="$t('page.collector.loginAccount')" prop="loginAccount">
        <ElInput v-model.trim="model.loginAccount" autocomplete="off" :maxlength="191" />
      </ElFormItem>
      <ElFormItem :label="$t('page.collector.loginPassword')" prop="password">
        <ElInput
          v-model="model.password"
          type="password"
          autocomplete="new-password"
          :maxlength="1024"
          :placeholder="hasPassword ? $t('page.collector.passwordKeep') : ''"
        />
        <p class="text-muted mt-4px text-12px">{{ $t('page.collector.passwordHint') }}</p>
      </ElFormItem>
      <ElFormItem :label="$t('page.collector.paymentPassword')" prop="paymentPassword">
        <ElInput
          v-model="model.paymentPassword"
          type="password"
          autocomplete="new-password"
          :maxlength="1024"
          :placeholder="hasPaymentPassword ? $t('page.collector.paymentPasswordKeep') : ''"
        />
        <p class="text-muted mt-4px text-12px">{{ $t('page.collector.paymentPasswordHint') }}</p>
      </ElFormItem>
      <ElFormItem :label="$t('page.collector.appId')" prop="appIdsText">
        <ElInput v-model="model.appIdsText" type="textarea" :rows="4" autocomplete="off" :maxlength="19200" />
        <p class="text-muted mt-4px text-12px">{{ $t('page.collector.appIdsHint') }}</p>
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElSpace>
        <ElButton :disabled="saving" @click="visible = false">{{ $t('common.cancel') }}</ElButton>
        <ElButton
          type="primary"
          :loading="saving"
          :disabled="loading || failed || !hasAuth('account:update')"
          @click="submit"
        >
          {{ $t('common.confirm') }}
        </ElButton>
      </ElSpace>
    </template>
  </ElDrawer>
</template>
