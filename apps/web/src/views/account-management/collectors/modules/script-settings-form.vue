<script setup lang="ts">
import ReleasePanel from '@/components/custom/release-panel.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessageBox } from 'element-plus';
import { type ScriptSettings, fetchScriptSettings, updateScriptSettings } from '@/service/api';
import { useAppStore } from '@/store/modules/app';
import { useAuth } from '@/hooks/business/auth';
import { $t } from '@/locales';
import EpayStatusSwitch from '@/components/custom/epay-status-switch.vue';

const emit = defineEmits<{ close: [] }>();
const activeTab = ref('runtime');
const appStore = useAppStore();
const { hasAuth } = useAuth();
const canSave = computed(() => hasAuth('collector:update'));
let disposed = false;
// 打码平台密码只保存在输入框，不回显；留空表示保持中心已保存的密码
const ttshituPassword = ref('');
const bingtopPassword = ref('');

const defaultSettings: ScriptSettings = {
  closeRestrictedChannels: false,
  restoreRecoveredChannels: false,
  loginCooldownMinutes: 10,
  loginMaxAttempts: 3,
  loginTimeoutMinutes: 3,
  environmentSyncMinutes: 30,
  balanceFreshMinutes: 10,
  qrWaitMinutes: 8,
  sliderOffsetPx: 10,
  captchaProvider: 'NONE',
  ttshituUsername: '',
  hasTtshituPassword: false,
  bingtopUsername: '',
  hasBingtopPassword: false,
  enabled: false,
  tab1Url: 'https://b.alipay.com/page/home',
  tab2Url: 'https://b.alipay.com/page/self-relieving-web/riskManage/list',
  tab3Url: 'https://open.alipay.com/develop/manage',
  minRefreshSeconds: 45,
  maxRefreshSeconds: 90,
  navigationTimeoutSeconds: 30,
  maxConcurrentAccounts: 1,
  retryCount: 2,
  actionTimeoutSeconds: 15
};

const formRef = ref();
const loading = ref(false);
const saving = ref(false);
const loaded = ref(false);
const form = reactive<ScriptSettings>({ ...defaultSettings });
const lastSavedAt = ref<string | null>(null);
const pollingMode = computed({
  get: () => (form.maxConcurrentAccounts === 1 ? 'serial' : 'concurrent'),
  set: (mode: 'serial' | 'concurrent') => {
    form.maxConcurrentAccounts = mode === 'serial' ? 1 : Math.max(2, form.maxConcurrentAccounts);
  }
});

const refreshRangeHint = computed(() => {
  if (form.minRefreshSeconds > form.maxRefreshSeconds) return '最小间隔不能大于最大间隔';
  return `每个环境完成后间隔 ${form.minRefreshSeconds}-${form.maxRefreshSeconds} 秒再次进入待巡检队列`;
});

const rules = {
  loginCooldownMinutes: [
    {
      required: true,
      type: 'integer',
      min: 1,
      max: 1440,
      message: $t('page.scriptSettings.loginCooldownRange'),
      trigger: 'change'
    }
  ],
  environmentSyncMinutes: [
    {
      required: true,
      type: 'integer',
      min: 1,
      max: 1440,
      message: $t('page.scriptSettings.environmentSyncRange'),
      trigger: 'change'
    }
  ],
  balanceFreshMinutes: [
    {
      required: true,
      type: 'integer',
      min: 1,
      max: 60,
      message: $t('page.scriptSettings.balanceFreshRange'),
      trigger: 'change'
    }
  ],
  qrWaitMinutes: [
    {
      required: true,
      type: 'integer',
      min: 1,
      max: 25,
      message: $t('page.scriptSettings.qrWaitRange'),
      trigger: 'change'
    }
  ],
  maxConcurrentAccounts: [
    {
      required: true,
      type: 'integer',
      min: 1,
      max: 20,
      message: $t('page.scriptSettings.concurrencyRange'),
      trigger: 'change'
    }
  ],
  tab1Url: [{ required: true, message: '请输入标签 1 地址', trigger: 'blur' }],
  tab2Url: [{ required: true, message: '请输入标签 2 地址', trigger: 'blur' }],
  tab3Url: [{ required: true, message: '请输入标签 3 地址', trigger: 'blur' }],
  minRefreshSeconds: [{ required: true, message: '请输入最小刷新间隔', trigger: 'change' }],
  maxRefreshSeconds: [{ required: true, message: '请输入最大刷新间隔', trigger: 'change' }]
};

