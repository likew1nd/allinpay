<script setup lang="ts">
import { ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import * as api from '@/service/api/telegram';
import { useAuth } from '@/hooks/business/auth';

const props = defineProps<{ kind: api.EnvironmentKind; config: api.EnvironmentNoticeConfig; disabled: boolean }>();
const template = defineModel<string>({ required: true });
const emit = defineEmits<{ library: [items: api.NoticeTemplate[]] }>();
const { hasAuth } = useAuth();
const name = ref('');
const busy = ref(false);
function select(item: api.NoticeTemplate) {
  template.value = item.template;
  name.value = props.config.savedTemplates[props.kind].includes(item) ? item.name : '';
}
async function library(remove: boolean) {
  const key = name.value.trim();
  if (!key || busy.value) return;
  if (remove || props.config.savedTemplates[props.kind].some(item => item.name === key)) {
    try { await ElMessageBox.confirm('确认' + (remove ? '删除' : '覆盖') + '模板「' + key + '」？', '环境模板库'); } catch { return; }
  }
  busy.value = true;
  try {
    const result = await api.editEnvironmentTemplate(props.kind, key, remove ? undefined : template.value);
    if (!result.error) { emit('library', result.data); if (remove) name.value = ''; window.$message?.success('模板库已更新，推送配置未改变'); }
  } finally { busy.value = false; }
}
async function send() {
  if (busy.value) return;
  busy.value = true;
  try {
    const result = await api.testEnvironmentNotice(props.kind, template.value);
    if (!result.error) window.$message?.success('已提交 ' + result.data.messages + ' 条消息，目标群或话题：' + result.data.targets + ' 个。可在运行记录查看结果。');
  } finally { busy.value = false; }
}
</script>
<template>
  <ElForm label-position="top" :disabled="disabled || busy || !hasAuth('telegram:update')" @submit.prevent>
    <ElFormItem label="从模板库载入">
      <ElSelect :model-value="undefined" placeholder="选择一套模板" value-key="name" @change="select">
        <ElOptionGroup label="内置模板"><ElOption v-for="item in config.presets[kind]" :key="item.name" :value="item" :label="item.name" /></ElOptionGroup>
        <ElOptionGroup v-if="config.savedTemplates[kind].length" label="自定义模板"><ElOption v-for="item in config.savedTemplates[kind]" :key="item.name" :value="item" :label="item.name" /></ElOptionGroup>
      </ElSelect>
    </ElFormItem>
    <ElFormItem label="消息模板"><ElInput v-model="template" type="textarea" :rows="4" maxlength="191" show-word-limit /></ElFormItem>
    <p v-if="kind === 'summary'" class="mb-16px text-13px text-[var(--el-text-color-secondary)]">逐环境明细模板会对每个环境重复一次。余额为最近采集值；可加入 %CJSJ 显示采集时间。整组汇总字段请单独使用。</p>
    <ElFormItem v-if="hasAuth('telegram:update')" label="自定义模板名称">
      <div class="w-full flex flex-wrap gap-8px"><ElInput v-model="name" class="min-w-0 flex-1 basis-180px" placeholder="模板名称" maxlength="40" /><ElButton :disabled="!name.trim() || !template.trim()" @click="library(false)">存入模板库</ElButton><ElButton v-if="config.savedTemplates[kind].some(item => item.name === name.trim())" type="danger" plain @click="library(true)">删除模板</ElButton></div>
    </ElFormItem>
  </ElForm>
  <ElButton v-if="hasAuth('telegram:test')" :loading="busy" :disabled="disabled || !template.trim()" @click="send">立即测试发送到 TG</ElButton>
  <p class="mt-8px text-13px text-[var(--el-text-color-secondary)]">按当前模板发送至已配置的巡检摘要接收群。</p>
</template>
