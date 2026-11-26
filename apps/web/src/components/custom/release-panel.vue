<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { notifyScriptUpdate } from '@/service/api';
import { request } from '@/service/request';
import { getAuthorization } from '@/service/request/shared';
import { useAuth } from '@/hooks/business/auth';
import { getServiceBaseURL } from '@/utils/service';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { hasReleaseUpdate } from '@/utils/release';

const props = defineProps<{ kind: 'center' | 'agent'; plain?: boolean }>();
type Release = { version: string; html_url: string; published_at: string };
type Region = 'cn' | 'global';
type Status = { region?: Region; pendingRegion?: Region; managed: boolean; source?: boolean; current?: string; agent?: string; agentError?: string; checked?: string; result?: string; checkError?: string; available?: Partial<Record<'center' | 'agent', Release>> };
const { hasAuth } = useAuth();
const data = ref<Status>();
const busy = ref(false);
const latest = computed(() => data.value?.available?.[props.kind]);
const installed = computed(() => props.kind === 'center' ? data.value?.current : data.value?.agent);
const installedLabel = computed(() => {
  if (data.value?.source && installed.value) return `本地开发版（基线 v${installed.value}）`;
  if (installed.value === '0.0.0') return '源码构建';
  if (installed.value) return `v${installed.value}`;
  if (data.value?.managed) return '等待读取版本';
  return import.meta.env.DEV ? '本地开发版' : '版本未登记';
});
const updateAvailable = computed(() => hasReleaseUpdate(installed.value, latest.value?.version));
const hasAgentPackage = computed(() => Boolean(installed.value && installed.value !== '0.0.0'));
const readFailed = ref(false);
const agentStatus = computed(() => {
  if (!latest.value || readFailed.value || data.value?.checkError || data.value?.agentError) return '';
  if (updateAvailable.value) return '有新版本';
  return latest.value.version === installed.value ? '已是最新' : '';
});
const actionLabel = computed(() => props.kind === 'center' ? '升级中心' : '同步到本站');
let readRevision = 0;
async function read() {
  if (!hasAuth(props.kind === 'agent' ? 'collector:read' : 'system-setting:read')) return;
  const revision = ++readRevision;
  const result = await request<Status>({ url: props.kind === 'agent' ? '/releases/agent' : '/releases' });
  if (revision !== readRevision) return;
  readFailed.value = Boolean(result.error);
  if (!result.error) data.value = result.data;
}
onMounted(read);
useAutoRefresh(read, undefined, () => Boolean(data.value && (props.kind === 'agent' || data.value.managed || data.value.source)) && !busy.value);
async function selectRegion(value: unknown) {
  if (busy.value || (value !== 'cn' && value !== 'global')) return;
  readRevision += 1;
  busy.value = true;
  try {
    const result = await request({ url: '/releases/region', method: 'post', data: { region: value } });
    if (!result.error) await read();
  } finally { busy.value = false; }
}

