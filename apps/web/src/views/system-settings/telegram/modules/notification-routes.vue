<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useAuth } from '@/hooks/business/auth';
import * as api from '@/service/api/telegram';
import NoticeTargetSelect from './notice-target-select.vue';

const props = defineProps<{ targets: api.TelegramTarget[] }>();
const { hasAuth } = useAuth();
const canEdit = computed(() => hasAuth('telegram:update'));
const canTest = computed(() => hasAuth('telegram:test'));
const routes = ref<api.TelegramNoticeRoute[]>([]);
const loading = ref(false);
const pending = reactive(new Map<string, api.TelegramNoticeRoute>());
const saving = reactive(new Set<string>());
const failed = reactive(new Set<string>());
const testing = reactive(new Set<string>());
// 测试发送成功后记下这次的消息编号，按钮随之变成「撤销测试」。
const tests = reactive(new Map<string, string[]>());
const availableIds = computed(() => new Set(props.targets.filter(target => target.enabled && target.verified).map(target => target.id)));
const groups = computed(() => {
  const current = routes.value.map(route => pending.get(route.key) ?? route);
  const primary = current.filter(route => route.kind === 'direct' || ['ACCOUNT_RESTRICTION', 'ACCOUNT_JUDICIAL'].includes(route.key));
  return [
    { title: '资金与转账', routes: primary },
    { title: '运行异常', routes: current.filter(route => !primary.includes(route)) }
  ];
});

async function load() {
  loading.value = true;
  try {
    const result = await api.fetchTelegramNoticeRoutes();
    if (!result.error) routes.value = result.data.filter(route => !['CHANNEL_NOTICE', 'ENV_SUMMARY'].includes(route.key));
  } finally {
    loading.value = false;
  }
}

function hasUnavailable(ids: string[] | null) {
  return ids?.some(id => !availableIds.value.has(id)) ?? false;
}

function hasTestTarget(route: api.TelegramNoticeRoute) {
  return route.targetIds === null ? availableIds.value.size > 0 : route.targetIds.some(id => availableIds.value.has(id));
}

async function flush(key: string) {
  if (!canEdit.value || saving.has(key)) return;
  saving.add(key);
  failed.delete(key);
  try {
    while (pending.has(key)) {
      const draft = pending.get(key);
      if (!draft || draft.targetIds === null || hasUnavailable(draft.targetIds)) break;
      const data = draft.kind === 'event' ? { recipients: draft.recipients, repeatIntervalMinutes: draft.repeatIntervalMinutes } : { targetIds: draft.targetIds };
      const result = await api.saveTelegramNoticeRoute(key, data);
      if (!result.error) routes.value = routes.value.map(route => route.key === key ? draft : route);
      // 请求期间继续勾选时，只提交该行最新草稿。
      if (pending.get(key) !== draft) continue;
      if (result.error) failed.add(key);
      else pending.delete(key);
      break;
    }
  } finally {
    saving.delete(key);
  }
}

function changeTargets(key: string, targetIds: string[] | null) {
  const saved = routes.value.find(route => route.key === key);
  const route = pending.get(key) ?? saved;
  if (!route || targetIds === null) return;
  if (route.kind === 'direct') pending.set(key, { ...route, targetIds });
  else {
    const recipients = targetIds.map(targetId => {
      const previous = route.recipients.find(item => item.targetId === targetId)
        ?? (saved?.kind === 'event' ? saved.recipients.find(item => item.targetId === targetId) : undefined);
      return { targetId, repeatIntervalMinutes: route.repeatIntervalMinutes ?? previous?.repeatIntervalMinutes ?? 0 };
    });
    const intervals = new Set(recipients.map(item => item.repeatIntervalMinutes));
    const repeatIntervalMinutes = intervals.size > 1 ? null : recipients[0]?.repeatIntervalMinutes ?? route.repeatIntervalMinutes ?? 0;
    pending.set(key, { ...route, targetIds, recipients, repeatIntervalMinutes });
  }
  void flush(key);
}

function changeInterval(key: string, minutes: number | undefined | null) {
  const route = pending.get(key) ?? routes.value.find(item => item.key === key);
  if (route?.kind !== 'event') return;
  const repeatIntervalMinutes = minutes ?? 0;
  pending.set(key, { ...route, repeatIntervalMinutes, recipients: route.recipients.map(item => ({ ...item, repeatIntervalMinutes })) });
  void flush(key);
}

