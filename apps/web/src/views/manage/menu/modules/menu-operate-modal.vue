<script setup lang="tsx">
import { computed, h, ref, watch } from 'vue';
import { enableStatusOptions, menuIconTypeOptions, menuTypeOptions } from '@/constants/business';
import { fetchSaveMenu } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';
import { getLocalIcons } from '@/utils/icon';
import { $t } from '@/locales';
import SvgIcon from '@/components/custom/svg-icon.vue';
import {
  getLayoutAndPage,
  getPathParamFromRoutePath,
  getRoutePathByRouteName,
  getRoutePathWithParam,
  transformLayoutAndPageToComponent
} from './shared';

defineOptions({ name: 'MenuOperateModal' });

export type OperateType = UI.TableOperateType | 'addChild';

interface Props {
  /** the type of operation */
  operateType: OperateType;
  /** the edit menu data or the parent menu data when adding a child menu */
  rowData?: Api.SystemManage.Menu | null;
  /** all pages */
  allPages: string[];
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
  const titles: Record<OperateType, string> = {
    add: $t('page.manage.menu.addMenu'),
    addChild: $t('page.manage.menu.addChildMenu'),
    edit: $t('page.manage.menu.editMenu')
  };
  return titles[props.operateType];
});

type Model = Pick<
  Api.SystemManage.Menu,
  | 'menuType'
  | 'menuName'
  | 'routeName'
  | 'routePath'
  | 'component'
  | 'order'
  | 'i18nKey'
  | 'icon'
  | 'iconType'
  | 'status'
  | 'parentId'
  | 'keepAlive'
  | 'constant'
  | 'href'
  | 'hideInMenu'
  | 'activeMenu'
  | 'multiTab'
> & {
  layout: string;
  page: string;
  pathParam: string;
};

const model = ref(createDefaultModel());
const saving = ref(false);

function createDefaultModel(): Model {
  return {
    menuType: '1',
    menuName: '',
    routeName: '',
    routePath: '',
    pathParam: '',
    component: '',
    layout: 'base',
    page: '',
    i18nKey: null,
    icon: '',
    iconType: '1',
    parentId: 0,
    status: '1',
    keepAlive: false,
    constant: false,
    order: 0,
    href: null,
    hideInMenu: false,
    activeMenu: undefined,
    multiTab: false
  };
}

type RuleKey = Extract<keyof Model, 'menuName' | 'status' | 'routeName' | 'routePath'>;

const rules: Record<RuleKey, App.Global.FormRule> = {
  menuName: defaultRequiredRule,
  status: defaultRequiredRule,
  routeName: defaultRequiredRule,
  routePath: defaultRequiredRule
};

const disabledMenuType = computed(() => props.operateType === 'edit');

const localIcons = getLocalIcons();
const localIconOptions = localIcons.map(item => ({
  value: item
}));

function getIconLabelVNode(value: string) {
  return h('div', { class: 'flex-y-center gap-16px' }, [
    h(SvgIcon, { localIcon: value, class: 'text-icon' }),
    h('span', { class: 'text-sm' }, value)
  ]);
}

const showLayout = computed(() => model.value.parentId === 0);

const showPage = computed(() => model.value.menuType === '2');

const pageOptions = computed(() => {
  const allPages = [...props.allPages];

  if (model.value.routeName && !allPages.includes(model.value.routeName)) {
    allPages.unshift(model.value.routeName);
  }

  const opts: CommonType.Option[] = allPages.map(page => ({
    label: page,
    value: page
  }));

  return opts;
});

const layoutOptions: CommonType.Option[] = [
  { label: 'base', value: 'base' },
  { label: 'blank', value: 'blank' }
];

