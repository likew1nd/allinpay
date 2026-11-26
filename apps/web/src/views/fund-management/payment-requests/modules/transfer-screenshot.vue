<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { fetchTransferScreenshot } from '@/service/api';

const props = defineProps<{
  transferId: string;
  /** 截图采集时间；为空表示没有截图，直接显示 — */
  screenshotAt: string | null;
  /** 缩略图尺寸，默认适合表格行；详情抽屉里可放大 */
  width?: number;
  height?: number;
}>();

// 同一张图（转账单+采集时间）只请求一次，表格每 5 秒自动刷新时不重复下载
const cache = new Map<string, Promise<string | null>>();

const image = ref<string | null>(null);
const loading = ref(false);
const failed = ref(false);
let version = 0;

async function load() {
  version += 1;
  const current = version;
  image.value = null;
  failed.value = false;
  if (!props.screenshotAt) return;
  const key = `${props.transferId}:${props.screenshotAt}`;
  let task = cache.get(key);
  if (!task) {
    task = fetchTransferScreenshot(props.transferId).then(result => {
      if (result.error) throw new Error('load failed');
      return result.data.image;
    });
    cache.set(key, task);
    // 失败不缓存，下次刷新可重试
    task.catch(() => cache.delete(key));
  }
  loading.value = true;
  try {
    const value = await task;
    if (current === version) image.value = value;
  } catch {
    if (current === version) failed.value = true;
  } finally {
    if (current === version) loading.value = false;
  }
}

onMounted(load);
watch(() => [props.transferId, props.screenshotAt], load);
</script>

<template>
  <span v-if="!screenshotAt" class="text-muted">—</span>
  <span v-else-if="loading" class="text-muted text-12px">加载中…</span>
  <span v-else-if="failed || !image" class="text-muted text-12px">加载失败</span>
  <ElImage
    v-else
    :src="image"
    :preview-src-list="[image]"
    :style="{ width: `${width ?? 72}px`, height: `${height ?? 44}px` }"
    class="cursor-zoom-in rounded-4px"
    fit="cover"
    preview-teleported
    hide-on-click-modal
    alt="转账截图"
  />
</template>
