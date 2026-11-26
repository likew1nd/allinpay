<script setup lang="ts">
import { onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
import { beginMfaBinding, confirmMfaBinding, fetchMfaStatus, setMfaEnabled } from '@/service/api';
import type { MfaStatus } from '@/service/api';
import { useAuth } from '@/hooks/business/auth';
import { useForm, useFormRules } from '@/hooks/common/form';
import { showSwitchMessage } from '@/utils/message';

const { hasAuth } = useAuth();
const status = ref<MfaStatus | null>(null);
const loading = ref(false);
const saving = ref(false);
const secret = ref('');
const binding = ref({ code: '' });
const toggle = ref({ code: '', enabled: false });
const drawer = ref(false);
const { formRef, validate } = useForm();
const { formRules } = useFormRules();

function clearSecrets() {
  secret.value = '';
  binding.value.code = '';
  toggle.value.code = '';
  drawer.value = false;
}
async function load() {
  loading.value = true;
  try {
    const result = await fetchMfaStatus();
    if (!result.error) status.value = result.data;
  } finally {
    loading.value = false;
  }
}
async function begin() {
  if (saving.value) return;
  saving.value = true;
  clearSecrets();
  try {
    const result = await beginMfaBinding();
    if (!result.error) {
      secret.value = result.data.secret;
      await load();
    }
  } finally {
    saving.value = false;
  }
}
async function confirm() {
  if (saving.value) return;
  if (!/^\d{6}$/.test(binding.value.code)) {
    window.$message?.warning('请输入 6 位验证码');
    return;
  }
  saving.value = true;
  try {
    const result = await confirmMfaBinding(binding.value.code);
    binding.value.code = '';
    if (!result.error) {
      secret.value = '';
      window.$message?.success('验证器已绑定，请等待下一枚验证码后切换 MFA');
      await load();
    }
  } finally {
    saving.value = false;
  }
}
function openToggle() {
  if (!status.value) return;
  toggle.value = { enabled: !status.value.enabled, code: '' };
  drawer.value = true;
}
async function saveToggle() {
  if (saving.value) return;
  await validate();
  saving.value = true;
  try {
    const result = await setMfaEnabled(toggle.value.enabled, toggle.value.code);
    toggle.value.code = '';
    if (!result.error) {
      drawer.value = false;
      showSwitchMessage(result.data.enabled, result.data.enabled ? 'MFA 已开启' : 'MFA 已关闭');
      await load();
    }
  } finally {
    saving.value = false;
  }
}
onMounted(load);
onActivated(load);
onDeactivated(clearSecrets);
onUnmounted(clearSecrets);
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <ElCard v-loading="loading" class="card-wrapper">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-8px">
          <span>多因素认证</span>
          <ElButton :loading="loading" @click="load">刷新</ElButton>
        </div>
      </template>
      <ElAlert
        type="info"
        show-icon
        :closable="false"
        title="开启后，确认转账、开启自动转账都需要当前操作人的验证器验证码。"
      />
      <ElDescriptions v-if="status" :column="1" border class="mt-16px">
        <ElDescriptionsItem label="系统 MFA">
          <ElTag :type="status.enabled ? 'success' : 'danger'">{{ status.enabled ? '已开启' : '已关闭' }}</ElTag>
        </ElDescriptionsItem>
        <ElDescriptionsItem label="我的验证器">
          {{ status.bound ? '已绑定' : status.pending ? '等待验证' : '未绑定' }}
        </ElDescriptionsItem>
      </ElDescriptions>
      <div v-if="status && hasAuth('system-setting:update')" class="mt-16px flex flex-wrap gap-8px">
        <ElButton v-if="!status.bound" type="primary" :loading="saving" @click="begin">
          {{ status.pending ? '重新生成密钥' : '绑定验证器' }}
        </ElButton>
        <ElButton :disabled="!status.bound" :type="status.enabled ? 'warning' : 'primary'" @click="openToggle">
          {{ status.enabled ? '关闭 MFA' : '开启 MFA' }}
        </ElButton>
      </div>
      <ElAlert
        v-if="status?.pending && !secret"
        class="mt-16px"
        type="warning"
        :closable="false"
        title="待验证密钥不会回显。若未保存，请重新生成；旧密钥将失效。"
      />
    </ElCard>
    <ElCard v-if="secret" class="card-wrapper">
      <template #header>将密钥添加到你的验证器</template>
      <p class="mb-16px">
        在验证器中选择手动输入密钥，类型选择基于时间（TOTP），6 位数字，每 30 秒更新。密钥仅本次显示，请妥善保管。
      </p>
      <ElForm label-position="top" @submit.prevent="confirm">
        <ElFormItem label="验证器密钥">
          <ElInput :model-value="secret" readonly type="password" show-password autocomplete="off" />
        </ElFormItem>
        <ElFormItem label="验证器生成的 6 位验证码">
          <ElInput
            v-model="binding.code"
            maxlength="6"
            inputmode="numeric"
            autocomplete="one-time-code"
            class="max-w-320px"
          />
        </ElFormItem>
        <ElButton type="primary" :loading="saving" native-type="submit">验证并完成绑定</ElButton>
      </ElForm>
    </ElCard>
    <ElDrawer
      v-model="drawer"
      :title="toggle.enabled ? '开启 MFA' : '关闭 MFA'"
      size="min(440px, 100vw)"
      destroy-on-close
      @closed="toggle.code = ''"
    >
      <ElAlert
        class="mb-16px"
        type="warning"
        :closable="false"
        title="此设置对整个系统生效。开启和关闭都需要验证码；同一枚验证码只能使用一次。"
      />
      <ElForm
        ref="formRef"
        :model="toggle"
        :rules="{ code: formRules.code }"
        label-position="top"
        @submit.prevent="saveToggle"
      >
        <ElFormItem label="验证器验证码" prop="code">
          <ElInput v-model="toggle.code" maxlength="6" inputmode="numeric" autocomplete="one-time-code" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="drawer = false">取消</ElButton>
        <ElButton type="primary" :loading="saving" @click="saveToggle">
          确认{{ toggle.enabled ? '开启' : '关闭' }}
        </ElButton>
      </template>
    </ElDrawer>
  </div>
</template>