let savedAutomation = { closeRestrictedChannels: false, restoreRecoveredChannels: false };

function applySettings(settings?: Partial<ScriptSettings> | null) {
  Object.assign(form, defaultSettings, settings ?? {});
  savedAutomation = { closeRestrictedChannels: form.closeRestrictedChannels, restoreRecoveredChannels: form.restoreRecoveredChannels };
  lastSavedAt.value = settings?.updatedAt ?? null;
  // 保存或重新加载后清空本地密码输入，密文只在中心保存
  ttshituPassword.value = '';
  bingtopPassword.value = '';
}

async function load() {
  if (loading.value || saving.value) return;
  loading.value = true;
  loaded.value = false;
  try {
    const result = await fetchScriptSettings();
    if (!disposed && !result.error) {
      applySettings(result.data);
      loaded.value = true;
    }
  } finally {
    loading.value = false;
  }
}

async function validateSettings() {
  if (form.minRefreshSeconds > form.maxRefreshSeconds) {
    activeTab.value = 'runtime';
    window.$message?.warning('请先修正刷新间隔范围');
    return false;
  }
  // 根据选择的平台验证对应凭据
  if (form.captchaProvider === 'TTSHITU') {
    if (!form.ttshituUsername.trim() || (!ttshituPassword.value && !form.hasTtshituPassword)) {
      activeTab.value = 'login';
      window.$message?.warning('请填写图鉴打码平台账号和密码');
      return false;
    }
  } else if (form.captchaProvider === 'BINGTOP') {
    if (!form.bingtopUsername.trim() || (!bingtopPassword.value && !form.hasBingtopPassword)) {
      activeTab.value = 'login';
      window.$message?.warning('请填写滨图打码平台账号和密码');
      return false;
    }
  }
  const valid = await formRef.value?.validate().catch(async (fields: Record<string, unknown>) => {
    const field = Object.keys(fields)[0] ?? '';
    if (field.startsWith('tab')) activeTab.value = 'pages';
    else activeTab.value = field.startsWith('login') ? 'login' : 'runtime';
    await nextTick();
    formRef.value?.scrollToField(field);
    return false;
  });
  return valid;
}

async function save() {
  if (!canSave.value || saving.value || loading.value || !loaded.value) return;
  if (!(await validateSettings())) return;
  saving.value = true;
  try {
    const result = await updateScriptSettings({
      closeRestrictedChannels: form.closeRestrictedChannels,
      restoreRecoveredChannels: form.restoreRecoveredChannels,
      enabled: form.enabled,
      tab1Url: form.tab1Url.trim(),
      tab2Url: form.tab2Url.trim(),
      tab3Url: form.tab3Url.trim(),
      minRefreshSeconds: form.minRefreshSeconds,
      maxRefreshSeconds: form.maxRefreshSeconds,
      navigationTimeoutSeconds: form.navigationTimeoutSeconds,
      maxConcurrentAccounts: form.maxConcurrentAccounts,
      retryCount: form.retryCount,
      actionTimeoutSeconds: form.actionTimeoutSeconds,
      loginCooldownMinutes: form.loginCooldownMinutes,
      loginMaxAttempts: form.loginMaxAttempts,
      loginTimeoutMinutes: form.loginTimeoutMinutes,
      environmentSyncMinutes: form.environmentSyncMinutes,
      balanceFreshMinutes: form.balanceFreshMinutes,
      qrWaitMinutes: form.qrWaitMinutes,
      sliderOffsetPx: form.sliderOffsetPx,
      captchaProvider: form.captchaProvider,
      ttshituUsername: form.ttshituUsername.trim(),
      bingtopUsername: form.bingtopUsername.trim(),
      ...(ttshituPassword.value ? { ttshituPassword: ttshituPassword.value } : {}),
      ...(bingtopPassword.value ? { bingtopPassword: bingtopPassword.value } : {})
    });
    if (!result.error && !disposed) {
      const processing = (result.data?.closeRestrictedChannels && !savedAutomation.closeRestrictedChannels) ||
        (result.data?.restoreRecoveredChannels && !savedAutomation.restoreRecoveredChannels);
      applySettings(result.data);
      window.$message?.success(processing ? $t('page.scriptSettings.restrictionAutomationSaved') : '脚本设置已保存');
    }
  } finally {
    saving.value = false;
  }
}

