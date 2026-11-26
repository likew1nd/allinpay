<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElDialog, ElDrawer } from 'element-plus';
import {
  deleteChannel,
  fetchChannelAdvanced,
  fetchChannelConfiguration,
  fetchChannelEdit,
  updateChannel,
  updateChannelAdvanced,
  updateChannelConfiguration
} from '@/service/api';
import type { ChannelAdvanced, ChannelConfiguration, ChannelEdit, SiteChannel } from '@/service/api';
import { useForm } from '@/hooks/common/form';

const props = defineProps<{
  siteId: string;
  channel: SiteChannel | null;
  action: 'edit' | 'configuration' | 'delete';
}>();
const visible = defineModel<boolean>('visible', { required: true });
const panelProps = computed(() =>
  props.action === 'configuration'
    ? { size: 'min(100vw, 480px)', direction: 'rtl' as const, class: 'site-channel-key-drawer' }
    : { width: '680px', alignCenter: true, class: 'site-channel-dialog' }
);
const emit = defineEmits<{ saved: [] }>();
const { formRef, validate } = useForm();
const loading = ref(false);
const saving = ref(false);
const failed = ref(false);
const password = ref('');
const model = ref<ChannelEdit | null>(null);
const configuration = ref<ChannelConfiguration | null>(null);
type AdvancedForm = Omit<ChannelAdvanced, 'dailyLimit' | 'dailyOrderLimit' | 'rateLimitSeconds' | 'rateLimitCount'> & {
  dailyLimit: string;
  dailyOrderLimit: string;
  rateLimitSeconds: string;
  rateLimitCount: string;
};
const advanced = ref<AdvancedForm | null>(null);
const advancedVisible = ref(false);
const rulesVisible = ref(false);
const rulesDraft = ref<ChannelAdvanced['orderNameRules']>([]);
const originalPlugin = ref('');
const originalType = ref(0);
const refreshingCatalog = ref(false);
const routeChanged = computed(() =>
  Boolean(
    model.value && (model.value.plugin !== originalPlugin.value || model.value.paymentTypeId !== originalType.value)
  )
);
const plugins = computed(() => {
  const type = model.value?.catalog.types.find(item => item.id === model.value?.paymentTypeId);
  return model.value?.catalog.plugins.filter(item => item.paymentTypes.includes(type?.code || '')) || [];
});
type ConfigField = ChannelConfiguration['fields'][number] & {
  value: string;
  originalValue: string;
  clear: boolean;
};
const fields = ref<ConfigField[]>([]);
const revision = ref('');
const newKey = ref('');
const signature = computed(() => fields.value.find(field => field.key === 'sign_type')?.value || '0');
const displayedFields = computed(() =>
  fields.value.filter(field => !field.signature || field.signature === signature.value)
);
let sequence = 0;
const title = computed(
  () =>
    `${{ edit: '编辑通道', configuration: '配置密钥', delete: '删除通道' }[props.action]} · ${props.channel?.name ?? ''}`
);
const labels: Record<string, string> = {
  appid: '应用 ID',
  appsecret: '应用私钥',
  appkey: '平台公钥',
  appmchid: '商户 ID',
  sign_type: '签名类型',
  app_cert_path: '应用证书路径',
  alipay_cert_path: '支付宝证书路径',
  root_cert_path: '根证书路径',
  mch_id: '商户号',
  api_key: 'API 密钥',
  key: '密钥',
  secret: '密钥'
};
async function load() {
  sequence += 1;
  const current = sequence;
  password.value = '';
  model.value = null;
  configuration.value = null;
  advanced.value = null;
  fields.value = [];
  revision.value = '';
  newKey.value = '';
  failed.value = false;
  if (!visible.value || !props.channel) return;
  loading.value = true;
  try {
    if (props.action === 'configuration') {
      const result = await fetchChannelConfiguration(props.siteId, props.channel.code);
      if (current !== sequence) return;
      failed.value = Boolean(result.error);
      if (result.data) {
        configuration.value = result.data;
        revision.value = result.data.revision;
        fields.value = result.data.fields.map(field => ({
          ...field,
          value: field.value || '',
          originalValue: field.value || '',
          clear: false
        }));
      }
    } else {
      const [result, advancedResult] = await Promise.all([
        fetchChannelEdit(props.siteId, props.channel.code),
        fetchChannelAdvanced(props.siteId, props.channel.code)
      ]);
      if (current !== sequence) return;
      failed.value = Boolean(result.error || advancedResult.error);
      if (result.data && advancedResult.data) {
        model.value = result.data;
        originalPlugin.value = result.data.plugin;
        originalType.value = result.data.paymentTypeId;
        revision.value = result.data.revision;
        advanced.value = {
          ...advancedResult.data,
          dailyLimit: String(advancedResult.data.dailyLimit),
          dailyOrderLimit: String(advancedResult.data.dailyOrderLimit),
          rateLimitSeconds: String(advancedResult.data.rateLimitSeconds),
          rateLimitCount: String(advancedResult.data.rateLimitCount)
        };
      }
    }
  } finally {
    if (current === sequence) loading.value = false;
  }
}
function addOrderRule() {
  rulesDraft.value.push({ name: '', min: '', max: '' });
}
function editOrderRules() {
  rulesDraft.value = (advanced.value?.orderNameRules || []).map(rule => ({ ...rule }));
  rulesVisible.value = true;
}
function saveOrderRules() {
  for (const [index, rule] of rulesDraft.value.entries()) {
    if (!rule.name.trim() || rule.min === '' || rule.max === '' || Number(rule.min) > Number(rule.max)) {
      window.$message?.error(`第 ${index + 1} 条规则请填写名称及有效金额区间`);
      return;
    }
  }
  if (advanced.value)
    advanced.value.orderNameRules = rulesDraft.value.map(rule => ({ ...rule, name: rule.name.trim() }));
  rulesVisible.value = false;
}
function advancedPayload(): ChannelAdvanced | null {
  if (!advanced.value) return null;
  return {
    ...advanced.value,
    dailyLimit: Number(advanced.value.dailyLimit || 0),
    dailyOrderLimit: Number(advanced.value.dailyOrderLimit || 0),
    rateLimitSeconds: Number(advanced.value.rateLimitSeconds || 0),
    rateLimitCount: Number(advanced.value.rateLimitCount || 0)
  };
}
function applyAdvanced(result: ChannelAdvanced) {
  if (!model.value || !advanced.value) return;
  model.value.revision = result.revision;
  revision.value = result.revision;
  advanced.value = {
    ...result,
    dailyLimit: String(result.dailyLimit),
    dailyOrderLimit: String(result.dailyOrderLimit),
    rateLimitSeconds: String(result.rateLimitSeconds),
    rateLimitCount: String(result.rateLimitCount)
  };
  model.value.dailyLimit = result.dailyLimit;
  model.value.dailyOrderLimit = result.dailyOrderLimit;
  model.value.minAmount = result.minAmount;
  model.value.maxAmount = result.maxAmount;
}
async function reloadAdvancedAfterSave(siteId: string, code: string) {
  const [refreshed, refreshedEdit] = await Promise.all([
    fetchChannelAdvanced(siteId, code),
    fetchChannelEdit(siteId, code)
  ]);
  if (!refreshed.data || !refreshedEdit.data) return false;
  applyAdvanced(refreshed.data);
  if (model.value) model.value.revision = refreshedEdit.data.revision;
  return true;
}
async function saveAdvanced() {
  if (!props.channel || saving.value || loading.value || failed.value || !revision.value) return;
  const siteId = props.siteId;
  const code = props.channel.code;
  const data = advancedPayload();
  if (!data) return;
  saving.value = true;
  try {
    const result = await updateChannelAdvanced(siteId, code, data);
    if (!result.error && siteId === props.siteId && code === props.channel?.code) {
      const refreshed = await reloadAdvancedAfterSave(siteId, code);
      if (!refreshed) {
        visible.value = false;
        window.$message?.warning('高级设置已保存，请重新打开通道编辑后继续');
      }
      advancedVisible.value = false;
      if (refreshed) window.$message?.success('高级设置已保存');
      emit('saved');
    }
  } catch (error) {
    window.$message?.error(error instanceof Error ? error.message : '操作未完成');
  } finally {
    saving.value = false;
  }
}
watch([visible, () => props.siteId, () => props.channel?.code, () => props.action], load);
function changePaymentType() {
  if (model.value && !plugins.value.some(plugin => plugin.name === model.value?.plugin)) model.value.plugin = '';
  if (model.value) model.value.resetConfiguration = false;
}
async function refreshCatalog() {
  if (!props.channel) return;
  const current = sequence;
  refreshingCatalog.value = true;
  try {
    const result = await fetchChannelEdit(props.siteId, props.channel.code);
    if (current === sequence && model.value && result.data) model.value.catalog = result.data.catalog;
  } finally {
    refreshingCatalog.value = false;
  }
}
function addField() {
  const key = newKey.value.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) {
    window.$message?.error('请填写有效的原站点插件配置字段名');
    return;
  }
  if (fields.value.some(field => field.key === key)) {
    window.$message?.error('该字段已存在');
    return;
  }
  fields.value.push({
    key,
    configured: false,
    kind: 'text',
    value: '',
    originalValue: '',
    clear: false
  });
  newKey.value = '';
}
function configChanges() {
  const changes: Record<string, unknown> = Object.create(null);
  displayedFields.value.forEach(field => {
    if (field.clear) {
      changes[field.key] = '';
    } else if (field.value !== field.originalValue) changes[field.key] = configValue(field);
  });
  if (!Object.keys(changes).length && configuration.value?.schema !== 'alipay')
    throw new Error('请填写需要修改的配置项');
  return changes;
}
function configValue(field: ConfigField) {
  if (!['array', 'boolean', 'number'].includes(field.kind)) return field.value;
  let value: unknown;
  try {
    value = JSON.parse(field.value);
  } catch {
    throw new Error(`${field.key} 的值需要使用 JSON 格式`);
  }
  if (
    (field.kind === 'array' && !Array.isArray(value)) ||
    (field.kind === 'boolean' && typeof value !== 'boolean') ||
    (field.kind === 'number' && typeof value !== 'number')
  )
    throw new Error(`${field.key} 的值类型不正确`);
  return value;
}
async function performSave(siteId: string, code: string) {
  if (props.action === 'edit' && model.value) return updateChannel(siteId, code, model.value);
  if (props.action === 'configuration')
    return updateChannelConfiguration(siteId, code, {
      revision: revision.value,
      changes: configChanges(),
      ...(configuration.value?.schema === 'alipay' ? { apptype: configuration.value.apptype } : {})
    });
  return deleteChannel(siteId, code, { revision: revision.value, password: password.value });
}
const readyToSave = computed(() => !saving.value && !loading.value && !failed.value && Boolean(revision.value));
function validatePluginChange() {
  if (routeChanged.value && !model.value?.resetConfiguration) {
    window.$message?.error('请确认更换插件会清除原有密钥配置');
    return false;
  }
  return true;
}
async function submit() {
  if (!props.channel || !readyToSave.value) return;
  const siteId = props.siteId;
  const code = props.channel.code;
  if (props.action === 'edit') {
    await validate();
    if (!model.value?.name.trim()) return;
    if (!validatePluginChange()) return;
  }
  if (props.action === 'delete' && !password.value) {
    window.$message?.error('请输入当前登录密码');
    return;
  }
  saving.value = true;
  try {
    const result = await performSave(siteId, code);
    if (!result.error && siteId === props.siteId && code === props.channel?.code) {
      window.$message?.success(props.action === 'delete' ? '通道已删除' : '通道配置已保存');
      visible.value = false;
      emit('saved');
    }
  } catch (error) {
    window.$message?.error(error instanceof Error ? error.message : '操作未完成');
  } finally {
    password.value = '';
    fields.value.forEach(field => {
      if (!field.input || field.secret) field.value = '';
      field.clear = false;
    });
    saving.value = false;
  }
}
</script>

