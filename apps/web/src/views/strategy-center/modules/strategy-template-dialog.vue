<script setup lang="ts" generic="R">
import { computed, ref, watch } from 'vue';
import TreeContextMenu from './tree-context-menu.vue';
import type { MenuItem } from './tree-context-menu.vue';

interface TemplateNode {
  id: string;
  label: string;
  index?: number;
  children?: TemplateNode[];
}
const visible = defineModel<boolean>({ required: true });
const name = defineModel<string>('name', { required: true });
const description = defineModel<string | undefined>('description');
const rules = defineModel<R[]>('rules', { required: true });
const props = defineProps<{
  templateId?: string;
  templates: { id: string; name: string }[];
  treeNodes: TemplateNode[];
  newRule: () => R;
  saving: boolean;
}>();
const emit = defineEmits<{ save: [] }>();
const selected = ref<number | 'constraints'>(0);
const menu = ref<InstanceType<typeof TreeContextMenu>>();
watch(visible, open => {
  if (open) selected.value = rules.value.length ? 0 : 'constraints';
});
const duplicateName = computed(() =>
  props.templates.some(
    template =>
      template.id !== props.templateId &&
      template.name.trim().toLocaleLowerCase() === name.value.trim().toLocaleLowerCase()
  )
);
function selectNode(node: TemplateNode) {
  selected.value = node.index ?? 'constraints';
}
function addRule() {
  if (rules.value.length >= 20) return;
  rules.value.push(props.newRule());
  selected.value = rules.value.length - 1;
}
function move(index: number, offset: number) {
  const [rule] = rules.value.splice(index, 1);
  rules.value.splice(index + offset, 0, rule);
  selected.value = index + offset;
}
function removeRule(index: number) {
  if (rules.value.length <= 1) return;
  rules.value.splice(index, 1);
  selected.value = Math.min(index, rules.value.length - 1);
}
function treeMenu(event: MouseEvent, node?: TemplateNode) {
  const items: MenuItem[] = [{ label: '新增规则', disabled: rules.value.length >= 20, run: addRule }];
  if (node) selectNode(node);
  if (node?.index !== undefined) {
    const index = node.index;
    items.unshift(
      { label: '编辑规则条件与动作', run: () => selectNode(node) },
      { label: '上移规则', disabled: index === 0, run: () => move(index, -1) },
      { label: '下移规则', disabled: index === rules.value.length - 1, run: () => move(index, 1) },
      { label: '删除规则', danger: true, disabled: rules.value.length <= 1, run: () => removeRule(index) }
    );
  }
  items.push({
    label: '编辑执行约束',
    run: () => {
      selected.value = 'constraints';
    }
  });
  menu.value?.open(event, items);
}
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="templateId ? '编辑策略模板' : '新增策略模板'"
    width="min(1120px, 95vw)"
    top="5vh"
    :close-on-click-modal="false"
    :close-on-press-escape="!saving"
    :show-close="!saving"
    destroy-on-close
    class="strategy-template-dialog"
  >
    <div v-loading="saving" class="template-editor">
      <ElForm label-position="top" class="template-fields">
        <ElFormItem label="模板名称" required :error="duplicateName ? '模板名称已存在' : ''">
          <ElInput v-model.trim="name" maxlength="100" placeholder="模板名称不可重复" />
        </ElFormItem>
        <ElFormItem label="说明"><ElInput v-model="description" maxlength="500" /></ElFormItem>
      </ElForm>
      <div class="template-workspace">
        <section class="template-tree" @contextmenu.prevent="treeMenu($event)">
          <div class="tree-heading">
            <strong>策略与规则</strong>
            <ElButton size="small" :disabled="rules.length >= 20" @click="addRule">新增规则</ElButton>
          </div>
          <ElTree
            :data="treeNodes"
            node-key="id"
            :current-node-key="selected === 'constraints' ? 'constraints' : `rule:${selected}`"
            highlight-current
            default-expand-all
            :expand-on-click-node="false"
            @node-click="selectNode"
            @node-contextmenu="(event: Event, data: TemplateNode) => treeMenu(event as MouseEvent, data)"
          >
            <template #default="{ data }">
              <div class="template-tree-row">
                <span class="tree-label" :title="data.label">{{ data.label }}</span>
                <button aria-label="规则操作" class="tree-more" @click.stop="treeMenu($event, data)">⋯</button>
              </div>
            </template>
          </ElTree>
          <p class="tree-hint">点击节点编辑；右键或 ⋯ 新增、排序、删除规则。按顺序判断，只执行首条命中规则。</p>
        </section>
        <section class="template-properties">
          <template v-if="selected !== 'constraints' && rules[selected]">
            <div class="properties-heading">
              <strong>编辑规则 {{ selected + 1 }}</strong>
              <ElButton link type="danger" :disabled="rules.length <= 1" @click="removeRule(selected)">
                删除规则
              </ElButton>
            </div>
            <slot name="rule" :index="selected" />
          </template>
          <template v-else>
            <div class="properties-heading"><strong>执行约束</strong></div>
            <slot name="constraints" />
          </template>
        </section>
      </div>
      <p class="template-note">
        <slot name="note" />
      </p>
    </div>
    <slot name="feedback" />
    <template #footer>
      <ElButton :disabled="saving" @click="visible = false">取消</ElButton>
      <ElButton type="primary" :disabled="duplicateName || !name.trim()" :loading="saving" @click="emit('save')">保存模板</ElButton>
    </template>
    <TreeContextMenu ref="menu" />
  </ElDialog>
</template>

<style scoped>
.template-editor {
  max-height: 72vh;
  overflow: auto;
}
.template-fields {
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 16px;
}
.template-workspace {
  display: grid;
  grid-template-columns: minmax(240px, 0.8fr) minmax(420px, 1.5fr);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  min-height: 360px;
}
.template-tree {
  min-width: 0;
  padding: 12px;
  background: var(--el-fill-color-blank);
}
.template-properties {
  min-width: 0;
  padding: 16px;
  border-left: 1px solid var(--el-border-color);
}
.tree-heading,
.properties-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 14px;
}
.template-tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
.tree-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.tree-more {
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  font-size: 20px;
  padding: 0 6px;
}
.tree-more:hover {
  background: var(--el-fill-color);
  color: var(--el-color-primary);
}
.tree-hint,
.template-note {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
  margin: 14px 0 0;
}
:deep(.el-tree-node__content) {
  height: 34px;
}
@media (max-width: 800px) {
  .template-fields,
  .template-workspace {
    grid-template-columns: 1fr;
  }
  .template-properties {
    border-left: 0;
    border-top: 1px solid var(--el-border-color);
  }
}
</style>