async function reset() {
  if (!canSave.value || saving.value || !loaded.value) return;
  try {
    await ElMessageBox.confirm('将恢复推荐参数，尚未保存的修改会丢失。是否继续？', '恢复默认设置', {
      type: 'warning',
      confirmButtonText: '恢复默认',
      cancelButtonText: '取消'
    });
    // 恢复推荐参数时保留登录次数和已配置的打码平台，避免一键清掉平台账号
    applySettings({
      loginMaxAttempts: form.loginMaxAttempts,
      captchaProvider: form.captchaProvider,
      ttshituUsername: form.ttshituUsername,
      hasTtshituPassword: form.hasTtshituPassword,
      bingtopUsername: form.bingtopUsername,
      hasBingtopPassword: form.hasBingtopPassword
    });
  } catch {
    // 用户取消恢复
  }
}

onBeforeUnmount(() => {
  disposed = true;
  ttshituPassword.value = '';
  bingtopPassword.value = '';
});

// 切换打码平台时清空尚未保存的密码输入，避免把上一个平台的密码保存到另一个平台
watch(
  () => form.captchaProvider,
  () => {
    ttshituPassword.value = '';
    bingtopPassword.value = '';
  }
);
onMounted(load);
</script>

<template>
  <div class="settings-workspace">
    <ElSkeleton v-if="loading && !loaded" :rows="8" animated class="p-16px" />
    <ElAlert v-else-if="!loaded" :title="$t('page.scriptSettings.loadFailed')" type="error" :closable="false">
      <ElButton link type="primary" @click="load">{{ $t('page.collector.credentialsRetry') }}</ElButton>
    </ElAlert>
    <ElForm
      v-else
      ref="formRef"
      class="settings-form"
      :model="form"
      :rules="rules"
      :disabled="!canSave || saving"
      label-position="top"
    >
      <div class="settings-monitor flex items-center justify-between gap-16px">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-10px">
            <span class="font-600">账号监控</span>
            <ElTag :type="form.enabled ? 'success' : 'info'" size="small" effect="plain">
              {{ form.enabled ? '已启用' : '已停用' }}
            </ElTag>
            <ElTag v-if="!canSave" type="info" size="small" effect="plain">只读</ElTag>
          </div>
          <p class="settings-hint m-0 mt-6px">{{ $t('page.scriptSettings.monitorDescription') }}</p>
          <p class="settings-hint m-0">停用后结束当前检查，停止后续轮询，保留浏览器与标签。</p>
        </div>
        <EpayStatusSwitch
          :checked="form.enabled"
          :label="form.enabled ? '停用账号监控' : '启用账号监控'"
          :disabled="!canSave || saving"
          @change="form.enabled = $event"
        />
      </div>
      <ElTabs v-model="activeTab" class="settings-tabs" :tab-position="appStore.isMobile ? 'top' : 'left'">
        <ElTabPane name="runtime">
          <template #label>
            <span class="settings-nav-label">
              <SvgIcon icon="tabler:adjustments-horizontal" aria-hidden="true" />
              <span>
                运行与巡检
                <small>频率、并发与超时</small>
              </span>
            </span>
          </template>
          <div class="settings-scroll">
            <div class="settings-panel-heading">
              <h3>运行与巡检</h3>
              <p>设置巡检节奏与每个采集端的运行方式。</p>
            </div>
            <div class="settings-columns">
              <section class="settings-section">
                <h4>刷新与同步</h4>
                <div class="settings-field-pair">
                  <ElFormItem label="最小刷新间隔（秒）" prop="minRefreshSeconds">
                    <ElInputNumber
                      v-model="form.minRefreshSeconds"
                      :min="5"
                      :max="3600"
                      :step="5"
                      controls-position="right"
                      class="w-full"
                    />
                  </ElFormItem>
                  <ElFormItem label="最大刷新间隔（秒）" prop="maxRefreshSeconds">
                    <ElInputNumber
                      v-model="form.maxRefreshSeconds"
                      :min="5"
                      :max="3600"
                      :step="5"
                      controls-position="right"
                      class="w-full"
                    />
                  </ElFormItem>
                </div>
                <p
                  class="settings-hint m-0 mb-20px"
                  :class="{ 'settings-hint--error': form.minRefreshSeconds > form.maxRefreshSeconds }"
                >
                  {{ refreshRangeHint }}。
                </p>
                <ElFormItem :label="$t('page.scriptSettings.closeRestrictedChannels')">
                  <ElSwitch v-model="form.closeRestrictedChannels" :aria-label="$t('page.scriptSettings.closeRestrictedChannels')" />
                </ElFormItem>
                <p class="settings-hint m-0 mb-20px">{{ $t('page.scriptSettings.closeRestrictedChannelsHint') }}</p>
                <ElFormItem :label="$t('page.scriptSettings.restoreRecoveredChannels')">
                  <ElSwitch v-model="form.restoreRecoveredChannels" :aria-label="$t('page.scriptSettings.restoreRecoveredChannels')" />
                </ElFormItem>
                <p class="settings-hint m-0 mb-20px">{{ $t('page.scriptSettings.restoreRecoveredChannelsHint') }}</p>
                <ElFormItem :label="$t('page.scriptSettings.environmentSyncMinutes')" prop="environmentSyncMinutes">
                  <ElInputNumber
                    v-model="form.environmentSyncMinutes"
                    :min="1"
                    :max="1440"
                    :precision="0"
                    controls-position="right"
                    class="w-full"
                  />
                </ElFormItem>
                <p class="settings-hint m-0 mb-20px">{{ $t('page.scriptSettings.environmentSyncHint') }}</p>
                <ElFormItem :label="$t('page.scriptSettings.balanceFreshMinutes')" prop="balanceFreshMinutes">
                  <ElInputNumber
                    v-model="form.balanceFreshMinutes"
                    :min="1"
                    :max="60"
                    :precision="0"
                    controls-position="right"
                    class="w-full"
                  />
                </ElFormItem>
                <p class="settings-hint m-0 mb-20px">{{ $t('page.scriptSettings.balanceFreshHint') }}</p>
                <ElFormItem :label="$t('page.scriptSettings.qrWaitMinutes')" prop="qrWaitMinutes">
                  <ElInputNumber
                    v-model="form.qrWaitMinutes"
                    :min="1"
                    :max="25"
                    :precision="0"
                    controls-position="right"
                    class="w-full"
                  />
                </ElFormItem>
                <p class="settings-hint m-0">{{ $t('page.scriptSettings.qrWaitHint') }}</p>
              </section>
              <section class="settings-section">
                <h4>并发与重试</h4>
                <ElFormItem :label="$t('page.scriptSettings.pollingMode')">
                  <ElRadioGroup v-model="pollingMode" class="settings-polling-mode">
                    <ElRadioButton value="serial">{{ $t('page.scriptSettings.serialPolling') }}</ElRadioButton>
                    <ElRadioButton value="concurrent">{{ $t('page.scriptSettings.concurrentPolling') }}</ElRadioButton>
                  </ElRadioGroup>
                </ElFormItem>
                <ElFormItem
                  v-if="pollingMode === 'concurrent'"
                  :label="$t('page.scriptSettings.concurrentEnvironments')"
                  prop="maxConcurrentAccounts"
                >
                  <ElInputNumber
                    v-model="form.maxConcurrentAccounts"
                    :aria-label="$t('page.scriptSettings.concurrentEnvironments')"
                    :min="2"
                    :max="20"
                    :precision="0"
                    step-strictly
                    controls-position="right"
                    class="w-full"
                  />
                </ElFormItem>
                <p class="settings-hint m-0 mb-20px">
                  {{ $t('page.scriptSettings.concurrencyHint', { count: form.maxConcurrentAccounts }) }}
                </p>
                <ElFormItem label="失败重试次数">
                  <ElInputNumber v-model="form.retryCount" :min="0" :max="5" controls-position="right" class="w-full" />
                </ElFormItem>
                <p class="settings-hint m-0">仅重试网络、标签不存在等可恢复错误；登录失效不会重复点击。</p>
              </section>
              <section class="settings-section col-span-full">
                <h4>页面超时</h4>
                <div class="settings-field-pair">
                  <ElFormItem label="页面导航超时（秒）">
                    <ElInputNumber
                      v-model="form.navigationTimeoutSeconds"
                      :min="5"
                      :max="180"
                      controls-position="right"
                      class="w-full"
                    />
                  </ElFormItem>
                  <ElFormItem label="页面信息读取超时（秒）">
                    <ElInputNumber
                      v-model="form.actionTimeoutSeconds"
                      :min="3"
                      :max="120"
                      controls-position="right"
                      class="w-full"
                    />
                  </ElFormItem>
                </div>
                <p class="settings-hint m-0">
                  资金、限制查询和 APPID 页面的每个读取步骤共用信息读取时长，页面导航单独计时。
                </p>
              </section>
            </div>
            <p class="settings-hint m-0 mt-16px">
              同一采集端按到期顺序、在并发上限内处理；环境较多时，实际等待时间可能延长。
            </p>
          </div>
        </ElTabPane>
        <ElTabPane name="pages">
          <template #label>
            <span class="settings-nav-label">
              <SvgIcon icon="tabler:browser" aria-hidden="true" />
              <span>
                固定标签
                <small>监控网址与 APPID</small>
              </span>
            </span>
          </template>
          <div class="settings-scroll">
            <div class="settings-panel-heading">
              <h3>固定标签</h3>
              <p>分别配置账号首页、限制查询与 APPID 页面地址。</p>
            </div>
            <div class="settings-note mb-16px">
              <SvgIcon icon="tabler:info-circle" aria-hidden="true" class="mt-2px shrink-0 text-16px" />
              <span>首次巡检绑定两个监控标签，登录跳转后继续复用；修改网址时在原标签打开。</span>
            </div>
            <section class="settings-section">
              <div class="settings-url-title">
                <span>01</span>
                <h4>账号首页</h4>
              </div>
              <ElFormItem label="标签 1 地址" prop="tab1Url">
                <ElInput v-model="form.tab1Url" placeholder="https://b.alipay.com/page/home" />
              </ElFormItem>
              <div class="settings-url-title mt-24px">
                <span>02</span>
                <h4>限制查询</h4>
              </div>
              <ElFormItem label="标签 2 地址" prop="tab2Url">
                <ElInput
                  v-model="form.tab2Url"
                  placeholder="https://b.alipay.com/page/self-relieving-web/riskManage/list"
                />
              </ElFormItem>
              <div class="settings-url-title mt-24px">
                <span>03</span>
                <h4>APPID 页面</h4>
              </div>
              <ElFormItem :label="$t('page.scriptSettings.tab3Url')" prop="tab3Url">
                <ElInput v-model="form.tab3Url" placeholder="https://open.alipay.com/develop/manage" />
              </ElFormItem>
            </section>
          </div>
        </ElTabPane>
        <ElTabPane name="login">
          <template #label>
            <span class="settings-nav-label">
              <SvgIcon icon="tabler:shield-lock" aria-hidden="true" />
              <span>
                登录与验证码
                <small>登录策略与识别平台</small>
              </span>
            </span>
          </template>
          <div class="settings-scroll">
            <div class="settings-panel-heading">
              <h3>登录与验证码</h3>
              <p>管理自动登录重试、等待时间和验证码识别服务。</p>
            </div>
            <div class="settings-columns">
              <section class="settings-section">
                <h4>{{ $t('page.scriptSettings.loginTitle') }}</h4>
                <ElFormItem :label="$t('page.scriptSettings.loginMaxAttempts')">
                  <ElInputNumber
                    v-model="form.loginMaxAttempts"
                    :min="1"
                    :max="5"
                    controls-position="right"
                    class="w-full"
                  />
                </ElFormItem>
                <ElFormItem :label="$t('page.scriptSettings.loginTimeoutMinutes')" prop="loginTimeoutMinutes">
                  <ElInputNumber
                    v-model="form.loginTimeoutMinutes"
                    :min="1"
                    :max="60"
                    :precision="0"
                    controls-position="right"
                    class="w-full"
                  />
                </ElFormItem>
                <ElFormItem :label="$t('page.scriptSettings.loginCooldownMinutes')" prop="loginCooldownMinutes">
                  <ElInputNumber
                    v-model="form.loginCooldownMinutes"
                    :min="1"
                    :max="1440"
                    :precision="0"
                    controls-position="right"
                    class="w-full"
                  />
                </ElFormItem>
                <ElFormItem :label="$t('page.scriptSettings.sliderOffsetPx')">
                  <ElInputNumber
                    v-model="form.sliderOffsetPx"
                    :min="-500"
                    :max="500"
                    :precision="0"
                    controls-position="right"
                    class="w-full"
                  />
                </ElFormItem>
                <details class="settings-help">
                  <summary>查看登录参数说明</summary>
                  <p>{{ $t('page.scriptSettings.loginRetryHint') }}</p>
                  <p>{{ $t('page.scriptSettings.loginTimeoutHint') }}</p>
                  <p>{{ $t('page.scriptSettings.loginCooldownHint') }}</p>
                  <p>{{ $t('page.scriptSettings.sliderOffsetHint') }}</p>
                </details>
              </section>
              <section class="settings-section">
                <h4>{{ $t('page.scriptSettings.captchaTitle') }}</h4>
                <p class="settings-hint m-0 mb-20px">选择自动识别平台，或保留人工完成验证码。</p>
                <ElFormItem :label="$t('page.scriptSettings.captchaProvider')">
                  <ElSelect v-model="form.captchaProvider" class="w-full">
                    <ElOption value="NONE" :label="$t('page.scriptSettings.captchaNone')" />
                    <ElOption value="TTSHITU" :label="$t('page.scriptSettings.captchaTtshitu')" />
                    <ElOption value="BINGTOP" label="滨图 Bingtop" />
                  </ElSelect>
                </ElFormItem>
                <template v-if="form.captchaProvider === 'TTSHITU'">
                  <ElFormItem label="图鉴平台账号">
                    <ElInput
                      v-model="form.ttshituUsername"
                      :maxlength="191"
                      autocomplete="off"
                      placeholder="图鉴账号"
                    />
                  </ElFormItem>
                  <ElFormItem label="图鉴平台密码">
                    <ElInput
                      v-model="ttshituPassword"
                      type="password"
                      show-password
                      :maxlength="1024"
                      autocomplete="new-password"
                      :placeholder="form.hasTtshituPassword ? '留空保持原密码' : '图鉴密码'"
                    />
                  </ElFormItem>
                </template>
                <template v-if="form.captchaProvider === 'BINGTOP'">
                  <ElFormItem label="滨图平台账号">
                    <ElInput
                      v-model="form.bingtopUsername"
                      :maxlength="191"
                      autocomplete="off"
                      placeholder="滨图账号"
                    />
                  </ElFormItem>
                  <ElFormItem label="滨图平台密码">
                    <ElInput
                      v-model="bingtopPassword"
                      type="password"
                      show-password
                      :maxlength="1024"
                      autocomplete="new-password"
                      :placeholder="form.hasBingtopPassword ? '留空保持原密码' : '滨图密码'"
                    />
                  </ElFormItem>
                </template>
                <p v-if="form.captchaProvider !== 'NONE'" class="settings-hint m-0 mb-16px">
                  密码加密后存储，留空保持原密码。
                </p>
              </section>
            </div>
          </div>
        </ElTabPane>
        <ElTabPane name="version">
          <template #label>
            <span class="settings-nav-label">
              <SvgIcon icon="tabler:package" aria-hidden="true" />
              <span>
                版本与下载
                <small>Windows 采集端</small>
              </span>
            </span>
          </template>
          <div class="settings-scroll">
            <div class="settings-panel-heading">
              <h3>Windows 采集端</h3>
            </div>
            <section class="settings-section">
              <ReleasePanel v-if="activeTab === 'version'" kind="agent" />
            </section>
            <details class="settings-help mt-16px">
              <summary>账号状态识别规则</summary>
              <div class="settings-state-row">
                <ElTag type="success" effect="plain">正常</ElTag>
                <p>标签 1 能读取到已登录的首页信息。</p>
              </div>
              <div class="settings-state-row">
                <ElTag type="warning" effect="plain">待登录</ElTag>
                <p>出现重新登录、扫码登录、登录失效或风控验证提示。</p>
              </div>
              <div class="settings-state-row">
                <ElTag type="danger" effect="plain">异常</ElTag>
                <p>页面导航超时、浏览器环境不可用或 AdsPower API 不可达，并记录最近错误。</p>
              </div>
            </details>
          </div>
        </ElTabPane>
      </ElTabs>
    </ElForm>
    <footer class="settings-footer">
      <div class="settings-save-info">
        <SvgIcon icon="tabler:clock" aria-hidden="true" class="shrink-0 text-16px" />
        <span>
          {{ lastSavedAt ? '最近保存：' + new Date(lastSavedAt).toLocaleString() : '设置保存后由采集端同步生效' }}
        </span>
      </div>
      <div class="settings-actions">
        <ElButton v-if="canSave" :disabled="saving || loading || !loaded" @click="reset">恢复默认</ElButton>
        <ElButton :disabled="saving" @click="emit('close')">{{ $t('common.close') }}</ElButton>
        <ElButton v-if="canSave" type="primary" :loading="saving" :disabled="loading || !loaded" @click="save">
          <template #icon><SvgIcon icon="tabler:device-floppy" aria-hidden="true" /></template>
          保存设置
        </ElButton>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.settings-workspace,
