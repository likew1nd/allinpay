<script setup lang="ts">
import { nextTick, ref } from 'vue';
import type { InputInstance } from 'element-plus';

const model = defineModel<string>({ default: '' });
const props = withDefaults(defineProps<{ required?: boolean; maxLength: number; placeholder?: string }>(), {
  required: false,
  placeholder: '双击添加说明'
});
const editing = ref(false);
const text = ref('');
const input = ref<InputInstance>();
function start() {
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
  if (props.required && !value) window.$message?.warning('策略组名称不能为空');
  else model.value = value;
  editing.value = false;
}
</script>

<template>
  <ElInput
    v-if="editing"
    ref="input"
    v-model="text"
    class="inline-group-input"
    size="small"
    :maxlength="maxLength"
    @click.stop
    @dblclick.stop
    @keydown.enter.prevent.stop="commit"
    @keydown.esc.prevent.stop="editing = false"
    @blur="commit"
  />
  <span
    v-else
    class="editable-group-label"
    role="button"
    tabindex="0"
    :title="`${model || placeholder}（双击编辑）`"
    @dblclick.stop="start"
    @keydown.enter.prevent.stop="start"
  >
    {{ model || placeholder }}
  </span>
</template>

<style scoped>
.editable-group-label {
  display: inline-block;
  min-width: 24px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  cursor: text;
  border-radius: 3px;
}
.editable-group-label:hover,
.editable-group-label:focus-visible {
  background: var(--el-fill-color-light);
  outline: 1px dashed var(--el-border-color);
}
.inline-group-input {
  width: 220px;
  max-width: 100%;
}
</style>