function handleInitModel() {
  model.value = createDefaultModel();

  if (!props.rowData) return;

  if (props.operateType === 'addChild') {
    const { id } = props.rowData;

    Object.assign(model.value, { parentId: id, layout: '', menuType: '2' });
  }

  if (props.operateType === 'edit') {
    const { component, ...rest } = props.rowData;

    const { layout, page } = getLayoutAndPage(component);
    const { path, param } = getPathParamFromRoutePath(rest.routePath);

    Object.assign(model.value, rest, { layout, page, routePath: path, pathParam: param });
  }
}

function closeDrawer() {
  visible.value = false;
}

function handleUpdateRoutePathByRouteName() {
  if (model.value.routeName) {
    model.value.routePath = getRoutePathByRouteName(model.value.routeName);
  } else {
    model.value.routePath = '';
  }
}

function getSubmitParams() {
  const { layout, page, pathParam, ...params } = model.value;

  const component = transformLayoutAndPageToComponent(layout, page);
  const routePath = getRoutePathWithParam(model.value.routePath, pathParam);

  params.component = component;
  params.routePath = routePath;

  return params;
}

async function handleSubmit() {
  await validate();

  const params = getSubmitParams();

  saving.value = true;
  try {
    const { error } = await fetchSaveMenu(params, props.operateType === 'edit' ? props.rowData?.id : undefined);
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
  }
});

function handleRouteNameChange() {
  if (props.operateType === 'edit') return;
  handleUpdateRoutePathByRouteName();
}
</script>

