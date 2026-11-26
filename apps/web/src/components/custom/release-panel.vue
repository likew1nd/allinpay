<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
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
  if (props.kind === 'agent') return installed.value || '尚未启用';
  if (data.value?.source && installed.value) return `本地开发版（基线 v${installed.value}）`;
  if (installed.value === '0.0.0') return '源码构建';
  if (installed.value) return `v${installed.value}`;
  if (data.value?.managed) return '等待读取版本';
  return import.meta.env.DEV ? '本地开发版' : '版本未登记';
});
const updateAvailable = computed(() => hasReleaseUpdate(installed.value, latest.value?.version));
const actionLabel = computed(() => props.kind === 'center' ? '升级中心' : '同步到本站');
let readRevision = 0;
async function read() {
  if (!hasAuth(props.kind === 'agent' ? 'collector:read' : 'system-setting:read')) return;
  const revision = ++readRevision;
  const result = await request<Status>({ url: props.kind === 'agent' ? '/releases/agent' : '/releases' });
  if (!result.error && revision === readRevision) data.value = result.data;
}
onMounted(read);
useAutoRefresh(read, undefined, () => Boolean(data.value?.managed || data.value?.source) && !busy.value);
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
    const result = await request({ url: '/releases/requests', method: 'post', data: { action, version } });
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
</script>
<template>
  <ElCard v-if="data" :class="plain ? 'release-panel--plain' : 'card-wrapper'" :shadow="plain ? 'never' : undefined">
    <template v-if="!plain" #header>{{ kind === 'center' ? '中心版本' : 'Windows 采集端发布' }}</template>
    <ElDescriptions :column="1">
      <ElDescriptionsItem :label="kind === 'center' ? '当前版本' : data.managed ? '本站版本' : '本机安装包版本'">
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
      <ElDescriptionsItem v-if="kind === 'agent' && data.agentError" label="同步状态">{{ data.agentError }}</ElDescriptionsItem>
      <ElDescriptionsItem v-if="data.checkError || data.result" label="状态">{{ data.checkError || data.result }}</ElDescriptionsItem>
    </ElDescriptions>
    <div class="mt-16px flex flex-wrap gap-8px">
      <template v-if="(data.managed || data.source) && hasAuth('system-setting:update')">
        <ElButton :disabled="busy || Boolean(data.pendingRegion)" @click="submit(true)">检查更新</ElButton>
        <ElButton v-if="data.managed && updateAvailable" type="primary" :disabled="busy || Boolean(data.pendingRegion)" @click="submit(false)">{{ actionLabel }}</ElButton>
      </template>
      <template v-if="kind === 'agent' && hasAuth('collector:read')">
        <ElButton :disabled="busy || !installed" @click="download('full')">下载 Windows 采集端（完整包）</ElButton>
        <ElButton :disabled="busy || !installed" @click="download('repair')">下载覆盖修复包</ElButton>
      </template>
    </div>
  </ElCard>
</template>

<style scoped>
/* 嵌入设置抽屉时去掉卡片外框，由所在分组提供边框和标题 */
.release-panel--plain {
  --el-card-padding: 0px;
  --el-card-bg-color: transparent;
  border: 0;
  box-shadow: none;
}
</style>
