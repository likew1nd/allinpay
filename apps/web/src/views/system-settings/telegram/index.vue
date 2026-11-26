<script setup lang="ts">
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { useUITable } from '@/hooks/common/table';
import { useTableQuery } from '@/hooks/common/table-query';
import { computed, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import * as api from '@/service/api/telegram';
import { useAuth } from '@/hooks/business/auth';
import { useForm } from '@/hooks/common/form';
import ScopeEditor from './modules/scope-editor.vue';
import BindingCode from './modules/binding-code.vue';
import NoticeFieldReference from './modules/notice-field-reference.vue';
import NotificationRoutes from './modules/notification-routes.vue';
import NoticeTargetSelect from './modules/notice-target-select.vue';
import EnvironmentTemplateEditor from './modules/environment-template-editor.vue';

const { hasAuth } = useAuth();
const { formRef, validate } = useForm();
const config = ref<api.TelegramConfig>();
const token = ref('');
const enabled = ref(false);
const replaceBot = ref(false);
const loading = ref(false);
const saving = ref(false);
const targets = ref<api.TelegramTarget[]>([]);
const bindings = ref<api.TelegramBinding[]>([]);
const commands = ref<api.TelegramCommand[]>([]);
const actions = ref<api.TelegramAction[]>([]);
const tab = ref('bot');
const drawer = ref<'target' | 'binding' | 'command' | ''>('');
const target = ref<api.TelegramTarget>();
const binding = ref<api.TelegramBinding>();
const command = ref<api.TelegramCommand>();
const selectedAction = computed(() => actions.value.find(item => item.key === command.value?.actionKey));
const recordKind = ref<'deliveries' | 'executions'>('deliveries');
const channelNotice = ref<api.TelegramChannelNoticeConfig>();
const templateName = ref('');
const environmentNotice = ref<api.EnvironmentNoticeConfig>();
async function saveNoticeGroups(key: 'CHANNEL_NOTICE' | 'ENV_SUMMARY', ids: string[] | null) {
  if (ids === null || saving.value || !hasAuth('telegram:update')) return;
  saving.value = true;
  try {
    const result = await api.saveTelegramNoticeRoute(key, { targetIds: ids });
    if (result.error) return;
    if (key === 'CHANNEL_NOTICE' && channelNotice.value) channelNotice.value.targetIds = ids;
    if (key === 'ENV_SUMMARY' && environmentNotice.value) environmentNotice.value.summaryTargetIds = ids;
    window.$message?.success('接收群已保存');
  } finally { saving.value = false; }
}

async function loadEnvironmentNotice() {
  const result = await api.fetchEnvironmentNotice();
  if (!result.error) environmentNotice.value = result.data;
}
async function saveEnvironmentNotice() {
  if (!environmentNotice.value || saving.value) return;
  saving.value = true;
  try {
    const result = await api.saveEnvironmentNotice(environmentNotice.value);
    if (!result.error) { environmentNotice.value = result.data; window.$message?.success('环境通知设置已保存'); }
  } finally { saving.value = false; }
}

const current = ref(1);
const total = ref(0);
const status = ref('');
const targetFilter = ref('');
const dates = ref<[string, string] | null>(null);
const { query: recordQuery, applyQuery: applyRecordQuery } = useTableQuery(() => ({
  status: status.value || undefined, targetId: targetFilter.value || undefined,
  from: dates.value?.[0], to: dates.value?.[1]
}));
const drawerTitle = computed(() => ({ target: '群配置', binding: '用户授权', command: '命令配置', '': '' })[drawer.value]);
const statuses = computed(() => recordKind.value === 'deliveries'
  ? ['PENDING', 'SENDING', 'SENT', 'RETRY', 'FAILED', 'UNKNOWN', 'CANCELLED']
  : ['AWAITING_CONFIRMATION', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED']);
function clearSecrets() { token.value = ''; replaceBot.value = false; }
let listSequence = 0;
let fetchingLists = false;
async function load(silent = false) {
  if (silent && fetchingLists) return;
  const sequence = ++listSequence;
  fetchingLists = true;
  if (!silent) loading.value = true;
  try {
    const [a, b, c, d, e] = await Promise.all([api.fetchTelegramConfig(), api.fetchTelegramTargets(), api.fetchTelegramBindings(), api.fetchTelegramCommands(), api.fetchTelegramActions()]);
    if (sequence !== listSequence || a.error || b.error || c.error || d.error || e.error) return;
    if (!silent) { config.value = a.data; enabled.value = a.data.enabled; }
    targets.value = b.data;
    bindings.value = c.data;
    commands.value = d.data;
    actions.value = e.data;
  } finally { if (sequence === listSequence) { loading.value = false; fetchingLists = false; } }
}
async function saveBot() {
  if (!config.value || saving.value) return;
  if (replaceBot.value) {
    try { await ElMessageBox.confirm('更换为另一个 Bot 会停用已有群和用户绑定，需要重新接入。确认继续？', '更换机器人', { type: 'warning' }); } catch { return; }
  }
  saving.value = true;
  try {
    const result = await api.saveTelegramConfig({ version: config.value.version, enabled: enabled.value, token: token.value || undefined, replaceBot: replaceBot.value });
    clearSecrets();
    if (!result.error) { window.$message?.success('Bot 配置已保存'); await load(); }
  } finally { saving.value = false; }
}
async function testConnection() {
  saving.value = true;
  try {
    const result = await api.testTelegramConnection();
    if (!result.error) window.$message?.[result.data.success ? 'success' : 'warning'](result.data.message);
    await load();
  } finally { saving.value = false; }
}
async function loadChannelNotice() {
  const result = await api.fetchTelegramChannelNotice();
  if (!result.error) channelNotice.value = result.data;
}
function useTemplate(item: api.NoticeTemplate, custom: boolean) {
  if (!channelNotice.value) return;
  channelNotice.value.template = item.template;
  templateName.value = custom ? item.name : '';
}
async function changeLibrary(remove = false) {
  const notice = channelNotice.value;
  const name = templateName.value.trim();
  if (!notice || !name || saving.value) return;
  if (remove || notice.savedTemplates.some(item => item.name === name)) {
    try { await ElMessageBox.confirm(`确认${remove ? '删除' : '覆盖'}自定义模板「${name}」？`, '自定义模板', { type: 'warning' }); } catch { return; }
  }
  saving.value = true;
  try {
    const result = remove ? await api.deleteTelegramChannelNoticeTemplate(name) : await api.saveTelegramChannelNoticeTemplate({ name, template: notice.template });
    if (result.error) return;
    notice.savedTemplates = result.data.savedTemplates;
    templateName.value = remove ? '' : name;
    window.$message?.success(remove ? '模板已删除，当前通知不变' : '模板已存入模板库，当前通知不变');
  } finally { saving.value = false; }
}
const testingNotice = ref(false);
async function testChannelNotice() {
  if (!channelNotice.value || testingNotice.value) return;
  testingNotice.value = true;
  try {
    const result = await api.testTelegramChannelNotice(channelNotice.value.template);
    if (!result.error) window.$message?.success(`已提交 ${result.data.messages} 条测试消息，目标群或话题：${result.data.targets} 个。可在投递记录查看结果。`);
  } finally { testingNotice.value = false; }
}
async function saveChannelNotice() {
  if (!channelNotice.value || saving.value) return;
  saving.value = true;
  try {
    const result = await api.saveTelegramChannelNotice(channelNotice.value);
    if (!result.error) { channelNotice.value = result.data; window.$message?.success('通道通知配置已保存'); }
  } finally { saving.value = false; }
}
function editTarget(row: api.TelegramTarget) { target.value = JSON.parse(JSON.stringify(row)); drawer.value = 'target'; }
function editBinding(row: api.TelegramBinding) { binding.value = JSON.parse(JSON.stringify(row)); drawer.value = 'binding'; }
function editCommand(row?: api.TelegramCommand) {
  command.value = row ? JSON.parse(JSON.stringify(row)) : { id: '', version: 0, name: '', description: '', actionKey: 'help', enabled: false, allowedTargetIds: [], allowedBindingIds: [], confirmRequired: false, defaults: {} };
  drawer.value = 'command';
}
async function save() {
  if (saving.value) return;
  await validate();
  saving.value = true;
  try {
    let result;
    if (drawer.value === 'target' && target.value) {
      const { id, version, name, enabled: on, scope } = target.value;
      result = await api.saveTelegramTarget(id, { version, name, enabled: on, scope });
    } else if (drawer.value === 'binding' && binding.value) {
      const { id, version, enabled: on, allowedTargetIds, scope } = binding.value;
      result = await api.saveTelegramBinding(id, { version, enabled: on, allowedTargetIds, scope });
    } else if (drawer.value === 'command' && command.value) {
      const { id, ...body } = command.value;
      body.confirmRequired = Boolean(selectedAction.value?.confirm || body.confirmRequired);
      if (body.actionKey !== 'incident.mute') body.defaults = {};
      result = await api.saveTelegramCommand(id || undefined, body);
    }
    if (result && !result.error) { drawer.value = ''; window.$message?.success('已保存'); await load(); }
  } finally { saving.value = false; }
}
async function remove(kind: 'target' | 'binding' | 'command', id: string) {
  try { await ElMessageBox.confirm('确认移除此配置？未完成的相关操作将失效。', '确认移除', { type: 'warning' }); } catch { return; }
  const result = await ({ target: api.deleteTelegramTarget, binding: api.deleteTelegramBinding, command: api.deleteTelegramCommand })[kind](id);
  if (!result.error) await load();
}
async function testTarget(id: string) {
  try { await ElMessageBox.confirm('将向该群或话题发送一条测试通知。', '发送测试消息'); } catch { return; }
  const result = await api.testTelegramTarget(id);
  if (!result.error) window.$message?.success('测试消息已排队，请在运行记录查看结果');
}
const { data: records, loading: recordLoading, getData: getRecords, refreshData: refreshRecords } = useUITable({
  immediate: false,
  columns: () => [],
  api: () => api.fetchTelegramRecords(recordKind.value, { ...recordQuery.value, current: current.value, size: 20 }),
  transform: result => {
    total.value = result.data!.total;
    return result.data!.records;
  }
});
async function loadRecords(reset = false) {
  if (reset) { current.value = 1; applyRecordQuery(); }
  await getRecords();
}
async function retry(row: api.TelegramRecord) {
  try { await ElMessageBox.confirm(row.status === 'UNKNOWN' ? 'Telegram 可能已经收到此消息，重试可能重复发送。确认重试？' : '确认重新排队发送此消息？', '重试投递', { type: 'warning' }); } catch { return; }
  const result = await api.retryTelegramDelivery(row.id, row.status === 'UNKNOWN');
  if (!result.error) await loadRecords();
}
// 新增的转账二维码类型显示中文名，其余类型保持原样显示
const deliveryKindNames: Record<string, string> = { ENV_SUMMARY: '环境巡检摘要', ENV_ALERT: '环境异常', ENV_SUMMARY_TEST: '环境摘要测试', ENV_ALERT_TEST: '环境异常测试', CHANNEL_NOTICE: '通道状态', CHANNEL_TEST: '通道状态测试', NOTICE_ROUTE_TEST: '通知测试', ENV_SUMMARY_PREVIEW: '环境摘要测试', ENV_ALERT_PREVIEW: '环境异常测试', TRANSFER_QR_TEST: '转账二维码测试', TRANSFER: '自动转账结果', TRANSFER_PHOTO: '转账结果截图', TRANSFER_TEXT: '自动转账结果', TRANSFER_RESULT_TEST: '转账结果测试', TRANSFER_QR: '转账二维码', TRANSFER_QR_VOID: '二维码作废' };
function kindLabel(row: api.TelegramRecord) { return row.kind ? (deliveryKindNames[row.kind] ?? row.kind) : row.actionKey; }
function switchRecords() { status.value = ''; void loadRecords(true); }
onMounted(() => { void load(); void loadChannelNotice(); void loadEnvironmentNotice(); });
onDeactivated(clearSecrets);
onUnmounted(() => { clearSecrets(); listSequence += 1; });
useAutoRefresh(() => tab.value === 'records' ? refreshRecords() : load(true), undefined,
  () => tab.value !== 'bot' && !drawer.value && !saving.value && !loading.value);
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <ElCard v-loading="loading" class="card-wrapper">
      <template #header><div class="flex flex-wrap items-center justify-between gap-8px"><span>Telegram 设置</span><ElButton v-if="tab === 'bot'" @click="load()">刷新配置</ElButton></div></template>
      <ElTabs v-model="tab" @tab-change="tab === 'records' && loadRecords(true)">
        <ElTabPane label="Bot 连接" name="bot">
          <ElAlert :closable="false" type="info" title="接入顺序：保存并启用 Bot → 私聊绑定本人 → 生成群接入码 → 设置通知接收群与命令授权。" class="mb-16px" />
          <ElDescriptions v-if="config" :column="1" border class="mb-16px">
            <ElDescriptionsItem label="机器人">{{ config.username ? `@${config.username}` : '未配置' }}</ElDescriptionsItem>
            <ElDescriptionsItem label="连接状态">{{ config.state }} · 最近心跳：{{ config.heartbeatAt ? new Date(config.heartbeatAt).toLocaleString() : '暂无' }}</ElDescriptionsItem>
            <ElDescriptionsItem v-if="config.lastError" label="连接异常">{{ config.lastError }}</ElDescriptionsItem>
            <ElDescriptionsItem v-if="config.menuError" label="命令菜单同步">{{ config.menuError }}</ElDescriptionsItem>
          </ElDescriptions>
          <ElForm label-position="top" class="max-w-640px" @submit.prevent="saveBot">
            <ElFormItem label="Bot Token"><ElInput v-model="token" type="password" show-password autocomplete="new-password" :disabled="!hasAuth('telegram:update')" :placeholder="config?.hasToken ? '已保存，留空保持现有 Token' : '输入 BotFather 提供的 Token'" /></ElFormItem>
            <ElFormItem label="启用连接"><ElSwitch v-model="enabled" :disabled="!hasAuth('telegram:update')" /></ElFormItem>
            <ElCheckbox v-if="token && config?.hasToken" v-model="replaceBot">允许更换机器人身份（将停用旧群与旧绑定）</ElCheckbox>
            <div class="mt-16px flex gap-8px"><ElButton v-if="hasAuth('telegram:update')" type="primary" :loading="saving" native-type="submit">保存配置</ElButton><ElButton v-if="hasAuth('telegram:test')" :loading="saving" :disabled="!config?.hasToken" @click="testConnection">检查连接</ElButton></div>
          </ElForm>
        </ElTabPane>
        <ElTabPane label="用户绑定" name="bindings">
          <BindingCode class="mb-16px" />
          <ElAlert :closable="false" type="info" title="本人在 Bot 私聊发送绑定命令后刷新。新绑定默认不授权，需要设置允许群和业务范围。" class="mb-16px" />
          <ElTable :data="bindings" row-key="id" border>
            <ElTableColumn prop="sysUserId" label="后台用户 ID" min-width="180" /><ElTableColumn prop="telegramUserId" label="TG 用户 ID" min-width="150" /><ElTableColumn label="状态" width="100"><template #default="{ row }">{{ row.enabled ? '已启用' : '已停用' }}</template></ElTableColumn>
            <ElTableColumn label="操作" width="170"><template #default="{ row }"><ElButton v-if="hasAuth('telegram:update')" link type="primary" @click="editBinding(row)">授权</ElButton><ElButton v-if="hasAuth('telegram:delete')" link type="danger" @click="remove('binding', row.id)">解除绑定</ElButton></template></ElTableColumn>
          </ElTable>
        </ElTabPane>
        <ElTabPane label="群绑定" name="targets">
          <BindingCode v-if="hasAuth('telegram:create')" kind="connect" class="mb-16px" />
          <ElAlert :closable="false" type="info" title="在目标群或话题发送接入命令后，待列表显示新群。新群默认停用，请配置业务范围并启用。" class="mb-16px" />
          <ElTable :data="targets" row-key="id" border>
            <ElTableColumn prop="name" label="群名称" min-width="160" /><ElTableColumn prop="chatId" label="群 ID" min-width="150" /><ElTableColumn prop="threadKey" label="话题" width="100" />
            <ElTableColumn label="状态" width="120"><template #default="{ row }">{{ !row.verified ? '需重新接入' : row.enabled ? '已启用' : '已停用' }}</template></ElTableColumn>
            <ElTableColumn prop="lastError" label="异常" min-width="160" show-overflow-tooltip />
            <ElTableColumn label="操作" min-width="210"><template #default="{ row }"><ElButton v-if="hasAuth('telegram:update')" link type="primary" @click="editTarget(row)">配置</ElButton><ElButton v-if="hasAuth('telegram:test')" link @click="testTarget(row.id)">测试发送</ElButton><ElButton v-if="hasAuth('telegram:delete')" link type="danger" @click="remove('target', row.id)">归档</ElButton></template></ElTableColumn>
          </ElTable>
        </ElTabPane>
        <ElTabPane label="通知发送设置" name="notification-routes">
          <NotificationRoutes v-if="tab === 'notification-routes'" :targets="targets" />
        </ElTabPane>
        <ElTabPane label="通道状态" name="channel-notice">
          <div v-if="channelNotice" class="grid grid-cols-1 items-start gap-24px lg:grid-cols-5">
            <div class="min-w-0 lg:col-span-3">
              <section aria-label="定时推送">
                <h2 class="mb-12px flex items-center text-16px font-semibold"><SvgIcon icon="tabler:clock" aria-hidden="true" class="mr-6px" />定时推送</h2>
                <ElForm label-position="top" :disabled="saving || !hasAuth('telegram:update')" class="flex flex-wrap items-start gap-x-32px" @submit.prevent>
                  <ElFormItem label="启用通道状态通知"><ElSwitch v-model="channelNotice.enabled" /></ElFormItem>
                  <ElFormItem label="发送间隔（分钟）"><ElInputNumber v-model="channelNotice.intervalMinutes" :min="1" :max="1440" :precision="0" /></ElFormItem>
                  <ElFormItem label="接收群或话题" class="min-w-0 flex-1 basis-240px">
                    <NoticeTargetSelect :model-value="channelNotice.targetIds" :targets="targets" @update:model-value="saveNoticeGroups('CHANNEL_NOTICE', $event)" />
                  </ElFormItem>
                </ElForm>
              </section>
              <ElDivider />
              <section aria-label="消息模板">
                <h2 class="mb-12px flex items-center text-16px font-semibold"><SvgIcon icon="tabler:file-text" aria-hidden="true" class="mr-6px" />消息模板</h2>
                <ElForm label-position="top" :disabled="saving || !hasAuth('telegram:update')" @submit.prevent>
                  <ElFormItem label="从模板库载入">
                    <ElSelect class="w-full" placeholder="选择一套模板" :model-value="undefined" value-key="template" @change="(item: api.NoticeTemplate) => useTemplate(item, channelNotice!.savedTemplates.includes(item))">
                      <ElOptionGroup label="内置模板"><ElOption v-for="item in channelNotice.presets" :key="item.name" :value="item" :label="item.name" /></ElOptionGroup>
                      <ElOptionGroup v-if="channelNotice.savedTemplates.length" label="自定义模板"><ElOption v-for="item in channelNotice.savedTemplates" :key="item.name" :value="item" :label="item.name" /></ElOptionGroup>
              </ElSelect>
                  </ElFormItem>
                  <ElFormItem label="模板正文"><ElInput v-model="channelNotice.template" type="textarea" :rows="8" maxlength="4000" show-word-limit /></ElFormItem>
                  <ElFormItem v-if="hasAuth('telegram:update')" label="自定义模板名称">
                    <div class="w-full flex flex-wrap items-center gap-8px">
                      <ElInput v-model="templateName" class="min-w-0 flex-1 basis-180px" maxlength="40" placeholder="模板名称" />
                      <ElButton :disabled="!templateName.trim() || !channelNotice.template.trim()" @click="changeLibrary()"><SvgIcon icon="tabler:bookmark" aria-hidden="true" class="mr-6px" />存入模板库</ElButton>
                      <ElButton v-if="channelNotice.savedTemplates.some(item => item.name === templateName.trim())" type="danger" plain @click="changeLibrary(true)"><SvgIcon icon="tabler:trash" aria-hidden="true" class="mr-6px" />删除模板</ElButton>
                    </div>
                  </ElFormItem>
                </ElForm>
                <div class="flex flex-wrap gap-8px">
                  <ElButton v-if="hasAuth('telegram:update')" type="primary" :loading="saving" :disabled="testingNotice || !config" @click="saveChannelNotice"><SvgIcon icon="tabler:device-floppy" aria-hidden="true" class="mr-6px" />保存通道通知</ElButton>
                  <ElButton v-if="hasAuth('telegram:test')" :disabled="saving || !config || !channelNotice.template.trim()" :loading="testingNotice" @click="testChannelNotice"><SvgIcon icon="tabler:send" aria-hidden="true" class="mr-6px" />立即测试发送到 TG</ElButton>
                </div>
              </section>
            </div>
            <NoticeFieldReference class="min-w-0 lg:col-span-2" />
          </div>
        </ElTabPane>
        <ElTabPane label="环境巡检" name="environment-notice">
          <div v-if="environmentNotice" class="grid grid-cols-1 items-start gap-24px lg:grid-cols-5">
            <div class="min-w-0 lg:col-span-3">
            <h2 class="mb-12px text-16px font-semibold">巡检摘要</h2>
            <ElForm label-position="top" :disabled="saving || !hasAuth('telegram:update')" @submit.prevent>
            <div class="flex flex-wrap gap-x-24px">
              <ElFormItem label="发送间隔（分钟）"><ElInputNumber v-model="environmentNotice.intervalMinutes" :min="1" :max="1440" :precision="0" /></ElFormItem>
              <ElFormItem label="接收群或话题" class="min-w-0 flex-1 basis-240px">
                <NoticeTargetSelect :model-value="environmentNotice.summaryTargetIds" :targets="targets" @update:model-value="saveNoticeGroups('ENV_SUMMARY', $event)" />
              </ElFormItem>
            </div>
            </ElForm>
            <EnvironmentTemplateEditor v-model="environmentNotice.summaryTemplate" kind="summary" :config="environmentNotice" :disabled="saving || !config" @library="environmentNotice.savedTemplates.summary = $event" />
            <ElButton v-if="hasAuth('telegram:update')" type="primary" :loading="saving" :disabled="!config" @click="saveEnvironmentNotice">保存环境通知</ElButton>
            </div>
            <NoticeFieldReference environment class="min-w-0 lg:col-span-2" />
          </div>
        </ElTabPane>
        <ElTabPane label="命令管理" name="commands">
          <ElAlert :closable="false" type="info" title="命令映射到内置业务动作。执行时同时校验后台权限、允许群、允许操作人和业务范围；写操作必须由本人确认。暂停/恢复仅影响账号巡检。" class="mb-16px" />
          <ElButton v-if="hasAuth('telegram:create')" class="mb-16px" type="primary" @click="editCommand()">新增命令</ElButton>
          <ElTable :data="commands" row-key="id" border>
            <ElTableColumn label="命令" min-width="140"><template #default="{ row }">/{{ row.name }}</template></ElTableColumn><ElTableColumn prop="description" label="说明" min-width="150" /><ElTableColumn prop="actionKey" label="业务动作" min-width="200" />
            <ElTableColumn label="状态" width="100"><template #default="{ row }">{{ row.enabled ? '已启用' : '已停用' }}</template></ElTableColumn>
            <ElTableColumn label="操作" width="140"><template #default="{ row }"><ElButton v-if="hasAuth('telegram:update')" link type="primary" @click="editCommand(row)">编辑</ElButton><ElButton v-if="hasAuth('telegram:delete')" link type="danger" @click="remove('command', row.id)">删除</ElButton></template></ElTableColumn>
          </ElTable>
        </ElTabPane>
        <ElTabPane label="运行记录" name="records">
          <div class="mb-16px flex flex-wrap gap-8px">
            <ElSelect v-model="recordKind" class="w-140px" @change="switchRecords"><ElOption label="投递记录" value="deliveries" /><ElOption label="命令执行" value="executions" /></ElSelect>
            <ElSelect v-model="status" clearable placeholder="全部状态" class="w-180px"><ElOption v-for="item in statuses" :key="item" :label="item" :value="item" /></ElSelect>
            <ElSelect v-model="targetFilter" clearable placeholder="全部群" class="w-180px"><ElOption v-for="item in targets" :key="item.id" :label="item.name" :value="item.id" /></ElSelect>
            <ElDatePicker v-model="dates" type="datetimerange" value-format="YYYY-MM-DDTHH:mm:ssZ" start-placeholder="开始时间" end-placeholder="结束时间" />
            <ElButton :loading="recordLoading" @click="loadRecords(true)">查询</ElButton>
          </div>
          <ElTable v-loading="recordLoading" :data="records" row-key="id" border>
            <ElTableColumn prop="createdAt" label="时间" min-width="200" /><ElTableColumn prop="status" label="状态" min-width="170" /><ElTableColumn label="类型 / 动作" min-width="150"><template #default="{ row }">{{ kindLabel(row) }}</template></ElTableColumn><ElTableColumn label="内容 / 结果" min-width="260" show-overflow-tooltip><template #default="{ row }">{{ row.text || row.result || row.error || '—' }}</template></ElTableColumn><ElTableColumn prop="error" label="错误" min-width="180" show-overflow-tooltip />
            <ElTableColumn v-if="recordKind === 'deliveries' && hasAuth('telegram:retry')" label="操作" width="90"><template #default="{ row }"><ElButton v-if="['FAILED', 'UNKNOWN'].includes(row.status) && row.kind !== 'TRANSFER_QR'" link type="primary" @click="retry(row)">重试</ElButton></template></ElTableColumn>
          </ElTable>
          <ElPagination v-model:current-page="current" class="mt-16px" :total="total" :page-size="20" layout="total, prev, pager, next" @current-change="loadRecords()" />
        </ElTabPane>
      </ElTabs>
    </ElCard>
    <ElDrawer :model-value="Boolean(drawer)" :title="drawerTitle" size="min(680px, 100vw)" destroy-on-close @close="drawer = ''">
      <ElForm ref="formRef" :model="drawer === 'target' ? target : drawer === 'binding' ? binding : command" label-position="top" @submit.prevent="save">
        <template v-if="drawer === 'target' && target">
          <ElFormItem label="群名称" prop="name" :rules="[{ required: true, message: '请输入群名称' }]"><ElInput v-model="target.name" maxlength="191" /></ElFormItem>
          <ElFormItem label="启用群"><ElSwitch v-model="target.enabled" /></ElFormItem><ElFormItem label="业务范围"><ScopeEditor v-model="target.scope" /></ElFormItem>
        </template>
        <template v-if="drawer === 'binding' && binding">
          <ElFormItem label="启用绑定"><ElSwitch v-model="binding.enabled" /></ElFormItem>
          <ElFormItem label="允许群"><ElSelect v-model="binding.allowedTargetIds" multiple class="w-full"><ElOption v-for="item in targets" :key="item.id" :label="item.name" :value="item.id" /></ElSelect></ElFormItem><ElFormItem label="业务范围"><ScopeEditor v-model="binding.scope" /></ElFormItem>
        </template>
        <template v-if="drawer === 'command' && command">
          <ElFormItem label="命令名（不含 /）" prop="name" :rules="[{ required: true, pattern: /^[a-z0-9_]{1,32}$/, message: '使用 1～32 位小写英文、数字或下划线' }]"><ElInput v-model="command.name" maxlength="32" /></ElFormItem>
          <ElFormItem label="说明" prop="description" :rules="[{ required: true, message: '请输入说明' }]"><ElInput v-model="command.description" maxlength="256" /></ElFormItem>
          <ElFormItem label="业务动作"><ElSelect v-model="command.actionKey" class="w-full"><ElOption v-for="item in actions" :key="item.key" :label="item.name" :value="item.key" /></ElSelect><span class="mt-8px text-12px text-muted">参数：{{ selectedAction?.parameter || '无' }}；权限：{{ selectedAction?.permission || '已绑定用户' }}</span></ElFormItem>
          <ElFormItem label="启用"><ElSwitch v-model="command.enabled" /></ElFormItem>
          <ElFormItem label="允许群"><ElSelect v-model="command.allowedTargetIds" multiple class="w-full"><ElOption v-for="item in targets" :key="item.id" :label="item.name" :value="item.id" /></ElSelect></ElFormItem>
          <ElFormItem label="允许操作人"><ElSelect v-model="command.allowedBindingIds" multiple class="w-full"><ElOption v-for="item in bindings" :key="item.id" :label="`${item.sysUserId} · TG ${item.telegramUserId}`" :value="item.id" /></ElSelect></ElFormItem>
          <ElFormItem label="本人二次确认"><ElSwitch :model-value="selectedAction?.confirm || command.confirmRequired" :disabled="selectedAction?.confirm" @update:model-value="command.confirmRequired = Boolean($event)" /></ElFormItem>
          <ElFormItem v-if="command.actionKey === 'incident.mute'" label="默认静默分钟"><ElInputNumber v-model="command.defaults.minutes" :min="1" :max="1440" /></ElFormItem>
          <ElAlert :closable="false" type="info" title="允许群或操作人为空时，任何人都不能执行此命令。" />
        </template>
      </ElForm>
      <template #footer><ElButton @click="drawer = ''">取消</ElButton><ElButton type="primary" :loading="saving" @click="save">保存</ElButton></template>
    </ElDrawer>
  </div>
</template>
