<script setup lang="ts">
import { computed } from 'vue';
import type { TelegramTarget } from '@/service/api/telegram';

const ids = defineModel<string[] | null>({ required: true });
const props = defineProps<{ targets: TelegramTarget[] }>();
const allTargets = '__all_eligible_targets__';
const options = computed(() => props.targets.filter(item => item.enabled && item.verified));
const unavailable = computed(() => ids.value?.filter(id => !options.value.some(item => item.id === id)) ?? []);
const selection = computed({
  get: () => ids.value ?? [allTargets],
  set: values => { ids.value = values.filter(id => id !== allTargets); }
});

function optionLabel(item: TelegramTarget) {
  return item.threadKey ? `${item.name} · 话题 #${item.threadKey}` : item.name;
}
</script>

<template>
  <ElSelect v-model="selection" multiple filterable clearable collapse-tags collapse-tags-tooltip class="w-full" placeholder="请选择接收群" no-data-text="暂无已验证并启用的群或话题">
    <ElOption v-if="ids === null" :value="allTargets" label="全部符合业务范围的群" />
    <ElOption v-for="item in options" :key="item.id" :value="item.id" :label="optionLabel(item)">
      <span>{{ optionLabel(item) }}</span>
      <span class="ml-8px text-12px text-muted">{{ item.chatId }}</span>
    </ElOption>
    <ElOption v-for="id in unavailable" :key="id" :value="id" :label="(targets.find(item => item.id === id)?.name || '原接收群') + '（不可用）'" />
  </ElSelect>
</template>