<template>
  <ElDialog v-model="visible" :title="title" preset="card" class="w-800px">
    <ElScrollbar class="h-480px pr-20px">
      <ElForm ref="formRef" :model="model" :rules="rules" label-position="right" :label-width="100">
        <ElRow>
          <ElCol :span="12">
            <ElFormItem :label="$t('page.manage.menu.menuType')" prop="menuType">
              <ElRadioGroup v-model="model.menuType" :disabled="disabledMenuType">
                <ElRadio
                  v-for="item in menuTypeOptions"
                  :key="item.value"
                  :value="item.value"
                  :label="$t(item.label)"
                />
              </ElRadioGroup>
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem :label="$t('page.manage.menu.menuName')" prop="menuName">
              <ElInput v-model="model.menuName" :placeholder="$t('page.manage.menu.form.menuName')" />
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem :label="$t('page.manage.menu.routeName')" prop="routeName">
              <ElInput
                v-model="model.routeName"
                :placeholder="$t('page.manage.menu.form.routeName')"
                @input="handleRouteNameChange"
              />
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem :label="$t('page.manage.menu.routePath')" prop="routePath">
              <ElInput v-model="model.routePath" :placeholder="$t('page.manage.menu.form.routePath')" />
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem :label="$t('page.manage.menu.pathParam')" prop="pathParam">
              <ElInput v-model="model.pathParam" :placeholder="$t('page.manage.menu.form.pathParam')" />
            </ElFormItem>
          </ElCol>
          <ElCol v-if="showLayout" :span="12">
            <ElFormItem :label="$t('page.manage.menu.layout')" prop="layout">
              <ElSelect v-model="model.layout" clearable :placeholder="$t('page.manage.menu.form.layout')">
                <ElOption
                  v-for="{ label, value } in layoutOptions"
                  :key="value"
                  :label="label"
                  :value="value"
                ></ElOption>
              </ElSelect>
            </ElFormItem>
          </ElCol>
          <ElCol v-if="showPage" :span="12">
            <ElFormItem :label="$t('page.manage.menu.page')" prop="page">
              <ElSelect v-model="model.page" clearable :placeholder="$t('page.manage.menu.form.page')">
                <ElOption v-for="{ label, value } in pageOptions" :key="value" :label="label" :value="value"></ElOption>
              </ElSelect>
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem :label="$t('page.manage.menu.i18nKey')" prop="i18nKey">
              <ElInput v-model="model.i18nKey" :placeholder="$t('page.manage.menu.form.i18nKey')" />
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem :label="$t('page.manage.menu.order')" prop="order">
              <ElInputNumber v-model="model.order" class="w-full" :placeholder="$t('page.manage.menu.form.order')" />
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem :label="$t('page.manage.menu.iconTypeTitle')" prop="iconType">
              <ElRadioGroup v-model="model.iconType">
                <ElRadio
                  v-for="item in menuIconTypeOptions"
                  :key="item.value"
                  :value="item.value"
                  :label="$t(item.label)"
                />
              </ElRadioGroup>
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem :label="$t('page.manage.menu.icon')" prop="icon">
              <template v-if="model.iconType === '1'">
                <ElInput v-model="model.icon" :placeholder="$t('page.manage.menu.form.icon')" class="flex-1">
                  <template #suffix>
                    <SvgIcon v-if="model.icon" :icon="model.icon" class="text-icon" />
                  </template>
                </ElInput>
              </template>
              <template v-if="model.iconType === '2'">
                <ElSelect v-model="model.icon" :placeholder="$t('page.manage.menu.form.localIcon')">
                  <template #label="{ value }">
                    <component :is="getIconLabelVNode(value)" />
                  </template>
                  <ElOption v-for="{ value } in localIconOptions" :key="value" :value="value">
                    <component :is="getIconLabelVNode(value)" />
                  </ElOption>
                </ElSelect>
              </template>
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem :label="$t('page.manage.menu.menuStatus')" prop="status">
              <ElRadioGroup v-model="model.status">
                <ElRadio
                  v-for="{ label, value } in enableStatusOptions"
                  :key="value"
                  :value="value"
                  :label="$t(label)"
                />
              </ElRadioGroup>
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem :label="$t('page.manage.menu.keepAlive')" prop="keepAlive">
              <ElRadioGroup v-model="model.keepAlive">
                <ElRadio :value="true" :label="$t('common.yesOrNo.yes')" />
                <ElRadio :value="false" :label="$t('common.yesOrNo.no')" />
              </ElRadioGroup>
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem :label="$t('page.manage.menu.constant')" prop="constant">
              <ElRadioGroup v-model="model.constant">
                <ElRadio :value="true" :label="$t('common.yesOrNo.yes')" />
                <ElRadio :value="false" :label="$t('common.yesOrNo.no')" />
              </ElRadioGroup>
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem :label="$t('page.manage.menu.href')" prop="href">
              <ElInput v-model="model.href" :placeholder="$t('page.manage.menu.form.href')" />
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem :label="$t('page.manage.menu.hideInMenu')" prop="hideInMenu">
              <ElRadioGroup v-model="model.hideInMenu">
                <ElRadio :value="true" :label="$t('common.yesOrNo.yes')" />
                <ElRadio :value="false" :label="$t('common.yesOrNo.no')" />
              </ElRadioGroup>
            </ElFormItem>
          </ElCol>
          <ElCol v-if="model.hideInMenu" :span="12">
            <ElFormItem :label="$t('page.manage.menu.activeMenu')" prop="activeMenu">
              <ElSelect
                v-model="model.activeMenu"
                :options="pageOptions"
                clearable
                :placeholder="$t('page.manage.menu.form.activeMenu')"
              >
                <ElOption v-for="{ label, value } in pageOptions" :key="value" :label="label" :value="value"></ElOption>
              </ElSelect>
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem :label="$t('page.manage.menu.multiTab')" prop="multiTab">
              <ElRadioGroup v-model="model.multiTab">
                <ElRadio :value="true" :label="$t('common.yesOrNo.yes')" />
                <ElRadio :value="false" :label="$t('common.yesOrNo.no')" />
              </ElRadioGroup>
            </ElFormItem>
          </ElCol>
        </ElRow>
      </ElForm>
    </ElScrollbar>
    <template #footer>
      <ElSpace :size="16" class="float-right">
        <ElButton @click="closeDrawer">{{ $t('common.cancel') }}</ElButton>
        <ElButton type="primary" :loading="saving" @click="handleSubmit">{{ $t('common.confirm') }}</ElButton>
      </ElSpace>
    </template>
  </ElDialog>
</template>

<style scoped></style>