.settings-form {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.settings-workspace {
  color: var(--epay-text);
}

.settings-monitor {
  flex-shrink: 0;
  margin-bottom: 20px;
  padding: 16px 20px;
  border: 1px solid var(--el-color-primary-light-8);
  border-radius: 14px;
  background: color-mix(in srgb, var(--epay-blue) 5%, var(--epay-surface));
}

.settings-tabs {
  flex: 1;
  min-height: 0;
}

.settings-tabs :deep(.el-tabs__header.is-left) {
  flex-shrink: 0;
  width: 180px;
  margin: 0 20px 0 0;
}

.settings-tabs :deep(.el-tabs__nav-wrap::after),
.settings-tabs :deep(.el-tabs__active-bar) {
  display: none;
}

.settings-tabs :deep(.el-tabs__nav.is-left) {
  gap: 8px;
  width: 100%;
}

.settings-tabs :deep(.el-tabs__item.is-left) {
  height: auto;
  min-height: 68px;
  justify-content: flex-start;
  padding: 12px;
  border-radius: 12px;
  text-align: left;
}

.settings-tabs :deep(.el-tabs__item.is-active) {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.settings-tabs :deep(.el-tabs__item:hover) {
  background: var(--el-fill-color-light);
}

.settings-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.settings-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.settings-nav-label {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-nav-label > :first-child {
  flex-shrink: 0;
  font-size: 20px;
}

.settings-nav-label small {
  display: block;
  margin-top: 4px;
  color: var(--epay-muted);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}

.settings-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 2px 12px 12px 2px;
  overscroll-behavior-y: contain;
  scrollbar-gutter: stable;
}

.settings-panel-heading {
  margin-bottom: 20px;
}

.settings-panel-heading h3 {
  margin: 0;
  color: var(--epay-heading);
  font-size: 18px;
  font-weight: 600;
}

.settings-panel-heading p,
.settings-hint {
  color: var(--epay-muted);
  font-size: 12px;
  line-height: 1.7;
}

.settings-panel-heading p {
  margin: 0;
  margin-top: 6px;
  font-size: 13px;
}

.settings-columns,
.settings-field-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

.settings-field-pair {
  column-gap: 16px;
  row-gap: 0;
}

.settings-columns {
  align-items: start;
}

.settings-section {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 14px;
  background: var(--epay-surface);
}

.settings-section h4 {
  margin: 0 0 20px;
  color: var(--epay-heading);
  font-size: 14px;
  font-weight: 600;
}

.settings-section :deep(.el-form-item) {
  margin-bottom: 16px;
}

.settings-section :deep(.el-form-item__label) {
  color: var(--epay-text);
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
}

.settings-section :deep(.el-input-number) {
  width: 100%;
}

.settings-polling-mode {
  display: flex;
  width: 100%;
}

.settings-polling-mode :deep(.el-radio-button) {
  flex: 1;
}

.settings-polling-mode :deep(.el-radio-button__inner) {
  width: 100%;
  padding: 11px 16px;
}

.settings-hint--error {
  color: var(--el-color-danger);
}

.settings-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  color: var(--epay-muted);
  font-size: 12px;
  line-height: 1.8;
}

.settings-url-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.settings-url-title > span {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 8px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 600;
}

.settings-url-title h4 {
  margin: 0;
}

.settings-help {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
  color: var(--epay-muted);
  font-size: 12px;
  line-height: 1.8;
}

.settings-help summary {
  width: fit-content;
  padding-block: 4px;
  color: var(--el-color-primary);
  cursor: pointer;
}

.settings-help p {
  margin: 12px 0 0;
}

.settings-state-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 12px 0;
  font-size: 13px;
  line-height: 1.7;
}

