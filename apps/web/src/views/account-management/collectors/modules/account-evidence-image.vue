<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { fetchAccountEvidence } from '@/service/api';
import type { AccountEvidenceKind } from '@/service/api';
import { $t } from '@/locales';

const props = defineProps<{
  collectorId: string;
  accountId: string;
  kind: AccountEvidenceKind;
  /** 截图采集时间；为空表示没有截图，直接显示 — */
  capturedAt: string | null;
  /** 缩略图尺寸，默认适合表格行；详情弹窗里可放大 */
  width?: number;
  height?: number;
}>();

// 同一张图（账号+类型+采集时间）只请求一次，表格刷新时不重复下载
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
  if (!props.capturedAt) return;
  const key = `${props.accountId}:${props.kind}:${props.capturedAt}`;
  let task = cache.get(key);
  if (!task) {
    task = fetchAccountEvidence(props.collectorId, props.accountId, props.kind).then(result => {
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
watch(() => [props.collectorId, props.accountId, props.kind, props.capturedAt], load);
</script>

<template>
  <span v-if="!capturedAt" class="text-muted">—</span>
  <span v-else-if="loading" class="text-muted text-12px">{{ $t('page.collector.evidenceLoading') }}</span>
  <span v-else-if="failed || !image" class="text-muted text-12px">{{ $t('page.collector.evidenceFailed') }}</span>
  <ElImage
    v-else
    :src="image"
    :preview-src-list="[image]"
    :style="{ width: `${width ?? 72}px`, height: `${height ?? 44}px` }"
    class="cursor-zoom-in rounded-4px"
    fit="cover"
    preview-teleported
    hide-on-click-modal
    :alt="$t(kind === 'restriction' ? 'page.collector.restrictionImage' : 'page.collector.judicialImage')"
  />
</template>
