<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import { useAuthStore } from '@/store/modules/auth';
import { useForm, useFormRules } from '@/hooks/common/form';
import { $t } from '@/locales';

defineOptions({ name: 'PwdLogin' });

const authStore = useAuthStore();
const { formRef, validate } = useForm();
const rememberedAccount = useStorage('senlin-remembered-account', '');
const rememberAccount = ref(Boolean(rememberedAccount.value));
const model = ref({ userName: rememberedAccount.value, password: '' });

const rules = computed(() => {
  const { createRequiredRule } = useFormRules();
  // 登录凭据由后端校验，保留安装向导设置的账号和密码格式。
  return {
    userName: [createRequiredRule($t('form.userName.required'))],
    password: [createRequiredRule($t('form.pwd.required'))]
  };
});

watch(rememberAccount, remember => {
  if (!remember) rememberedAccount.value = '';
});

async function handleSubmit() {
  if (authStore.loginLoading) return;
  try {
    await validate();
  } catch {
    return;
  }
  // 只保存账号，密码始终交给浏览器的密码管理器处理。
  rememberedAccount.value = rememberAccount.value ? model.value.userName : '';
  await authStore.login(model.value.userName, model.value.password);
}
</script>

<template>
  <ElForm
    ref="formRef"
    :model="model"
    :rules="rules"
    size="large"
    label-position="top"
    :hide-required-asterisk="true"
    @submit.prevent="handleSubmit"
  >
    <ElFormItem prop="userName" :label="$t('page.login.common.accountLabel')" for="senlin-account">
      <ElInput
        id="senlin-account"
        v-model="model.userName"
        name="username"
        autocomplete="username"
        :placeholder="$t('page.login.common.userNamePlaceholder')"
      />
    </ElFormItem>
    <ElFormItem prop="password" :label="$t('page.login.common.passwordLabel')" for="senlin-password">
      <ElInput
        id="senlin-password"
        v-model="model.password"
        name="password"
        type="password"
        show-password
        autocomplete="current-password"
        :placeholder="$t('page.login.common.passwordPlaceholder')"
      />
    </ElFormItem>
    <div class="senlin-login-options">
      <ElCheckbox v-model="rememberAccount">{{ $t('page.login.common.rememberAccount') }}</ElCheckbox>
    </div>
    <ElButton
      class="senlin-submit"
      type="primary"
      size="large"
      native-type="submit"
      :loading="authStore.loginLoading"
      :disabled="authStore.loginLoading"
    >
      <span>{{ $t('page.login.common.submitLogin') }}</span>
      <SvgIcon icon="tabler:arrow-right" aria-hidden="true" />
    </ElButton>
  </ElForm>
</template>

<style scoped>
.senlin-login-options {
  display: flex;
  align-items: center;
  margin: 10px 0 22px;
}

.senlin-login-options :deep(.el-checkbox__label) {
  color: var(--login-muted);
  font-size: 12px;
}

.senlin-submit {
  width: 100%;
  min-height: 49px;
}

.senlin-submit :deep(> span) {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
}
</style>
