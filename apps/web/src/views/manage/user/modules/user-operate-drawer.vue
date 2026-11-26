<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { enableStatusOptions } from '@/constants/business';
import { fetchGetAllRoles, fetchSaveUser } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';
import { $t } from '@/locales';

defineOptions({ name: 'UserOperateDrawer' });

interface Props {
  /** the type of operation */
  operateType: UI.TableOperateType;
  /** the edit row data */
  rowData?: Api.SystemManage.User | null;
}

const props = defineProps<Props>();

interface Emits {
  (e: 'submitted'): void;
}

const emit = defineEmits<Emits>();

const visible = defineModel<boolean>('visible', {
  default: false
});

const { formRef, validate, restoreValidation } = useForm();
const { defaultRequiredRule } = useFormRules();

const title = computed(() => {
  const titles: Record<UI.TableOperateType, string> = {
    add: $t('page.manage.user.addUser'),
    edit: $t('page.manage.user.editUser')
  };
  return titles[props.operateType];
});

type Model = Pick<
  Api.SystemManage.User,
  'userName' | 'nickName' | 'userPhone' | 'userEmail' | 'userRoles' | 'status'
> & { password: string };

const saving = ref(false);
const rolesLoaded = ref(false);
const model = ref(createDefaultModel());

function createDefaultModel(): Model {
  return {
    userName: '',
    password: '',
    nickName: '',
    userPhone: '',
    userEmail: '',
    userRoles: [],
    status: '1'
  };
}

type RuleKey = Extract<keyof Model, 'userName' | 'nickName' | 'status'>;

const rules: Record<RuleKey, App.Global.FormRule> = {
  userName: { required: true, min: 6, message: $t('form.userName.invalid'), trigger: 'blur' },
  nickName: defaultRequiredRule,
  status: defaultRequiredRule
};

/** the enabled role options */
const roleOptions = ref<CommonType.Option<string>[]>([]);

async function getRoleOptions() {
  rolesLoaded.value = false;
  const { error, data } = await fetchGetAllRoles();

  if (!error) {
    const options = data.map(item => ({
      label: item.roleName,
      value: item.id
    }));

    roleOptions.value = options;
    rolesLoaded.value = true;
  }
}

function handleInitModel() {
  model.value = createDefaultModel();

  if (props.operateType === 'edit' && props.rowData) {
    Object.assign(model.value, props.rowData);
  }
}

function closeDrawer() {
  visible.value = false;
}

async function handleSubmit() {
  await validate();
  if (!rolesLoaded.value) return;
  saving.value = true;
  try {
    const { error } = await fetchSaveUser(model.value, props.operateType === 'edit' ? props.rowData?.id : undefined);
    if (error) return;
    window.$message?.success($t('common.updateSuccess'));
    closeDrawer();
    emit('submitted');
  } finally {
    saving.value = false;
  }
}

watch(visible, () => {
  if (visible.value) {
    handleInitModel();
    restoreValidation();
    getRoleOptions();
  }
});
</script>

<template>
  <ElDrawer v-model="visible" :title="title" :size="360">
    <ElForm ref="formRef" :model="model" :rules="rules" label-position="top">
      <ElFormItem :label="$t('page.manage.user.userName')" prop="userName">
        <ElInput v-model="model.userName" :placeholder="$t('page.manage.user.form.userName')" />
      </ElFormItem>
      <ElFormItem
        v-if="operateType === 'add'"
        :label="$t('page.login.common.passwordPlaceholder')"
        prop="password"
        :rules="[{ required: true, min: 6, message: $t('form.pwd.invalid'), trigger: 'blur' }]"
      >
        <ElInput v-model="model.password" type="password" show-password autocomplete="new-password" />
      </ElFormItem>
      <ElFormItem :label="$t('page.manage.user.nickName')" prop="nickName">
        <ElInput v-model="model.nickName" :placeholder="$t('page.manage.user.form.nickName')" />
      </ElFormItem>
      <ElFormItem :label="$t('page.manage.user.userPhone')" prop="userPhone">
        <ElInput v-model="model.userPhone" :placeholder="$t('page.manage.user.form.userPhone')" />
      </ElFormItem>
      <ElFormItem :label="$t('page.manage.user.userEmail')" prop="userEmail">
        <ElInput v-model="model.userEmail" :placeholder="$t('page.manage.user.form.userEmail')" />
      </ElFormItem>
      <ElFormItem :label="$t('page.manage.user.userStatus')" prop="status">
        <ElRadioGroup v-model="model.status">
          <ElRadio v-for="item in enableStatusOptions" :key="item.value" :value="item.value" :label="$t(item.label)" />
        </ElRadioGroup>
      </ElFormItem>
      <ElFormItem :label="$t('page.manage.user.userRole')" prop="userRoles">
        <ElSelect v-model="model.userRoles" multiple :placeholder="$t('page.manage.user.form.userRole')">
          <ElOption v-for="{ label, value } in roleOptions" :key="value" :label="label" :value="value" />
        </ElSelect>
      </ElFormItem>
    </ElForm>
    <template #footer>
      <ElSpace :size="16">
        <ElButton @click="closeDrawer">{{ $t('common.cancel') }}</ElButton>
        <ElButton type="primary" :loading="saving" :disabled="!rolesLoaded" @click="handleSubmit">
          {{ $t('common.confirm') }}
        </ElButton>
      </ElSpace>
    </template>
  </ElDrawer>
</template>

<style scoped></style>
