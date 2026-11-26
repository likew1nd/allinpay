<script setup lang="ts">
import { nextTick, ref } from 'vue';
import type { InputInstance } from 'element-plus';

const model = defineModel<string>({ default: '' });
const props = withDefaults(defineProps<{ label: string; required?: boolean; maxLength: number; placeholder?: string; readonly?: boolean; showHint?: boolean }>(), {
  required: false,
  placeholder: '双击添加说明'
});
const editing = ref(false);
const text = ref('');
const input = ref<InputInstance>();
function start() {
  if (props.readonly) return;
  text.value = model.value;
  editing.value = true;
  nextTick(() => {
    input.value?.focus();
    input.value?.select();
  });
}
function commit() {
  if (!editing.value) return;
  const value = text.value.trim();
  if (props.required && !value) window.$message?.warning(`${props.label}不能为空`);
  else model.value = value;
  editing.value = false;
}
</script>

<template>
  <ElInput
    v-if="editing && !readonly"
    ref="input"
    v-model="text"
    class="inline-group-input"
    size="small"
    :maxlength="maxLength"
    :aria-label="label"
    @click.stop
    @dblclick.stop
    @keydown.enter.prevent.stop="commit"
    @keydown.esc.prevent.stop="editing = false"
    @blur="commit"
  />
  <span v-else-if="readonly">{{ model || (required ? '—' : '暂无说明') }}</span>
  <span v-else class="editable-group-label" @dblclick.stop="start">
    <span class="editable-label-text" :title="`${model || label}（双击编辑）`">{{ model || placeholder }}</span>
    <button type="button" class="editable-label-action" :aria-label="`编辑${label}`" :title="`编辑${label}`" @click.stop="start">
      <icon-ic-round-edit aria-hidden="true" />
      <span v-if="showHint">双击编辑</span>
    </button>
  </span>
</template>

<style scoped>
.editable-group-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  white-space: nowrap;
  vertical-align: middle;
  cursor: text;
  border-radius: 3px;
}
.editable-label-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.editable-label-action {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: none;
  padding: 3px 4px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
  cursor: pointer;
}
.editable-label-action:hover,
.editable-label-action:focus-visible {
  color: var(--el-color-primary);
}
.editable-group-label:hover,
.editable-group-label:focus-within {
  background: var(--el-fill-color-light);
  outline: 1px dashed var(--el-border-color);
}
.inline-group-input {
  width: 220px;
  max-width: 100%;
}
</style>