.settings-state-row + .settings-state-row {
  border-top: 1px solid var(--el-border-color-lighter);
}

.settings-state-row :deep(.el-tag) {
  flex-shrink: 0;
  min-width: 56px;
}

.settings-state-row p {
  margin: 0;
}

.settings-footer {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.settings-save-info,
.settings-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-save-info {
  color: var(--epay-muted);
  font-size: 12px;
}

.settings-actions :deep(.el-button) {
  min-height: 38px;
  margin-left: 0;
  border-radius: 10px;
}

@media (min-width: 900px) {
  .settings-columns,
  .settings-field-pair {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 639px) {
  .settings-monitor {
    margin-bottom: 12px;
    padding: 12px;
  }

  .settings-tabs :deep(.el-tabs__header.is-top) {
    flex-shrink: 0;
    margin-bottom: 12px;
  }

  .settings-tabs :deep(.el-tabs__item.is-top) {
    height: 44px;
    padding-inline: 12px;
    border-radius: 10px;
  }

  .settings-nav-label {
    gap: 6px;
    font-size: 13px;
  }

  .settings-nav-label small {
    display: none;
  }

  .settings-scroll {
    padding-right: 6px;
  }

  .settings-section {
    padding: 16px;
  }

  .settings-footer {
    margin-top: 12px;
    padding-top: 12px;
  }

  .settings-actions {
    width: 100%;
  }

  .settings-actions :deep(.el-button) {
    flex: 1;
    min-height: 44px;
    padding-inline: 8px;
  }
}
</style>
