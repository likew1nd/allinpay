<script setup lang="ts">
import { onDeactivated, onUnmounted, ref } from 'vue';
import { createTelegramCode } from '@/service/api/telegram';
const props = withDefaults(defineProps<{ kind?: 'bind' | 'connect' }>(), { kind: 'bind' });
const code = ref('');
const expiresAt = ref('');
const loading = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
function clear() { code.value = ''; expiresAt.value = ''; clearTimeout(timer); }
async function generate() {
  loading.value = true;
  clear();
  try {
    const { data, error } = await createTelegramCode(props.kind);
    if (!error) {
      code.value = data.command;
      expiresAt.value = data.expiresAt;
      timer = setTimeout(clear, Math.max(0, Date.parse(data.expiresAt) - Date.now()));
    }
  } finally { loading.value = false; }
}
onDeactivated(clear);
onUnmounted(clear);
</script>

<template>
  <div class="flex-col gap-12px">
    <div><ElButton :loading="loading" @click="generate">{{ kind === 'bind' ? '生成本人绑定码' : '生成群接入码' }}</ElButton></div>
    <template v-if="code">
      <ElAlert :closable="false" type="info" :title="kind === 'bind' ? '复制整条命令，在 Bot 私聊中发送。请勿转发给他人。' : '使用已绑定的本人 TG 账号，在目标群或话题发送整条命令。'" />
      <ElInput :model-value="code" readonly aria-label="一次性 Telegram 命令" />
      <span class="text-12px text-muted">有效期至 {{ new Date(expiresAt).toLocaleString() }}，仅可使用一次。</span>
    </template>
  </div>
</template>
