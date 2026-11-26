<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import dayjs from 'dayjs';
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { fetchTransferProgressLogs, isExecutingTransfer } from '@/service/api';
import type { TransferProgressLog, TransferStatus } from '@/service/api';

const props = defineProps<{ transferId?: string; outBizNo?: string }>();
const visible = defineModel<boolean>('visible', { default: false });
const records = ref<TransferProgressLog[]>([]);
const status = ref<TransferStatus | ''>('');
const resultNote = ref<string | null>(null);
const progressAt = ref<string | null>(null);
const loading = ref(false);
const failed = ref(false);
let fetching = false;
let version = 0;

// 最新在上，和监控日志一致
const newestFirst = computed(() => [...records.value].reverse());
// 执行中且超过 30 秒没有新日志，说明脚本可能卡住
const executing = computed(() => isExecutingTransfer(status.value));
const stale = computed(() => executing.value && !!progressAt.value && Date.now() - new Date(progressAt.value).getTime() > 30_000);
// 顶部直接给出结论，不用从日志里猜是成功了还是卡住了
const summary = computed(() => {
  const map: Record<TransferStatus, { type: 'success' | 'warning' | 'info' | 'error'; title: string }> = {
    READY: { type: 'info', title: '等待采集端领取' },
    PREPARING: { type: 'info', title: '准备付款，等待中心授权' },
    CLAIMED: { type: 'info', title: '付款执行中' },
    SUCCEEDED: { type: 'success', title: '已结束：转账成功' },
    FAILED: { type: 'error', title: '已结束：转账失败（款项未转出）' },
    UNKNOWN: { type: 'warning', title: '已结束：结果未知，请核对支付宝流水后再标记结果' },
    NEEDS_MANUAL: { type: 'warning', title: '待人工处理' },
    CANCELLED: { type: 'info', title: '已取消' }
  };
  return status.value ? map[status.value] : null;
});

async function load(silent = false) {
  if (!visible.value || !props.transferId || (silent && fetching)) return;
  const current = ++version;
  fetching = true;
  if (!silent) loading.value = true;
  try {
    const result = await fetchTransferProgressLogs(props.transferId);
    if (current !== version) return;
    failed.value = Boolean(result.error);
    if (!result.error) {
      records.value = result.data.records;
      status.value = result.data.status;
      resultNote.value = result.data.resultNote;
      progressAt.value = result.data.progressAt;
    }
  } catch {
    if (current === version) failed.value = true;
  } finally {
    if (current === version) {
      loading.value = false;
      fetching = false;
    }
  }
}

watch(
  () => [visible.value, props.transferId] as const,
  () => {
    version += 1;
    loading.value = false;
    fetching = false;
    records.value = [];
    failed.value = false;
    if (visible.value) load();
  },
  { immediate: true, flush: 'sync' }
);

// 执行中按用户设置的刷新周期自动刷新，结束后不再轮询
useAutoRefresh(() => load(true), undefined, () => visible.value && (!status.value || executing.value || status.value === 'READY'));
</script>

<template>
  <ElDialog v-model="visible" title="转账执行日志" width="min(calc(100vw - 32px), 900px)" top="8vh" destroy-on-close>
    <div class="mb-12px flex flex-wrap items-center justify-between gap-12px">
      <span class="min-w-0 break-all">{{ outBizNo }}</span>
      <ElButton size="small" :loading="loading" @click="load()">刷新</ElButton>
    </div>
    <p class="text-muted mb-12px text-12px">
      脚本每 3 秒上报一次当前步骤；带 ★ 的是关键事件（页面状态变化、周期作废原因、打码结果等）。最多保留最近 300 条。
    </p>
    <ElAlert
      v-if="summary"
      class="mb-12px"
      :type="summary.type"
      show-icon
      :closable="false"
      :title="summary.title"
      :description="!executing && status !== 'READY' ? resultNote || '' : ''"
    />
    <ElAlert v-if="stale" class="mb-12px" type="error" show-icon :closable="false" title="超过 30 秒没有新日志，脚本可能已卡住或采集端已离线。" />
    <ElAlert v-if="failed" class="mb-12px" type="error" show-icon :closable="false" title="日志加载失败，请点击刷新重试。" />
    <div v-loading="loading">
      <ElScrollbar height="min(60vh, 520px)">
        <ol v-if="records.length" class="m-0 list-none p-0" role="log" aria-live="off" aria-label="转账执行日志">
          <li v-for="(entry, index) in newestFirst" :key="index" class="flex flex-wrap items-baseline gap-x-16px gap-y-4px py-6px text-14px">
            <time :datetime="entry.at" class="shrink-0 font-mono">{{ dayjs(entry.at).format('MM-DD HH:mm:ss') }}</time>
            <div
              class="min-w-0 flex-1 basis-240px whitespace-pre-wrap break-words"
              :class="{ 'font-bold': entry.message.includes('★') || entry.message.includes('【中心】'), 'text-primary': entry.message.includes('【任务结束】') }"
            >
              {{ entry.message }}
            </div>
          </li>
        </ol>
        <ElEmpty v-else-if="!loading && !failed" description="暂无日志，采集端领取并开始执行后会在这里显示。" />
      </ElScrollbar>
    </div>
    <template #footer>
      <ElButton @click="visible = false">关闭</ElButton>
    </template>
  </ElDialog>
</template>
