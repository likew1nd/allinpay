<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { fetchTelegramOptions } from '@/service/api/telegram';
import type { TelegramOptions, TelegramScope } from '@/service/api/telegram';
const model = defineModel<TelegramScope>({ required: true });
defineProps<{ disabled?: boolean }>();
const options = ref<TelegramOptions>({ sites: [], collectors: [], accounts: [] });
let revision = 0;
async function search(keyword = '') {
  const current = ++revision;
  const { data, error } = await fetchTelegramOptions(keyword);
  if (!error && current === revision) options.value = data;
}
onMounted(() => search());
</script>

<template>
  <div class="w-full flex-col gap-12px">
    <ElCheckbox v-model="model.all" :disabled="disabled">允许全部业务对象</ElCheckbox>
    <template v-if="!model.all">
      <ElSelect v-model="model.siteIds" multiple filterable remote :remote-method="search" :disabled="disabled" placeholder="选择站点（可搜索）">
        <ElOption v-for="item in options.sites" :key="item.id" :value="item.id" :label="item.name" />
      </ElSelect>
      <ElSelect v-model="model.collectorIds" multiple filterable remote :remote-method="search" :disabled="disabled" placeholder="选择采集端（可搜索）">
        <ElOption v-for="item in options.collectors" :key="item.id" :value="item.id" :label="item.name" />
      </ElSelect>
      <ElSelect v-model="model.accountIds" multiple filterable remote :remote-method="search" :disabled="disabled" placeholder="选择账号（搜索 ID 或环境编号）">
        <ElOption v-for="item in options.accounts" :key="item.id" :value="item.id" :label="`${item.profileNo || '未编号'} · ${item.id}`" />
      </ElSelect>
      <span class="text-12px text-muted">同一范围内取并集；群范围与用户范围取交集。全部留空表示不授权任何对象。</span>
    </template>
  </div>
</template>