async function submit(check: boolean) {
  const version = latest.value?.version;
  if (!check && !await ElMessageBox.confirm(`${actionLabel.value} v${version}？${props.kind === 'center' ? '升级期间中心服务会短暂停止。' : '兼容的旧版采集端将在下次心跳接收更新指令。'}`, '确认版本').then(() => true, () => false)) return;
  busy.value = true;
  try {
    const action = check ? 'check-update' : props.kind === 'center' ? 'update' : 'sync-agent';
    const result = await request({ url: '/releases/requests', method: 'post', data: { action, version, kind: props.kind } });
    if (!result.error && data.value?.source) {
      await read();
    } else if (!result.error) window.$message?.success('已提交到部署机');
  } finally { busy.value = false; }
}
async function download(kind: 'full' | 'repair') {
  busy.value = true;
  try {
    const { baseURL } = getServiceBaseURL(import.meta.env, import.meta.env.DEV && import.meta.env.VITE_HTTP_PROXY === 'Y');
    const response = await fetch(`${baseURL}/releases/installer/${kind}`, { headers: { Authorization: getAuthorization() ?? '' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/zip')) throw new Error();
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = kind === 'full' ? 'windows-agent.zip' : 'windows-agent-repair.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { window.$message?.error('安装包下载失败，请检查本站同步状态和登录权限'); }
  finally { busy.value = false; }
}

async function notifyAgents() {
  if (busy.value || !hasAgentPackage.value || !hasAuth('collector:update')) return;
  busy.value = true;
  try {
    const confirmed = await ElMessageBox.confirm(`通知采集端更新至本站版本 v${installed.value}？运行中的任务完成后重启，离线采集端上线后执行。`, '通知采集端更新', {
      type: 'warning', confirmButtonText: '确认通知', cancelButtonText: '取消',
    }).then(() => true, () => false);
    if (!confirmed) return;
    const result = await notifyScriptUpdate();
    if (!result.error) {
      const count = result.data?.notified ?? 0;
      window.$message?.success(count ? `已通知 ${count} 个采集端更新脚本` : '没有可通知的采集端');
    }
  } finally { busy.value = false; }
}
</script>
<template>
  <template v-if="kind === 'agent' && hasAuth('collector:read')">
    <div v-if="data">
      <div class="agent-release-row">
        <div>
          <div class="agent-release-label">本站版本</div>
          <div class="flex flex-wrap items-center gap-8px">
            <strong class="agent-release-version">{{ hasAgentPackage ? `v${installed}` : '尚未启用' }}</strong>
            <ElTag v-if="agentStatus" :type="updateAvailable ? 'warning' : 'success'" size="small" effect="plain">{{ agentStatus }}</ElTag>
          </div>
        </div>
        <div>
          <div class="agent-release-label">远端版本（GitHub）</div>
          <div class="agent-release-actions">
            <strong class="agent-release-version">{{ latest ? `v${latest.version}` : '—' }}</strong>
            <ElLink v-if="latest" :href="latest.html_url" target="_blank" rel="noopener noreferrer" type="primary">更新说明</ElLink>
          </div>
        </div>
        <div class="agent-release-actions">
          <ElButton :disabled="busy || Boolean(data.pendingRegion) || !hasAuth('system-setting:update')" @click="submit(true)">检查更新</ElButton>
          <ElButton v-if="data.managed && updateAvailable && hasAuth('system-setting:update')" type="primary" :disabled="busy || Boolean(data.pendingRegion)" @click="submit(false)">同步到本站</ElButton>
        </div>
      </div>
      <p v-if="data.agentError || data.checkError || readFailed" class="agent-release-error" role="status">{{ data.agentError || data.checkError || '版本信息刷新失败' }}</p>
      <div class="agent-release-row agent-release-downloads">
        <div class="agent-release-actions">
          <ElButton type="primary" :disabled="busy || !hasAgentPackage" @click="download('full')">下载完整包</ElButton>
          <ElButton :disabled="busy || !hasAgentPackage" @click="download('repair')">下载修复包</ElButton>
        </div>
        <ElButton v-if="hasAuth('collector:update')" text type="primary" :disabled="busy || !hasAgentPackage" @click="notifyAgents">通知采集端更新</ElButton>
      </div>
    </div>
    <div v-else-if="readFailed" role="status">读取版本失败 <ElButton text type="primary" @click="read">重试</ElButton></div>
    <ElSkeleton v-else :rows="2" />
  </template>
  <ElCard v-else-if="kind === 'center' && data" :class="plain ? 'release-panel--plain' : 'card-wrapper'" :shadow="plain ? 'never' : undefined">
    <template v-if="!plain" #header>中心版本</template>
    <ElDescriptions :column="1">
      <ElDescriptionsItem label="当前版本">
        {{ installedLabel }}
      </ElDescriptionsItem>
      <ElDescriptionsItem v-if="kind === 'center' && (data.managed || data.source)" label="更新服务器">
        <ElRadioGroup
          :model-value="data.pendingRegion || data.region || 'global'"
          :disabled="busy || !hasAuth('system-setting:update')"
          aria-label="更新服务器"
          @change="selectRegion"
        >
          <ElRadioButton value="cn">国内</ElRadioButton>
          <ElRadioButton value="global">境外</ElRadioButton>
        </ElRadioGroup>
        <span v-if="data.pendingRegion" class="ml-8px">等待切换</span>
      </ElDescriptionsItem>
      <ElDescriptionsItem v-if="data.managed || data.source" label="GitHub 正式版">
        <ElLink v-if="latest" :href="latest.html_url" target="_blank" rel="noopener noreferrer">v{{ latest.version }} · 更新说明</ElLink>
        <span v-else>尚未发现正式版</span>
      </ElDescriptionsItem>
      <ElDescriptionsItem v-if="data.source && updateAvailable" label="更新方式">当前为源码开发实例，可从上方更新说明查看版本差异。</ElDescriptionsItem>
      <ElDescriptionsItem v-if="data.checked" label="上次成功检查">{{ new Date(data.checked).toLocaleString() }}</ElDescriptionsItem>
      <ElDescriptionsItem v-if="data.checkError || data.result" label="状态">{{ data.checkError || data.result }}</ElDescriptionsItem>
    </ElDescriptions>
    <div class="mt-16px flex flex-wrap gap-8px">
      <template v-if="(data.managed || data.source) && hasAuth('system-setting:update')">
        <ElButton :disabled="busy || Boolean(data.pendingRegion)" @click="submit(true)">检查更新</ElButton>
        <ElButton v-if="data.managed && updateAvailable" type="primary" :disabled="busy || Boolean(data.pendingRegion)" @click="submit(false)">{{ actionLabel }}</ElButton>
      </template>
    </div>
  </ElCard>
</template>

<style scoped>
.agent-release-row, .agent-release-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.agent-release-row { justify-content: space-between; }
.agent-release-actions :deep(.el-button + .el-button) { margin-left: 0; }
.agent-release-label { margin-bottom: 4px; color: var(--epay-muted); font-size: 13px; }
.agent-release-version { color: var(--epay-heading); font-size: 24px; line-height: 1.4; }
.agent-release-downloads { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--el-border-color-lighter); }
.agent-release-error { margin: 12px 0 0; color: var(--el-color-danger); }

/* 嵌入设置抽屉时去掉卡片外框，由所在分组提供边框和标题 */
.release-panel--plain {
  --el-card-padding: 0px;
  --el-card-bg-color: transparent;
  border: 0;
  box-shadow: none;
}
</style>