async function test(route: api.TelegramNoticeRoute) {
  const { key } = route;
  if (!canTest.value || testing.has(key) || pending.has(key) || !hasTestTarget(route)) return;
  testing.add(key);
  try {
    const result = await api.testTelegramNoticeRoute(key);
    if (!result.error) {
      if (key === 'TRANSFER_QR') tests.set(key, result.data.ids);
      window.$message?.success(`已为 ${result.data.targets} 个群或话题提交测试消息` + (key === 'TRANSFER_QR' ? '，点「测试失效」可查看二维码失效效果' : '，可在运行记录查看结果'));
    }
  } finally {
    testing.delete(key);
  }
}

async function revoke(key: string) {
  const ids = tests.get(key);
  if (!ids || testing.has(key)) return;
  testing.add(key);
  try {
    const result = await api.revokeTelegramNoticeTest(ids);
    if (result.error) return;
    tests.delete(key);
    const { cancelled, revoked, failed, sending } = result.data;
    const message = `二维码已失效：取消待发送 ${cancelled} 条，已改成作废卡片 ${revoked} 条` + (failed ? `，${failed} 条处理失败（可能已被删除）` : '') + (sending ? `，${sending} 条正在发送中，稍后请再点测试失效` : '');
    if (failed || sending) window.$message?.warning(message);
    else window.$message?.success(message);
  } finally {
    testing.delete(key);
  }
}

onMounted(load);
</script>

<template>
  <ElAlert :closable="false" type="info" class="mb-16px" title="修改后自动保存。接收群留空则停发该类通知。异常的重复间隔留空时只提醒一次，填入分钟数后持续提醒，直至确认或恢复。" />
  <div v-loading="loading" class="grid items-start gap-16px" style="grid-template-columns: repeat(auto-fit, minmax(min(100%, 646px), 1fr))">
    <section v-for="group in groups" :key="group.title" :aria-label="group.title" class="min-w-0">
      <h2 class="mb-8px font-semibold">{{ group.title }}</h2>
      <ElTable :data="group.routes" row-key="key" border>
        <ElTableColumn prop="label" label="通知类型" width="222">
          <template #default="{ row }">
            <span class="inline-flex items-center gap-6px"><span aria-hidden="true">{{ row.icon }}</span>{{ row.label }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="接收群或话题" min-width="155">
          <template #default="{ row }">
            <NoticeTargetSelect :model-value="row.targetIds" :targets="targets" :aria-label="row.label + '接收群或话题'"
              :disabled="!canEdit" @update:model-value="changeTargets(row.key, $event)" />
            <div v-if="pending.has(row.key)" class="mt-4px text-muted" role="status">
              <span v-if="hasUnavailable(row.targetIds)">请先移除不可用的接收群。</span>
              <span v-else-if="saving.has(row.key)">正在保存…</span>
              <template v-else-if="failed.has(row.key)">保存失败<ElButton type="primary" link @click="flush(row.key)">重试</ElButton></template>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="间隔（分钟）" width="140" align="center">
          <template #default="{ row }">
            <ElInputNumber v-if="row.kind === 'event'" :model-value="row.repeatIntervalMinutes || undefined"
              :min="0" :max="10080" :precision="0" :controls="false" :disabled="!canEdit"
              :aria-label="row.label + '重复间隔（分钟）'" :placeholder="row.repeatIntervalMinutes === null ? '各群不同' : '仅一次'"
              class="w-full" @change="changeInterval(row.key, $event)" />
            <span v-else>—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn v-if="canTest" label="操作" width="124" align="center">
          <template #default="{ row }">
            <ElButton v-if="tests.has(row.key)" link type="warning" :aria-label="row.label + '测试失效'" :loading="testing.has(row.key)" @click="revoke(row.key)">测试失效</ElButton>
            <ElButton v-else link type="primary" :aria-label="row.label + '测试发送'" :loading="testing.has(row.key)"
              :disabled="pending.has(row.key) || !hasTestTarget(row)" @click="test(row)">测试发送</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </section>
  </div>
</template>
