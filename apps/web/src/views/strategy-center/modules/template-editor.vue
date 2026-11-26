<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { saveStrategyTemplate } from '@/service/api';
import type { TemplateInput } from '@/service/api';
import ConstraintsForm from './constraints-form.vue';
import RuleForm from './rule-form.vue';
import TreeContextMenu from './tree-context-menu.vue';
import type { MenuItem } from './tree-context-menu.vue';
import {
  actionLabel,
  asTemplate,
  conditionLabel,
  defaultConfiguration,
  defaultRule,
  ruleConditionError,
  ruleConditions,
  ruleKey,
  singleConditionLabel
} from './workspace-model';

interface TemplateNode {
  id: string;
  label: string;
  index?: number;
  children?: TemplateNode[];
}
const visible = defineModel<boolean>({ required: true });
const props = defineProps<{
  initial?: TemplateInput;
  templateId?: string;
  templates: { id: string; name: string }[];
}>();
const emit = defineEmits<{ saved: [] }>();
const model = ref<TemplateInput>(asTemplate(defaultConfiguration(), ''));
const saving = ref(false);
const selected = ref<number | 'constraints'>(0);
const menu = ref<InstanceType<typeof TreeContextMenu>>();
watch(visible, value => {
  if (!value) return;
  model.value = props.initial
    ? asTemplate(props.initial, props.initial.name, props.initial.description)
    : asTemplate(defaultConfiguration(), '');
  selected.value = 0;
});
const duplicateName = computed(() =>
  props.templates.some(
    template =>
      template.id !== props.templateId &&
      template.name.trim().toLocaleLowerCase() === model.value.name.trim().toLocaleLowerCase()
  )
);
const treeNodes = computed<TemplateNode[]>(() => [
  ...model.value.rules.map((rule, index) => ({
    id: `rule:${index}`,
    index,
    label: `${index + 1}. ${rule.conditions?.length ? `全部满足（${ruleConditions(rule).length} 个条件）` : conditionLabel(rule)}`,
    children: [
      ...(rule.conditions?.length
        ? ruleConditions(rule).map((condition, conditionIndex) => ({
            id: `condition:${index}:${conditionIndex}`,
            index,
            label: `${conditionIndex ? '且 ' : ''}${singleConditionLabel(condition)}`
          }))
        : []),
      { id: `action:${index}`, index, label: actionLabel(rule) }
    ]
  })),
  {
    id: 'constraints',
    label: '执行约束',
    children: [
      { id: 'window', label: `近 ${model.value.windowMinutes} 分钟 · 最低 ${model.value.minSamples} 笔` },
      { id: 'cooldown', label: `冷却 ${model.value.cooldownSeconds} 秒` }
    ]
  }
]);
function selectNode(node: TemplateNode) {
  selected.value = node.index ?? 'constraints';
}
function addRule() {
  if (model.value.rules.length >= 20) return;
  model.value.rules.push(defaultRule());
  selected.value = model.value.rules.length - 1;
}
function move(index: number, offset: number) {
  const [rule] = model.value.rules.splice(index, 1);
  model.value.rules.splice(index + offset, 0, rule);
  selected.value = index + offset;
}
function removeRule(index: number) {
  if (model.value.rules.length <= 1) return;
  model.value.rules.splice(index, 1);
  selected.value = Math.min(index, model.value.rules.length - 1);
}
function treeMenu(event: MouseEvent, node?: TemplateNode) {
  const items: MenuItem[] = [{ label: '新增规则', disabled: model.value.rules.length >= 20, run: addRule }];
  if (node) selectNode(node);
  if (node?.index !== undefined) {
    const index = node.index;
    items.unshift(
      { label: '编辑规则条件与动作', run: () => selectNode(node) },
      { label: '上移规则', disabled: index === 0, run: () => move(index, -1) },
      { label: '下移规则', disabled: index === model.value.rules.length - 1, run: () => move(index, 1) },
      { label: '删除规则', danger: true, disabled: model.value.rules.length <= 1, run: () => removeRule(index) }
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
async function save() {
  if (saving.value) return;
  if (!model.value.name.trim()) {
    window.$message?.warning('请填写模板名称');
    return;
  }
  if (duplicateName.value) {
    window.$message?.warning('模板名称已存在，请使用其他名称');
    return;
  }
  const error = model.value.rules.map(ruleConditionError).find(Boolean);
  if (error) {
    window.$message?.warning(error);
    return;
  }
  const predicates = model.value.rules.map(ruleKey);
  if (new Set(predicates).size !== predicates.length) {
    window.$message?.warning('已有相同判断条件，请修改原规则');
    return;
  }
  saving.value = true;
  try {
    const response = await saveStrategyTemplate(model.value, props.templateId);
    if (!response.error) {
      visible.value = false;
      window.$message?.success('模板已保存，已应用的策略组保持各自规则');
      emit('saved');
    }
  } finally {
    saving.value = false;
  }
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
          <ElInput v-model.trim="model.name" maxlength="100" placeholder="模板名称不可重复" />
        </ElFormItem>
        <ElFormItem label="说明"><ElInput v-model="model.description" maxlength="500" /></ElFormItem>
      </ElForm>
      <div class="template-workspace">
        <section class="template-tree" @contextmenu.prevent="treeMenu($event)">
          <div class="tree-heading">
            <strong>策略与规则</strong>
            <ElButton size="small" :disabled="model.rules.length >= 20" @click="addRule">新增规则</ElButton>
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
          <template v-if="selected !== 'constraints' && model.rules[selected]">
            <div class="properties-heading">
              <strong>编辑规则 {{ selected + 1 }}</strong>
              <ElButton link type="danger" :disabled="model.rules.length <= 1" @click="removeRule(selected)">
                删除规则
              </ElButton>
            </div>
            <RuleForm v-model="model.rules[selected]" :min-weight="model.minWeight" :max-weight="model.maxWeight" />
          </template>
          <template v-else>
            <div class="properties-heading"><strong>执行约束</strong></div>
            <ConstraintsForm :model-value="model" @update:model-value="Object.assign(model, $event)" />
          </template>
        </section>
      </div>
      <p class="template-note">
        应用模板会复制规则到策略组。修改模板不影响已应用的策略组；备用通道由各策略组独立配置。
      </p>
    </div>
    <template #footer>
      <ElButton :disabled="saving" @click="visible = false">取消</ElButton>
      <ElButton type="primary" :disabled="duplicateName" :loading="saving" @click="save">保存模板</ElButton>
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