<template>
  <component
    :is="action === 'configuration' ? ElDrawer : ElDialog"
    v-model="visible"
    v-bind="panelProps"
    :title="title"
    append-to-body
    :close-on-click-modal="false"
    :close-on-press-escape="!saving"
    :show-close="!saving"
    destroy-on-close
  >
    <div v-loading="loading" class="min-h-100px">
      <ElAlert v-if="failed" title="无法读取原站点通道，请稍后重新打开" type="error" :closable="false" />
      <ElForm
        v-if="action === 'edit' && model"
        ref="formRef"
        :model="model"
        label-width="110px"
        :disabled="saving"
        @submit.prevent="submit"
      >
        <ElFormItem
          label="显示名称"
          prop="name"
          :rules="[{ required: true, message: '请填写通道名', whitespace: true }]"
        >
          <ElInput v-model="model.name" :maxlength="30" />
        </ElFormItem>
        <ElFormItem
          label="分成比例 (%)"
          prop="rate"
          :rules="[
            {
              required: true,
              pattern: /^\d{1,3}(\.\d{1,2})?$/,
              message: '请输入 0 到 100 的比例，最多两位小数'
            }
          ]"
        >
          <ElInput v-model="model.rate" inputmode="decimal"><template #append>%</template></ElInput>
        </ElFormItem>
        <ElFormItem label="通道成本 (%)">
          <ElInput v-model="model.costRate" inputmode="decimal" placeholder="留空表示未设置">
            <template #append>%</template>
          </ElInput>
        </ElFormItem>
        <ElFormItem label="通道模式">
          <ElSelect v-model="model.mode">
            <ElOption :value="0" label="支付金额扣除手续费后加入商户余额（默认）" />
            <ElOption :value="1" label="支付完成后不给商户加余额，同时需扣手续费" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="支付方式" prop="paymentTypeId" :rules="[{ required: true, message: '请选择支付方式' }]">
          <ElSelect v-model="model.paymentTypeId" @change="changePaymentType">
            <ElOption
              v-for="type in model.catalog.types"
              :key="type.id"
              :value="type.id"
              :label="type.label"
              :disabled="!type.enabled && type.id !== originalType"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="支付插件" prop="plugin" :rules="[{ required: true, message: '请选择支付插件' }]">
          <div class="w-full flex gap-8px">
            <ElSelect v-model="model.plugin" @change="model.resetConfiguration = false">
              <ElOption
                v-for="plugin in plugins"
                :key="plugin.name"
                :value="plugin.name"
                :label="plugin.title + ' (' + plugin.name + ')'"
              />
              <ElOption
                v-if="model.plugin === originalPlugin && !plugins.some(plugin => plugin.name === originalPlugin)"
                :value="originalPlugin"
                :label="originalPlugin + '（当前插件）'"
                disabled
              />
            </ElSelect>
            <ElButton :loading="refreshingCatalog" title="重新读取原站点已安装插件列表" @click="refreshCatalog">
              刷新
            </ElButton>
          </div>
        </ElFormItem>
        <ElAlert
          v-if="routeChanged"
          type="warning"
          :closable="false"
          class="mb-16px"
          title="更换支付方式或插件将清除旧密钥和可用接口。请先停止通道，保存后重新配置密钥；更换支付方式还需解除路由关联。"
        >
          <ElCheckbox v-model="model.resetConfiguration">我确认清除旧配置</ElCheckbox>
        </ElAlert>
        <ElButton class="w-full" @click="advancedVisible = true">高级设置</ElButton>
      </ElForm>
      <template v-if="action === 'configuration' && revision">
        <ElAlert
          title="现有密钥不回显，留空保留原值，填写后替换。普通配置可直接修改。"
          type="info"
          :closable="false"
          class="mb-16px"
        />
        <ElForm label-position="top" :disabled="saving" autocomplete="off">
          <ElFormItem v-if="configuration?.schema === 'alipay'" label="请选择可用的接口" required>
            <ElCheckboxGroup v-model="configuration.apptype" class="channel-interface-options grid w-full gap-x-12px">
              <ElCheckbox v-for="option in configuration.interfaces" :key="option.value" :value="option.value">
                {{ option.label }}
              </ElCheckbox>
            </ElCheckboxGroup>
            <p class="w-full text-12px text-primary">选择可用的接口，只能选择已签约的产品，否则会无法支付！</p>
          </ElFormItem>
          <ElFormItem v-for="field in displayedFields" :key="field.key" :required="field.required">
            <template #label>
              <span>
                {{ field.label || labels[field.key] || field.key }}
                <span v-if="!field.label && labels[field.key]" class="opacity-60">({{ field.key }})</span>
              </span>
              <ElTag class="ml-8px" size="small" :type="field.configured ? 'success' : 'info'">
                {{ field.configured ? '已配置' : '未配置' }}
              </ElTag>
            </template>
            <ElRadioGroup v-if="field.input === 'radio'" v-model="field.value">
              <ElRadio v-for="option in field.options" :key="option.value" :value="option.value">
                {{ option.label }}
              </ElRadio>
            </ElRadioGroup>
            <div v-else-if="field.input" class="w-full">
              <ElInput
                v-model="field.value"
                :type="field.input === 'textarea' ? 'textarea' : 'text'"
                :rows="3"
                :maxlength="16000"
                autocomplete="off"
                :placeholder="
                  field.placeholder ||
                  (field.secret && field.configured ? '已配置，留空保留；填写新值替换' : '请输入' + field.label)
                "
              />
              <p v-if="field.signature === '1'" class="mt-4px text-12px opacity-70">填写原站点已上传证书的路径。</p>
            </div>
            <div v-else class="w-full flex items-center gap-12px">
              <ElInput
                v-model="field.value"
                :disabled="field.clear || field.kind === 'object'"
                type="password"
                autocomplete="new-password"
                :maxlength="16000"
                :placeholder="
                  field.kind === 'object'
                    ? '复杂配置请在原站点管理'
                    : field.kind === 'array'
                      ? '填写 JSON 字符串数组，留空保留'
                      : field.kind === 'boolean'
                        ? '填写 true 或 false，留空保留'
                        : '填写新值，留空保留原值'
                "
              />
              <ElCheckbox v-model="field.clear">清空</ElCheckbox>
            </div>
          </ElFormItem>
          <div v-if="configuration?.schema === 'generic'" class="flex items-center gap-8px">
            <ElInput v-model="newKey" placeholder="原站点插件字段名，如 appid" />
            <ElButton :disabled="!newKey.trim()" @click="addField">新增配置项</ElButton>
          </div>
          <p v-if="configuration?.schema === 'generic'" class="mt-8px text-12px opacity-70">
            当前插件暂用通用配置表单，字段和取值须与原站点插件一致。
          </p>
        </ElForm>
      </template>
      <template v-if="action === 'delete' && model">
        <ElAlert title="删除后无法恢复" type="error" show-icon :closable="false" class="mb-16px">
          <p>将永久删除原站点的该通道及其密钥配置，后续同步不会恢复。历史订单保留，但该通道将不能再收款。</p>
          <p class="mt-8px">请先停止通道并解除轮询组、路由、子通道、账号及策略关联；仍有关联时系统会拒绝删除。</p>
        </ElAlert>
        <ElForm label-position="top" :disabled="saving" @submit.prevent="submit">
          <ElFormItem label="当前登录密码">
            <ElInput
              v-model="password"
              type="password"
              autocomplete="current-password"
              :maxlength="1024"
              placeholder="输入当前中心后台登录账号的密码"
            />
          </ElFormItem>
        </ElForm>
      </template>
    </div>
    <template #footer>
      <ElButton :disabled="saving" @click="visible = false">关闭</ElButton>
      <ElButton
        :type="action === 'delete' ? 'danger' : 'primary'"
        :loading="saving"
        :disabled="loading || failed || !revision || (action === 'delete' && !password)"
        @click="submit"
      >
        {{ action === 'delete' ? '验证密码并删除' : '保存' }}
      </ElButton>
    </template>
  </component>
  <ElDialog
    v-if="action === 'edit'"
    v-model="advancedVisible"
    :title="`高级设置 - ${channel?.code ?? ''}`"
    width="600px"
    class="site-channel-dialog"
    append-to-body
    align-center
    :close-on-click-modal="false"
    :close-on-press-escape="!saving"
    :show-close="!saving"
  >
    <div v-if="advanced" v-loading="loading" class="min-h-100px">
      <ElForm :model="advanced" label-width="90px" :disabled="saving">
        <ElFormItem label="单日限额">
          <ElInput
            v-model="advanced.dailyLimit"
            inputmode="numeric"
            placeholder="0或留空为没有单日限额，超出限额会暂停使用该通道"
          />
        </ElFormItem>
        <ElFormItem label="单日限笔">
          <ElInput
            v-model="advanced.dailyOrderLimit"
            inputmode="numeric"
            placeholder="0或留空为没有单日支付订单数量限制"
          />
        </ElFormItem>
        <ElRow :gutter="20">
          <ElCol :span="12">
            <ElFormItem label="频率限制">
              <ElInput v-model="advanced.rateLimitSeconds" inputmode="numeric" placeholder="时间窗口">
                <template #append>秒内</template>
              </ElInput>
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem label=" ">
              <ElInput v-model="advanced.rateLimitCount" inputmode="numeric" placeholder="发起订单数">
                <template #append>笔</template>
              </ElInput>
            </ElFormItem>
          </ElCol>
        </ElRow>
        <ElRow :gutter="20">
          <ElCol :span="12">
            <ElFormItem label="单笔最小">
              <ElInput v-model="advanced.minAmount" inputmode="decimal" placeholder="留空无限额" />
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem label="单笔最大">
              <ElInput v-model="advanced.maxAmount" inputmode="decimal" placeholder="留空无限额" />
            </ElFormItem>
          </ElCol>
        </ElRow>
        <ElRow :gutter="20">
          <ElCol :span="12">
            <ElFormItem label="开放时间">
              <ElInput v-model="advanced.startHour" inputmode="numeric" placeholder="开始时间0~23小时" />
            </ElFormItem>
          </ElCol>
          <ElCol :span="12">
            <ElFormItem label=" ">
              <ElInput v-model="advanced.endHour" inputmode="numeric" placeholder="结束时间0~23小时" />
            </ElFormItem>
          </ElCol>
        </ElRow>
        <ElFormItem label="最低手续费">
          <div class="w-full">
            <ElRow :gutter="8">
              <ElCol :span="12">
                <ElInput v-model="advanced.feeThreshold" inputmode="decimal" placeholder="手续费低于多少元时">
                  <template #append>元</template>
                </ElInput>
              </ElCol>
              <ElCol :span="12">
                <ElInput v-model="advanced.minFee" inputmode="decimal" placeholder="最低扣除多少元">
                  <template #append>元</template>
                </ElInput>
              </ElCol>
            </ElRow>
            <p class="mt-4px text-12px text-primary">留空则使用系统设置中的手续费最低扣除</p>
          </div>
        </ElFormItem>
        <ElFormItem label="商品名称">
          <div class="w-full">
            <ElInput
              v-model="advanced.orderName"
              type="textarea"
              :rows="2"
              maxlength="255"
              placeholder="默认使用原商品名称，支付通道配置优先级高于系统设置和商户设置"
            />
            <p class="mt-4px text-12px text-primary">
              支持变量：[name]原商品名称，[order]支付订单号，[outorder]商户订单号，[time]时间戳，[qq]商户联系QQ，[phone]商户手机号。多个名称用
              | 隔开，可随机使用。
              <ElButton link type="primary" @click="editOrderRules">根据订单金额匹配商品名称</ElButton>
            </p>
          </div>
        </ElFormItem>
      </ElForm>
    </div>
    <template #footer>
      <ElButton :disabled="saving" @click="advancedVisible = false">关闭</ElButton>
      <ElButton type="primary" :loading="saving" :disabled="!advanced || !readyToSave" @click="saveAdvanced">
        保存
      </ElButton>
    </template>
  </ElDialog>
  <ElDialog
    v-model="rulesVisible"
    title="根据订单金额匹配商品名称"
    width="640px"
    class="site-channel-dialog"
    append-to-body
    align-center
    :close-on-click-modal="false"
  >
    <div class="mb-12px">
      <ElButton type="primary" size="small" @click="addOrderRule">新增一行</ElButton>
      <span class="ml-8px text-12px opacity-70">
        金额落在最小值和最大值区间内时使用商品名称，多条匹配时随机取一条。
      </span>
    </div>
    <ElTable :data="rulesDraft" border size="small" max-height="360">
      <ElTableColumn label="商品名称" min-width="160">
        <template #default="{ row }"><ElInput v-model="row.name" size="small" /></template>
      </ElTableColumn>
      <ElTableColumn label="最小金额" width="125">
        <template #default="{ row }"><ElInput v-model="row.min" size="small" inputmode="decimal" /></template>
      </ElTableColumn>
      <ElTableColumn label="最大金额" width="125">
        <template #default="{ row }"><ElInput v-model="row.max" size="small" inputmode="decimal" /></template>
      </ElTableColumn>
      <ElTableColumn label="操作" width="72" align="center" fixed="right">
        <template #default="{ $index }">
          <ElButton link type="danger" size="small" @click="rulesDraft.splice($index, 1)">删除</ElButton>
        </template>
      </ElTableColumn>
    </ElTable>
    <template #footer>
      <ElButton @click="rulesVisible = false">取消</ElButton>
      <ElButton type="primary" @click="saveOrderRules">确定</ElButton>
    </template>
  </ElDialog>
</template>

<style>
.site-channel-key-drawer > .el-drawer__header,
.site-channel-key-drawer > .el-drawer__footer {
  flex-shrink: 0;
}

.site-channel-key-drawer > .el-drawer__body {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-gutter: stable;
}

.site-channel-key-drawer .channel-interface-options {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.site-channel-key-drawer .channel-interface-options .el-checkbox {
  min-width: 0;
  margin-right: 0;
}

.site-channel-dialog.el-dialog {
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  overflow: hidden;
}

.site-channel-dialog > .el-dialog__header,
.site-channel-dialog > .el-dialog__footer {
  flex-shrink: 0;
}

.site-channel-dialog > .el-dialog__body {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-gutter: stable;
}
</style>
